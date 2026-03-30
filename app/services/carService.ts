import type { AnalysisResult, CarWithRelations } from "../types";
import { supabase } from "./supabase";

const DEFAULT_ANGLES = ["front", "rear", "left-side", "right-side", "interior"];

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
        created_at
      )
      `
    )
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(`Failed to load car history: ${error.message}`);
  }

  return (data ?? []) as CarWithRelations[];
}

type SaveCarAnalysisArgs = {
  userId: string;
  imageUrls: string[];
  analysisResult: AnalysisResult;
  estimatedValue: number;
};

export async function saveCarAnalysis(args: SaveCarAnalysisArgs): Promise<CarWithRelations> {
  const { userId, imageUrls, analysisResult, estimatedValue } = args;
  let createdCarId: string | null = null;

  try {
    const { data: car, error: carError } = await supabase
      .from("cars")
      .insert({
        user_id: userId,
        make: analysisResult.make,
        model: analysisResult.model,
        year: Number.isFinite(analysisResult.year) ? analysisResult.year : new Date().getFullYear(),
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
      angle: DEFAULT_ANGLES[index] ?? `angle-${index + 1}`
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
        summary: analysisResult.summary
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

