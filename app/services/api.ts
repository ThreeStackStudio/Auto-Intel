import type { AnalysisResult, ConditionScores } from "../types";
import { logError, logInfo } from "../utils/logger";
import { supabase } from "./supabase";

export type KnownVehicleInput = {
  make: string;
  model: string;
  year: number;
};

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

function parseYearValue(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.round(value);
  }
  if (typeof value === "string") {
    const match = value.match(/\d{4}/);
    if (match) {
      return Number(match[0]);
    }
  }
  return new Date().getFullYear();
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
  const condition = (conditionSource ?? {}) as Partial<ConditionScores>;
  const raw = (condition ?? {}) as Record<string, unknown>;

  return {
    exterior: clamp01(readNumber(raw, ["exterior", "exterior condition"], ["exterior", "paint", "scratch", "dent"])),
    interior: clamp01(readNumber(raw, ["interior", "interior condition"], ["interior", "seat", "clean"])),
    tires: clamp01(readNumber(raw, ["tires", "tire", "tire condition"], ["tire", "tread", "wheel"])),
    damage: clamp01(readNumber(raw, ["damage", "damage level"], ["damage", "accident", "misalignment"]))
  };
}

function normalizeAnalysis(payload: any, knownVehicle?: KnownVehicleInput): AnalysisResult {
  const payloadObject = (payload ?? {}) as Record<string, unknown>;

  const normalized = {
    make: String(payloadObject.make ?? "Unknown"),
    model: String(payloadObject.model ?? "Unknown"),
    year: parseYearValue(payloadObject.year ?? payloadObject["approximate year"]),
    condition: normalizeCondition(payloadObject.condition ?? payloadObject),
    confidence: clamp01(parseScoreValue(payloadObject.confidence ?? payloadObject["confidence score"]) ?? 0),
    summary: String(payloadObject.summary ?? payloadObject["short summary"] ?? "")
  };

  if (!knownVehicle) {
    return normalized;
  }

  return {
    ...normalized,
    make: knownVehicle.make,
    model: knownVehicle.model,
    year: knownVehicle.year
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

export async function analyzeCarImages(
  imageUrls: string[],
  knownVehicle?: KnownVehicleInput
): Promise<AnalysisResult> {
  const {
    data: { session }
  } = await supabase.auth.getSession();

  const accessToken = session?.access_token ?? null;
  const claims = accessToken ? decodeJwtClaims(accessToken) : null;

  logInfo("API", "Invoking analyze-car function.", {
    imageCount: imageUrls.length,
    hasAccessToken: Boolean(accessToken),
    tokenClaims: claims,
    knownVehicle
  });

  if (!accessToken) {
    throw new Error(
      "No auth access token found. Please log out and log back in, then try again."
    );
  }

  const { data, error } = await supabase.functions.invoke("analyze-car", {
    body: { imageUrls, knownVehicle },
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

  logInfo("API", "analyze-car function succeeded.");
  return normalizeAnalysis(data, knownVehicle);
}
