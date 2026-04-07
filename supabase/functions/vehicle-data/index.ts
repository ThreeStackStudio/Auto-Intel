import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const VPIC_BASE_URL = Deno.env.get("VPIC_BASE_URL") ?? "https://vpic.nhtsa.dot.gov/api/vehicles";
const RATE_LIMIT_WINDOW_SECONDS = Number(Deno.env.get("VEHICLE_DATA_RATE_LIMIT_WINDOW_SECONDS") ?? "3600");
const RATE_LIMIT_DECODE_MAX_REQUESTS = Number(
  Deno.env.get("VEHICLE_DATA_RATE_LIMIT_DECODE_MAX_REQUESTS") ?? "120"
);
const RATE_LIMIT_MAKES_MAX_REQUESTS = Number(
  Deno.env.get("VEHICLE_DATA_RATE_LIMIT_MAKES_MAX_REQUESTS") ?? "300"
);
const RATE_LIMIT_MODELS_MAX_REQUESTS = Number(
  Deno.env.get("VEHICLE_DATA_RATE_LIMIT_MODELS_MAX_REQUESTS") ?? "300"
);

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type"
};

type FunctionMode = "decode_vin" | "list_makes" | "list_models";

type RateLimitDecision = {
  allowed: boolean;
  remaining: number;
  reset_at: string;
  retry_after_seconds: number;
  limit: number;
};

type VpicResponse = {
  Count?: number;
  Message?: string;
  Results?: unknown[];
};

const adminClient =
  SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY
    ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
        auth: { autoRefreshToken: false, persistSession: false }
      })
    : null;

function jsonResponse(body: Record<string, unknown>, status = 200, extraHeaders: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json", ...extraHeaders }
  });
}

function withHeaders(response: Response, extraHeaders: Record<string, string>) {
  const merged = new Headers(response.headers);
  for (const [key, value] of Object.entries(extraHeaders)) {
    merged.set(key, value);
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: merged
  });
}

function getBearerToken(authorizationHeader: string | null) {
  if (!authorizationHeader) return null;
  const match = authorizationHeader.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || null;
}

function resolveMode(value: unknown): FunctionMode | null {
  const mode = String(value ?? "").trim();
  if (mode === "decode_vin" || mode === "list_makes" || mode === "list_models") {
    return mode;
  }
  return null;
}

function buildRateLimitHeaders(limit: number, remaining: number, resetAt: string, retryAfterSeconds: number) {
  const headers: Record<string, string> = {
    "X-RateLimit-Limit": String(limit),
    "X-RateLimit-Remaining": String(Math.max(0, remaining)),
    "X-RateLimit-Reset": resetAt
  };

  if (retryAfterSeconds > 0) {
    headers["Retry-After"] = String(retryAfterSeconds);
  }

  return headers;
}

function ensureRateLimitConfig() {
  if (!Number.isInteger(RATE_LIMIT_WINDOW_SECONDS) || RATE_LIMIT_WINDOW_SECONDS <= 0) {
    throw new Error("Invalid VEHICLE_DATA_RATE_LIMIT_WINDOW_SECONDS.");
  }
  if (!Number.isInteger(RATE_LIMIT_DECODE_MAX_REQUESTS) || RATE_LIMIT_DECODE_MAX_REQUESTS <= 0) {
    throw new Error("Invalid VEHICLE_DATA_RATE_LIMIT_DECODE_MAX_REQUESTS.");
  }
  if (!Number.isInteger(RATE_LIMIT_MAKES_MAX_REQUESTS) || RATE_LIMIT_MAKES_MAX_REQUESTS <= 0) {
    throw new Error("Invalid VEHICLE_DATA_RATE_LIMIT_MAKES_MAX_REQUESTS.");
  }
  if (!Number.isInteger(RATE_LIMIT_MODELS_MAX_REQUESTS) || RATE_LIMIT_MODELS_MAX_REQUESTS <= 0) {
    throw new Error("Invalid VEHICLE_DATA_RATE_LIMIT_MODELS_MAX_REQUESTS.");
  }
}

function resolveRateLimitForMode(mode: FunctionMode) {
  if (mode === "decode_vin") return RATE_LIMIT_DECODE_MAX_REQUESTS;
  if (mode === "list_makes") return RATE_LIMIT_MAKES_MAX_REQUESTS;
  return RATE_LIMIT_MODELS_MAX_REQUESTS;
}

