import AsyncStorage from "@react-native-async-storage/async-storage";
import { useCallback, useEffect, useState } from "react";

import type { IntakeMethod, PhotoView, VinDecodeResult } from "../types";

const DRAFT_KEY = "autointel:draft_scan";

export type DraftCapturedShot = {
  publicUrl: string;
  analysisUrl: string;
  verificationConfidence: number;
};

export type DraftScan = {
  intakeMethod: IntakeMethod;
  vinInput: string;
  vinDecodedResult: VinDecodeResult | null;
  vehicleYear: string;
  vehicleMake: string;
  vehicleModel: string;
  vehicleMileageKm: string;
  userProvidedDetails: string;
  capturedShots: Partial<Record<PhotoView, DraftCapturedShot>>;
};

function normalizeText(value: unknown) {
  return String(value ?? "").trim();
}

function normalizeIntakeMethod(value: unknown): IntakeMethod {
  return value === "manual_selection" ? "manual_selection" : "vin_lookup";
}

function normalizeVinDecodeResult(value: unknown): VinDecodeResult | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const raw = value as Record<string, unknown>;
  const yearNumeric = Number(raw.year);

  return {
    vin: String(raw.vin ?? "")
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, "")
      .trim(),
    year: Number.isInteger(yearNumeric) ? yearNumeric : null,
    make: normalizeText(raw.make) || null,
    model: normalizeText(raw.model) || null,
    trim: normalizeText(raw.trim) || null,
    bodyStyle: normalizeText(raw.bodyStyle) || null,
    isPartial: Boolean(raw.isPartial),
    source: normalizeText(raw.source) || "nhtsa_vpic_decode_vin_values_extended"
  };
}

function normalizeCapturedShots(value: unknown): Partial<Record<PhotoView, DraftCapturedShot>> {
  if (!value || typeof value !== "object") {
    return {};
  }

  const out: Partial<Record<PhotoView, DraftCapturedShot>> = {};
  for (const [key, shot] of Object.entries(value as Record<string, unknown>)) {
    if (!shot || typeof shot !== "object") continue;
    const raw = shot as Record<string, unknown>;
    const publicUrl = normalizeText(raw.publicUrl);
    const analysisUrl = normalizeText(raw.analysisUrl);
    const confidence = Number(raw.verificationConfidence);

    if (!publicUrl || !analysisUrl || !Number.isFinite(confidence)) {
      continue;
    }

    out[key as PhotoView] = {
      publicUrl,
      analysisUrl,
      verificationConfidence: confidence
    };
  }

  return out;
}

function normalizeDraft(raw: unknown): DraftScan | null {
  if (!raw || typeof raw !== "object") {
    return null;
  }

  const candidate = raw as Record<string, unknown>;

  return {
    intakeMethod: normalizeIntakeMethod(candidate.intakeMethod),
    vinInput: String(candidate.vinInput ?? "")
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, "")
      .trim(),
    vinDecodedResult: normalizeVinDecodeResult(candidate.vinDecodedResult),
    vehicleYear: normalizeText(candidate.vehicleYear),
    vehicleMake: normalizeText(candidate.vehicleMake),
    vehicleModel: normalizeText(candidate.vehicleModel),
    vehicleMileageKm: normalizeText(candidate.vehicleMileageKm),
    userProvidedDetails: String(candidate.userProvidedDetails ?? ""),
    capturedShots: normalizeCapturedShots(candidate.capturedShots)
  };
}

export function useDraftScan() {
  const [draftLoaded, setDraftLoaded] = useState(false);
  const [draft, setDraft] = useState<DraftScan | null>(null);

  useEffect(() => {
    AsyncStorage.getItem(DRAFT_KEY)
      .then((raw) => {
        if (!raw) return;
        try {
          setDraft(normalizeDraft(JSON.parse(raw)));
        } catch {
          // Corrupted draft - ignore.
        }
      })
      .finally(() => setDraftLoaded(true));
  }, []);

  const saveDraft = useCallback((data: DraftScan) => {
    AsyncStorage.setItem(DRAFT_KEY, JSON.stringify(data)).catch(() => {});
  }, []);

  const clearDraft = useCallback(() => {
    setDraft(null);
    AsyncStorage.removeItem(DRAFT_KEY).catch(() => {});
  }, []);

  return { draftLoaded, draft, saveDraft, clearDraft };
}
