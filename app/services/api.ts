import type {
  AnalysisResult,
  ConditionScores,
  DetectedModification,
  MarketListing,
  MarketValuation,
  PhotoView
} from "../types";
import { logError, logInfo } from "../utils/logger";
import { supabase } from "./supabase";

export type KnownVehicleInput = {
  make: string;
  model: string;
  year: number;
  mileageKm: number;
};

export type AnalysisImageInput = {
  view: PhotoView;
  url: string;
};

export type PhotoVerificationResult = {
  requiredView: PhotoView;
  detectedView: string;
  isMatch: boolean;
  confidence: number;
  reason: string;
};

const USD_TO_CAD_RATE = 1.36;

function clamp01(value: number) {
  if (Number.isNaN(value)) return 0;
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

function parseScoreValue(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value > 1 ? value / 100 : value;
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return null;
    const match = trimmed.match(/-?\d+(\.\d+)?/);
    if (!match) return null;
    const numeric = Number(match[0]);
    if (!Number.isFinite(numeric)) return null;
    if (trimmed.includes("%") || numeric > 1) {
      return numeric / 100;
    }
    return numeric;
  }

  return null;
}

function parseRawNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string") {
    const match = value.replace(/,/g, "").match(/-?\d+(\.\d+)?/);
    if (!match) return null;
    const numeric = Number(match[0]);
    if (!Number.isFinite(numeric)) return null;
    return numeric;
  }

  return null;
}

function parseYearValue(value: unknown) {
  const numeric = parseRawNumber(value);
  if (numeric === null) {
    return new Date().getFullYear();
  }
  return Math.round(numeric);
}

function readNumber(source: Record<string, unknown>, keys: string[], fuzzyTokens: string[]) {
  for (const key of keys) {
    const parsed = parseScoreValue(source[key]);
    if (parsed !== null) {
      return parsed;
    }
  }

  for (const [rawKey, rawValue] of Object.entries(source)) {
    const key = rawKey.toLowerCase();
    if (fuzzyTokens.some((token) => key.includes(token))) {
      const parsed = parseScoreValue(rawValue);
      if (parsed !== null) {
        return parsed;
      }
    }
  }

  return 0;
}

function normalizeCondition(conditionSource: unknown): ConditionScores {
  const raw = (conditionSource ?? {}) as Record<string, unknown>;

  return {
    exterior: clamp01(readNumber(raw, ["exterior", "exterior condition"], ["exterior", "paint", "scratch", "dent"])),
    interior: clamp01(readNumber(raw, ["interior", "interior condition"], ["interior", "seat", "clean"])),
    tires: clamp01(readNumber(raw, ["tires", "tire", "tire condition"], ["tire", "tread", "wheel"])),
    damage: clamp01(readNumber(raw, ["damage", "damage level"], ["damage", "accident", "misalignment"]))
  };
}

function normalizeMods(source: unknown): DetectedModification[] {
  if (!Array.isArray(source)) {
    return [];
  }

  return source
    .map((item) => {
      const raw = (item ?? {}) as Record<string, unknown>;
      const name = String(raw.name ?? raw.mod ?? raw.modification ?? "").trim();
      if (!name) return null;

      const impactRaw = parseRawNumber(raw.impactPercent ?? raw.impact_percent ?? raw.value_impact_percent) ?? 0;
      const impact = Math.abs(impactRaw) <= 1 ? impactRaw * 100 : impactRaw;
      const confidence = parseScoreValue(raw.confidence ?? raw.confidence_score) ?? 0;
      const notes = String(raw.notes ?? raw.reason ?? "").trim();

      return {
        name,
        impactPercent: impact,
        confidence: clamp01(confidence),
        notes
      };
    })
    .filter((item): item is DetectedModification => item !== null);
}

function normalizeListings(source: unknown): MarketListing[] {
  if (!Array.isArray(source)) {
    return [];
  }

  return source
    .map((item) => {
      const raw = (item ?? {}) as Record<string, unknown>;
      const price = parseRawNumber(raw.price);
      const title = String(raw.title ?? "").trim();
      const sourceName = String(raw.source ?? "").trim();

      if (!Number.isFinite(price) || !title || !sourceName) {
        return null;
      }

      return {
        source: sourceName,
        title,
        price: (() => {
          const currency = String(raw.currency ?? "CAD").trim().toUpperCase();
          if (currency === "USD") {
            return Math.round(Number(price) * USD_TO_CAD_RATE);
          }
          return Math.round(Number(price));
        })(),
        currency: "CAD",
        url: String(raw.url ?? "").trim()
      };
    })
    .filter((item): item is MarketListing => item !== null);
}