function normalizeText(value: unknown) {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeVin(vinRaw: unknown) {
  return String(vinRaw ?? "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .trim();
}

function isValidVin(vin: string) {
  if (vin.length !== 17) return false;
  if (/[IOQ]/.test(vin)) return false;
  return /^[A-Z0-9]+$/.test(vin);
}

function parseYear(value: unknown) {
  const year = Number(String(value ?? "").trim());
  if (!Number.isInteger(year)) return null;
  return year;
}

function validateYearRange(year: number) {
  const maxYear = new Date().getFullYear() + 1;
  return year >= 1981 && year <= maxYear;
}

function uniqueSorted(values: string[]) {
  return [...new Set(values)].sort((a, b) => a.localeCompare(b));
}

function isMeaningfulText(value: string) {
  if (!value) return false;
  const normalized = value.toLowerCase();
  if (
    normalized === "null" ||
    normalized === "n/a" ||
    normalized === "na" ||
    normalized === "not applicable" ||
    normalized === "0" ||
    normalized === "unknown"
  ) {
    return false;
  }
  return true;
}

async function requireAuthenticatedUser(req: Request) {
  if (!adminClient) {
    throw new Error("Missing Supabase admin function secrets.");
  }

  const accessToken = getBearerToken(req.headers.get("authorization"));
  if (!accessToken) {
    return { error: jsonResponse({ error: "Missing Authorization token." }, 401) };
  }

  const { data, error } = await adminClient.auth.getUser(accessToken);
  if (error || !data.user) {
    return { error: jsonResponse({ error: "Invalid or expired token." }, 401) };
  }

  return { user: data.user };
}

async function consumeRateLimit(userId: string, mode: FunctionMode): Promise<RateLimitDecision> {
  if (!adminClient) {
    throw new Error("Missing Supabase admin function secrets.");
  }

  ensureRateLimitConfig();
  const limit = resolveRateLimitForMode(mode);

  const { data, error } = await adminClient.rpc("consume_edge_rate_limit", {
    p_user_id: userId,
    p_function_name: "vehicle-data",
    p_mode: mode,
    p_window_seconds: RATE_LIMIT_WINDOW_SECONDS,
    p_max_requests: limit
  });

  if (error) {
    throw new Error(`Rate limit check failed: ${error.message}`);
  }

  const result = Array.isArray(data) ? data[0] : data;
  if (!result || typeof result !== "object") {
    throw new Error("Rate limit check returned an invalid payload.");
  }

  const raw = result as Record<string, unknown>;
  const allowed = Boolean(raw.allowed);
  const remaining = Number(raw.remaining ?? 0);
  const resetAt = String(raw.reset_at ?? new Date(Date.now() + RATE_LIMIT_WINDOW_SECONDS * 1000).toISOString());
  const retryAfterSeconds = Number(raw.retry_after_seconds ?? 0);

  return {
    allowed,
    remaining: Number.isFinite(remaining) ? Math.max(0, Math.floor(remaining)) : 0,
    reset_at: resetAt,
    retry_after_seconds: Number.isFinite(retryAfterSeconds) ? Math.max(0, Math.ceil(retryAfterSeconds)) : 0,
    limit
  };
}

async function fetchVpicJson(path: string) {
  const url = `${VPIC_BASE_URL}${path}${path.includes("?") ? "&" : "?"}format=json`;
  const response = await fetch(url, {
    headers: {
      Accept: "application/json",
      "User-Agent": "AutoIntel/vehicle-data-edge-function"
    }
  });

  if (!response.ok) {
    throw new Error(`vPIC request failed with ${response.status}.`);
  }

  const payload = (await response.json()) as VpicResponse;
  if (!payload || typeof payload !== "object") {
    throw new Error("vPIC returned an invalid payload.");
  }
  if (!Array.isArray(payload.Results)) {
    throw new Error("vPIC payload missing Results array.");
  }

  return payload;
}

function mapVpicString(value: unknown) {
  const text = normalizeText(value);
  return isMeaningfulText(text) ? text : null;
}

function buildDecodeVinResponse(vin: string, firstResult: Record<string, unknown>) {
  const yearCandidate = parseYear(firstResult.ModelYear);
  const year = yearCandidate && validateYearRange(yearCandidate) ? yearCandidate : null;
  const make = mapVpicString(firstResult.Make);
  const model = mapVpicString(firstResult.Model);
  const trim = mapVpicString(firstResult.Trim);
  const bodyStyle = mapVpicString(firstResult.BodyClass);
  const errorCode = normalizeText(firstResult.ErrorCode);
  const errorText = mapVpicString(firstResult.ErrorText);

  const missingCore = year === null || !make || !model;
  const hasDecodeError = errorCode !== "" && errorCode !== "0";
  const isPartial = missingCore || hasDecodeError;

  return {
    vin,
    year,
    make,
    model,
    trim,
    bodyStyle,
    isPartial,
    source: "nhtsa_vpic_decode_vin_values_extended",
    decodeMessage: errorText
  };
}

async function handleDecodeVin(input: Record<string, unknown>) {
  const vin = normalizeVin(input.vin);
  if (!vin) {
    return jsonResponse({ error: "VIN is required." }, 400);
  }
  if (!isValidVin(vin)) {
    return jsonResponse(
      {
        error: "VIN must be 17 characters and cannot include I, O, or Q."
      },
      400
    );
  }

  const payload = await fetchVpicJson(`/DecodeVinValuesExtended/${encodeURIComponent(vin)}`);
  const first = (payload.Results?.[0] ?? null) as Record<string, unknown> | null;

  if (!first || typeof first !== "object") {
    return jsonResponse(
      {
        error: "VIN decode returned no data. Please use manual vehicle selection."
      },
      502
    );
  }

  const normalized = buildDecodeVinResponse(vin, first);
  const hasAnyData = Boolean(normalized.year || normalized.make || normalized.model);

  if (!hasAnyData) {
    return jsonResponse(
      {
        error: "Could not decode this VIN. Please use manual vehicle selection.",
        vin,
        isPartial: true,
        source: normalized.source
      },
      404
    );
  }

  return jsonResponse(normalized);
}

async function handleListMakes(input: Record<string, unknown>) {
  const year = parseYear(input.year);
  if (year === null) {
    return jsonResponse({ error: "Year is required." }, 400);
  }
  if (!validateYearRange(year)) {
    return jsonResponse({ error: "Year must be between 1981 and next model year." }, 400);
  }

  const payload = await fetchVpicJson("/GetMakesForVehicleType/car");
  const makes = uniqueSorted(
    (payload.Results ?? [])
      .map((item) => {
        if (!item || typeof item !== "object") return null;
        const raw = item as Record<string, unknown>;
        return mapVpicString(raw.MakeName ?? raw.make_name ?? raw.Make_Name);
      })
      .filter((item): item is string => Boolean(item))
  );

  if (makes.length === 0) {
    return jsonResponse(
      {
        error: "Unable to load makes right now. Please try again shortly."
      },
      502
    );
  }

  return jsonResponse({
    year,
    makes,
    source: "nhtsa_vpic_get_makes_for_vehicle_type_car",
    isApproximation: true
  });
}

async function handleListModels(input: Record<string, unknown>) {
  const year = parseYear(input.year);
  const make = normalizeText(input.make);

  if (year === null) {
    return jsonResponse({ error: "Year is required." }, 400);
  }
  if (!validateYearRange(year)) {
    return jsonResponse({ error: "Year must be between 1981 and next model year." }, 400);
  }
  if (!make) {
    return jsonResponse({ error: "Make is required." }, 400);
  }

  const payload = await fetchVpicJson(
    `/GetModelsForMakeYear/make/${encodeURIComponent(make)}/modelyear/${year}`
  );
  const models = uniqueSorted(
    (payload.Results ?? [])
      .map((item) => {
        if (!item || typeof item !== "object") return null;
        const raw = item as Record<string, unknown>;
        return mapVpicString(raw.Model_Name ?? raw.model_name ?? raw.ModelName);
      })
      .filter((item): item is string => Boolean(item))
  );

  if (models.length === 0) {
    return jsonResponse(
      {
        error: `No models found for ${year} ${make}.`,
        year,
        make
      },
      404
    );
  }

  return jsonResponse({
    year,
    make,
    models,
    source: "nhtsa_vpic_get_models_for_make_year"
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed." }, 405);
  }

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !adminClient) {
    return jsonResponse({ error: "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY." }, 500);
  }

  try {
    const authResult = await requireAuthenticatedUser(req);
    if ("error" in authResult) {
      return authResult.error;
    }

    const input = (await req.json()) as Record<string, unknown>;
    const mode = resolveMode(input.mode);
    if (!mode) {
      return jsonResponse({ error: "Invalid mode. Use decode_vin, list_makes, or list_models." }, 400);
    }

    const rateLimit = await consumeRateLimit(authResult.user.id, mode);
    const rateLimitHeaders = buildRateLimitHeaders(
      rateLimit.limit,
      rateLimit.remaining,
      rateLimit.reset_at,
      rateLimit.retry_after_seconds
    );

    if (!rateLimit.allowed) {
      return jsonResponse(
        {
          error: "Rate limit exceeded for vehicle-data. Please retry later.",
          code: "rate_limit_exceeded",
          limit: rateLimit.limit,
          remaining: 0,
          reset_at: rateLimit.reset_at
        },
        429,
        rateLimitHeaders
      );
    }

    if (mode === "decode_vin") {
      const result = await handleDecodeVin(input);
      return withHeaders(result, rateLimitHeaders);
    }

    if (mode === "list_makes") {
      const result = await handleListMakes(input);
      return withHeaders(result, rateLimitHeaders);
    }

    const result = await handleListModels(input);
    return withHeaders(result, rateLimitHeaders);
  } catch (error) {
    return jsonResponse(
      {
        error: "Internal server error.",
        details: error instanceof Error ? error.message : "Unknown error"
      },
      500
    );
  }
});
