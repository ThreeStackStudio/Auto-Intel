import AsyncStorage from "@react-native-async-storage/async-storage";
import { useCallback, useEffect, useState } from "react";

import type { PhotoView } from "../types";

const DRAFT_KEY = "autointel:draft_scan";

export type DraftCapturedShot = {
  publicUrl: string;
  analysisUrl: string;
  verificationConfidence: number;
};

export type DraftScan = {
  vehicleYear: string;
  vehicleMake: string;
  vehicleModel: string;
  vehicleMileageKm: string;
  userProvidedDetails: string;
  capturedShots: Partial<Record<PhotoView, DraftCapturedShot>>;
};

export function useDraftScan() {
  const [draftLoaded, setDraftLoaded] = useState(false);
  const [draft, setDraft] = useState<DraftScan | null>(null);

  useEffect(() => {
    AsyncStorage.getItem(DRAFT_KEY)
      .then((raw) => {
        if (!raw) return;
        try {
          setDraft(JSON.parse(raw) as DraftScan);
        } catch {
          // corrupted draft — ignore
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