function normalizeMarketValuation(source: unknown): MarketValuation | null {
  if (!source || typeof source !== "object") {
    return null;
  }

  const raw = source as Record<string, unknown>;
  const baseMarketValue = parseRawNumber(raw.baseMarketValue ?? raw.base_market_value) ?? 0;
  const conditionAdjustmentFactor =
    parseRawNumber(raw.conditionAdjustmentFactor ?? raw.condition_adjustment_factor) ?? 1;
  const mileageAdjustmentFactor =
    parseRawNumber(raw.mileageAdjustmentFactor ?? raw.mileage_adjustment_factor) ?? 1;
  const modsAdjustmentFactor = parseRawNumber(raw.modsAdjustmentFactor ?? raw.mods_adjustment_factor) ?? 1;
  const estimatedValue = parseRawNumber(raw.estimatedValue ?? raw.estimated_value) ?? 0;
  const lowValue = parseRawNumber(raw.lowValue ?? raw.low_value) ?? estimatedValue;
  const highValue = parseRawNumber(raw.highValue ?? raw.high_value) ?? estimatedValue;
  const listingCount = parseRawNumber(raw.listingCount ?? raw.listing_count) ?? 0;
  const method = String(raw.method ?? "heuristic").trim() || "heuristic";

  if (estimatedValue <= 0) {
    return null;
  }

  return {
    baseMarketValue: Math.round(baseMarketValue),
    conditionAdjustmentFactor,
    mileageAdjustmentFactor,
    modsAdjustmentFactor,
    estimatedValue: Math.round(estimatedValue),
    lowValue: Math.round(lowValue),
    highValue: Math.round(highValue),
    listingCount: Math.max(0, Math.round(listingCount)),
    method
  };
}

function normalizeAnalysis(payload: unknown, knownVehicle?: KnownVehicleInput): AnalysisResult {
  const payloadObject = (payload ?? {}) as Record<string, unknown>;

  const marketValuation = normalizeMarketValuation(payloadObject.market_valuation);
  const make = String(payloadObject.make ?? knownVehicle?.make ?? "Unknown");
  const model = String(payloadObject.model ?? knownVehicle?.model ?? "Unknown");
  const year = parseYearValue(payloadObject.year ?? payloadObject["approximate year"] ?? knownVehicle?.year);
  const mileageRaw = parseRawNumber(
    payloadObject.mileage_km ?? payloadObject.mileageKm ?? payloadObject.mileage ?? knownVehicle?.mileageKm
  );
  const mileageKm = mileageRaw === null ? 0 : Math.max(0, Math.round(mileageRaw));

  return {
    make,
    model,
    year,
    mileageKm,
    condition: normalizeCondition(payloadObject.condition ?? payloadObject),
    confidence: clamp01(parseScoreValue(payloadObject.confidence ?? payloadObject["confidence score"]) ?? 0),
    summary: String(payloadObject.summary ?? payloadObject["short summary"] ?? ""),
    detectedMods: normalizeMods(payloadObject.detected_mods ?? payloadObject.detectedMods),
    marketListings: normalizeListings(payloadObject.market_listings ?? payloadObject.marketListings),
    marketValuation
  };
}

function normalizePhotoVerification(payload: unknown, requiredView: PhotoView): PhotoVerificationResult {
  const raw = (payload ?? {}) as Record<string, unknown>;
  const isMatchCandidate = raw.is_match ?? raw.isMatch;
  const isMatch =
    typeof isMatchCandidate === "boolean"
      ? isMatchCandidate
      : String(isMatchCandidate ?? "")
          .trim()
          .toLowerCase() === "true";
  const confidence = clamp01(parseScoreValue(raw.confidence ?? raw.confidence_score) ?? 0);

  return {
    requiredView,
    detectedView: String(raw.detected_view ?? raw.detectedView ?? "unknown"),
    isMatch,
    confidence,
    reason: String(raw.reason ?? raw.summary ?? "")
  };
}

