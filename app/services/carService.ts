import type { AnalysisResult, CarWithRelations } from "../types";
import { supabase } from "./supabase";

const HISTORY_BASE_SELECT = `
  id,
  user_id,
  make,
  model,
  year,
  mileage_km,
  user_notes,
  estimated_value,
  confidence,
  created_at,
  images (
    id,
    car_id,
    image_url,
    angle,
    created_at
  ),
  analysis (
    id,
    car_id,
    exterior_score,
    interior_score,
    tire_score,
    damage_score,
    summary,
    detected_mods,
    market_listings,
    base_market_value,
    condition_adjustment_factor,
    mileage_adjustment_factor,
    mods_adjustment_factor,
    created_at
  )
`;

const HISTORY_SELECT_WITH_RANGE = `
  id,
  user_id,
  make,
  model,
  year,
  mileage_km,
  user_notes,
  estimated_value,
  confidence,
  created_at,
  images (
    id,
    car_id,
    image_url,
    angle,
    created_at
  ),
  analysis (
    id,
    car_id,
    exterior_score,
    interior_score,
    tire_score,
    damage_score,
    summary,
    detected_mods,
    market_listings,
    base_market_value,
    condition_adjustment_factor,
    mileage_adjustment_factor,
    mods_adjustment_factor,
    low_value,
    high_value,
    created_at
  )
`;

const ANALYSIS_SELECT_BASE = `
  id,
  car_id,
  exterior_score,
  interior_score,
  tire_score,
  damage_score,
  summary,
  detected_mods,
  market_listings,
  base_market_value,
  condition_adjustment_factor,
  mileage_adjustment_factor,
  mods_adjustment_factor,
  created_at
`;

const ANALYSIS_SELECT_WITH_RANGE = `
  id,
  car_id,
  exterior_score,
  interior_score,
  tire_score,
  damage_score,
  summary,
  detected_mods,
  market_listings,
  base_market_value,
  condition_adjustment_factor,
  mileage_adjustment_factor,
  mods_adjustment_factor,
  low_value,
  high_value,
  created_at
`;

function isMissingRangeColumnError(error: { code?: string; message?: string } | null): boolean {
  if (!error) {
    return false;
  }
  if (error.code === "42703") {
    return true;
  }

  const message = (error.message ?? "").toLowerCase();
  return message.includes("low_value") || message.includes("high_value");
}

function normalizeRelationArray<T>(value: unknown): T[] {
  if (Array.isArray(value)) {
    return value as T[];
  }
  if (value && typeof value === "object") {
    return [value as T];
  }
  return [];
}

export async function fetchUserCars(): Promise<CarWithRelations[]> {
  const { data, error } = await supabase
    .from("cars")
    .select(HISTORY_SELECT_WITH_RANGE)
    .order("created_at", { ascending: false });

  if (error && !isMissingRangeColumnError(error)) {
    throw new Error(`Failed to load car history: ${error.message}`);
  }

  if (error && isMissingRangeColumnError(error)) {
    const { data: legacyData, error: legacyError } = await supabase
      .from("cars")
      .select(HISTORY_BASE_SELECT)
      .order("created_at", { ascending: false });

    if (legacyError) {
      throw new Error(`Failed to load car history: ${legacyError.message}`);
    }

    return (legacyData ?? []).map((row) => {
      const car = row as Record<string, unknown>;
      return {
        ...(car as CarWithRelations),
        images: normalizeRelationArray(car.images),
        analysis: normalizeRelationArray(car.analysis)
      };
    });
  }

  return (data ?? []).map((row) => {
    const car = row as Record<string, unknown>;
    return {
      ...(car as CarWithRelations),
      images: normalizeRelationArray(car.images),
      analysis: normalizeRelationArray(car.analysis)
    };
  });
}

type SaveCarAnalysisArgs = {
  userId: string;
  mileageKm: number;
  userNotes?: string | null;
  imageUrls: string[];
  photoAngles: string[];
  analysisResult: AnalysisResult;
  estimatedValue: number;
};

