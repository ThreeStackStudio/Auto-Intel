import type { AnalysisResult, CarWithRelations } from "../types";
import { supabase } from "./supabase";

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
    .select(
      `
      id,
      user_id,
      make,
      model,
      year,
      mileage_km,
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
      `
    )
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(`Failed to load car history: ${error.message}`);
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
  imageUrls: string[];
  photoAngles: string[];
  analysisResult: AnalysisResult;
  estimatedValue: number;
};

export async function saveCarAnalysis(args: SaveCarAnalysisArgs): Promise<CarWithRelations> {
  const { userId, mileageKm, imageUrls, photoAngles, analysisResult, estimatedValue } = args;
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

    const { data: analysis, error: analysisError } = await supabase
      .from("analysis")
      .insert({
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
      })
      .select(
        `
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
        `
      )
      .single();

    if (analysisError || !analysis) {
      throw new Error(analysisError?.message ?? "Could not save analysis.");
    }

    return {
      ...car,
      images: images ?? [],
      analysis: [analysis]
    };
  } catch (error) {
    if (createdCarId) {
      await supabase.from("cars").delete().eq("id", createdCarId);
    }
    throw error;
  }
}
