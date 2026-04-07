import type { MakeOption, ModelOption, VinDecodeResult } from "../types";
import { supabase } from "./supabase";

type VehicleDataMode = "decode_vin" | "list_makes" | "list_models";

function normalizeWhitespace(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function toDisplayLabel(value: string) {
  const trimmed = normalizeWhitespace(value);
  if (!trimmed) return "";

  if (trimmed === trimmed.toUpperCase() && /[A-Z]/.test(trimmed)) {
    return trimmed
      .toLowerCase()
      .replace(/\b\w/g, (char) => char.toUpperCase());
  }

  return trimmed;
}

function sanitizeVinInput(value: string) {
  return value
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .trim();
}

function isVinFormatValid(vin: string) {
  return vin.length === 17 && !/[IOQ]/.test(vin) && /^[A-Z0-9]+$/.test(vin);
}

function tryParseJson(text: string): any | null {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

async function parseFunctionErrorMessage(error: unknown) {
  const context = (error as { context?: unknown } | null)?.context;

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
          parsed?.details?.message ??
          (typeof parsed?.details === "string" ? parsed.details : undefined);
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

  return (error as { message?: string } | null)?.message ?? "Unknown function error.";
}

async function invokeVehicleData(body: Record<string, unknown>) {
  const {
    data: { session }
  } = await supabase.auth.getSession();

  const accessToken = session?.access_token ?? null;
  if (!accessToken) {
    throw new Error("No auth access token found. Please log out and log back in, then try again.");
  }

  const { data, error } = await supabase.functions.invoke("vehicle-data", {
    body,
    headers: {
      Authorization: `Bearer ${accessToken}`
    }
  });

  if (error) {
    const detailedMessage = await parseFunctionErrorMessage(error);
    throw new Error(detailedMessage);
  }

  return data as Record<string, unknown>;
}

function toNullableText(value: unknown) {
  const text = normalizeWhitespace(String(value ?? ""));
  return text.length > 0 ? text : null;
}

function toYearOrNull(value: unknown) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return null;
  if (!Number.isInteger(numeric)) return null;
  return numeric;
}

function mapOptions(items: unknown): { value: string; label: string }[] {
  if (!Array.isArray(items)) {
    return [];
  }

  const normalized = items
    .map((item) => toDisplayLabel(String(item ?? "")))
    .filter((item) => item.length > 0);
  const deduped = Array.from(new Set(normalized));

  return deduped.map((item) => ({ value: item, label: item }));
}

export async function decodeVin(vinInput: string): Promise<VinDecodeResult> {
  const vin = sanitizeVinInput(vinInput);
  if (!isVinFormatValid(vin)) {
    throw new Error("VIN must be 17 characters and cannot include I, O, or Q.");
  }

  const payload = await invokeVehicleData({
    mode: "decode_vin" satisfies VehicleDataMode,
    vin
  });

  return {
    vin: sanitizeVinInput(String(payload.vin ?? vin)),
    year: toYearOrNull(payload.year),
    make: toNullableText(payload.make),
    model: toNullableText(payload.model),
    trim: toNullableText(payload.trim),
    bodyStyle: toNullableText(payload.bodyStyle),
    isPartial: Boolean(payload.isPartial),
    source: toNullableText(payload.source) ?? "nhtsa_vpic_decode_vin_values_extended"
  };
}

export async function getMakesForYear(year: number): Promise<MakeOption[]> {
  if (!Number.isInteger(year)) {
    throw new Error("A valid year is required.");
  }

  const payload = await invokeVehicleData({
    mode: "list_makes" satisfies VehicleDataMode,
    year
  });

  return mapOptions(payload.makes);
}

export async function getModelsForYearMake(year: number, make: string): Promise<ModelOption[]> {
  const normalizedMake = normalizeWhitespace(make);
  if (!Number.isInteger(year) || !normalizedMake) {
    throw new Error("Year and make are required.");
  }

  const payload = await invokeVehicleData({
    mode: "list_models" satisfies VehicleDataMode,
    year,
    make: normalizedMake
  });

  return mapOptions(payload.models);
}

export { isVinFormatValid, sanitizeVinInput };