export async function saveCarAnalysis(args: SaveCarAnalysisArgs): Promise<CarWithRelations> {
  const { userId, mileageKm, userNotes, imageUrls, photoAngles, analysisResult, estimatedValue } = args;
  let createdCarId: string | null = null;

  try {
    const { data: car, error: carError } = await supabase
      .from("cars")
      .insert({
        user_id: userId,
        make: analysisResult.make,
        model: analysisResult.model,
        year: Number.isFinite(analysisResult.year) ? analysisResult.year : new Date().getFullYear(),
        mileage_km: Number.isFinite(mileageKm) ? Math.max(0, Math.round(mileageKm)) : null,
        user_notes: userNotes?.trim() ? userNotes.trim() : null,
        estimated_value: estimatedValue,
        confidence: analysisResult.confidence
      })
      .select(
        `
        id,
        user_id,
        make,
        model,
        year,
        mileage_km,
        user_notes,
        estimated_value,
        confidence,
        created_at
        `
      )
      .single();

    if (carError || !car) {
      throw new Error(carError?.message ?? "Could not save car record.");
    }

    createdCarId = car.id;

    const imageRows = imageUrls.map((imageUrl, index) => ({
      car_id: createdCarId,
      image_url: imageUrl,
      angle: photoAngles[index] ?? `angle-${index + 1}`
    }));

    const { data: images, error: imagesError } = await supabase
      .from("images")
      .insert(imageRows)
      .select(
        `
        id,
        car_id,
        image_url,
        angle,
        created_at
        `
      );

    if (imagesError) {
      throw new Error(imagesError.message);
    }

    const analysisInsert = {
      car_id: createdCarId,
      exterior_score: analysisResult.condition.exterior,
      interior_score: analysisResult.condition.interior,
      tire_score: analysisResult.condition.tires,
      damage_score: analysisResult.condition.damage,
      summary: analysisResult.summary,
      detected_mods: analysisResult.detectedMods,
      market_listings: analysisResult.marketListings,
      base_market_value: analysisResult.marketValuation?.baseMarketValue ?? null,
      condition_adjustment_factor: analysisResult.marketValuation?.conditionAdjustmentFactor ?? null,
      mileage_adjustment_factor: analysisResult.marketValuation?.mileageAdjustmentFactor ?? null,
      mods_adjustment_factor: analysisResult.marketValuation?.modsAdjustmentFactor ?? null,
      low_value: analysisResult.marketValuation?.lowValue ?? null,
      high_value: analysisResult.marketValuation?.highValue ?? null
    };

    const initialAnalysisResult = await supabase
      .from("analysis")
      .insert(analysisInsert)
      .select(ANALYSIS_SELECT_WITH_RANGE)
      .single();

    let analysis = initialAnalysisResult.data as Record<string, unknown> | null;
    let analysisError = initialAnalysisResult.error;

    if (analysisError && isMissingRangeColumnError(analysisError)) {
      const legacyAnalysisInsert = {
        car_id: createdCarId,
        exterior_score: analysisResult.condition.exterior,
        interior_score: analysisResult.condition.interior,
        tire_score: analysisResult.condition.tires,
        damage_score: analysisResult.condition.damage,
        summary: analysisResult.summary,
        detected_mods: analysisResult.detectedMods,
        market_listings: analysisResult.marketListings,
        base_market_value: analysisResult.marketValuation?.baseMarketValue ?? null,
        condition_adjustment_factor: analysisResult.marketValuation?.conditionAdjustmentFactor ?? null,
        mileage_adjustment_factor: analysisResult.marketValuation?.mileageAdjustmentFactor ?? null,
        mods_adjustment_factor: analysisResult.marketValuation?.modsAdjustmentFactor ?? null
      };

      const retry = await supabase
        .from("analysis")
        .insert(legacyAnalysisInsert)
        .select(ANALYSIS_SELECT_BASE)
        .single();

      analysis = retry.data as Record<string, unknown> | null;
      analysisError = retry.error;
    }

    if (analysisError || !analysis) {
      throw new Error(analysisError?.message ?? "Could not save analysis.");
    }

    return {
      ...car,
      images: images ?? [],
      analysis: [analysis as CarWithRelations["analysis"][number]]
    };
  } catch (error) {
    if (createdCarId) {
      await supabase.from("cars").delete().eq("id", createdCarId);
    }
    throw error;
  }
}

export async function deleteCarAnalysis(carId: string): Promise<void> {
  const trimmedId = carId.trim();
  if (!trimmedId) {
    throw new Error("Missing car id.");
  }

  const { error } = await supabase.from("cars").delete().eq("id", trimmedId);

  if (error) {
    throw new Error(`Failed to delete analysis: ${error.message}`);
  }
}