function tryParseJson(text: string): any | null {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function decodeJwtClaims(token: string) {
  try {
    const parts = token.split(".");
    if (parts.length < 2) return null;
    if (typeof globalThis.atob !== "function") return null;
    const payload = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const padded = payload.padEnd(Math.ceil(payload.length / 4) * 4, "=");
    const json = globalThis.atob(padded);
    const parsed = JSON.parse(json) as Record<string, unknown>;
    return {
      iss: parsed.iss,
      aud: parsed.aud,
      sub: parsed.sub,
      exp: parsed.exp
    };
  } catch {
    return null;
  }
}

async function parseFunctionErrorMessage(error: any) {
  const context = error?.context;

  if (typeof context === "string" && context.length > 0) {
    return context;
  }

  if (context && typeof context === "object") {
    const responseLike = context as {
      status?: number;
      statusText?: string;
      text?: () => Promise<string>;
      clone?: () => { text: () => Promise<string> };
    };

    const baseStatus = responseLike.status
      ? `HTTP ${responseLike.status}${responseLike.statusText ? ` ${responseLike.statusText}` : ""}`
      : "";

    try {
      const text =
        typeof responseLike.clone === "function"
          ? await responseLike.clone().text()
          : typeof responseLike.text === "function"
            ? await responseLike.text()
            : "";

      if (text) {
        const parsed = tryParseJson(text);
        const nestedError =
          parsed?.details?.error?.message ??
          parsed?.details?.message;
        const topError = parsed?.error ?? parsed?.message;
        const combinedError =
          typeof topError === "string" && typeof nestedError === "string"
            ? `${topError} | ${nestedError}`
            : nestedError ?? topError;

        if (typeof combinedError === "string" && combinedError.length > 0) {
          return baseStatus ? `${baseStatus}: ${combinedError}` : combinedError;
        }

        return baseStatus ? `${baseStatus}: ${text}` : text;
      }
    } catch {
      if (baseStatus) {
        return baseStatus;
      }
    }
  }

  return error?.message ?? "Unknown function error.";
}

async function invokeAnalyzeCar(body: Record<string, unknown>) {
  const {
    data: { session }
  } = await supabase.auth.getSession();

  const accessToken = session?.access_token ?? null;
  const claims = accessToken ? decodeJwtClaims(accessToken) : null;

  logInfo("API", "Invoking analyze-car function.", {
    hasAccessToken: Boolean(accessToken),
    tokenClaims: claims,
    mode: body.mode
  });

  if (!accessToken) {
    throw new Error(
      "No auth access token found. Please log out and log back in, then try again."
    );
  }

  const { data, error } = await supabase.functions.invoke("analyze-car", {
    body,
    headers: {
      Authorization: `Bearer ${accessToken}`
    }
  });

  if (error) {
    const detailedMessage = await parseFunctionErrorMessage(error);
    logError("API", error, {
      endpoint: "analyze-car",
      parsedMessage: detailedMessage
    });
    throw new Error(`Analysis request failed: ${detailedMessage}`);
  }

  return data;
}

export async function verifyCarPhoto(
  imageUrl: string,
  requiredView: PhotoView,
  knownVehicle?: KnownVehicleInput,
  referenceImageUrl?: string
): Promise<PhotoVerificationResult> {
  const data = await invokeAnalyzeCar({
    mode: "verify_photo",
    imageUrl,
    requiredView,
    knownVehicle,
    referenceImageUrl
  });

  return normalizePhotoVerification(data, requiredView);
}

export async function analyzeCarImages(
  imageSet: AnalysisImageInput[],
  knownVehicle?: KnownVehicleInput
): Promise<AnalysisResult> {
  logInfo("API", "analyzeCarImages called.", {
    imageCount: imageSet.length,
    knownVehicle
  });

  const data = await invokeAnalyzeCar({
    mode: "analyze_vehicle",
    imageSet,
    knownVehicle
  });

  logInfo("API", "analyze-car function succeeded.");
  return normalizeAnalysis(data, knownVehicle);
}
