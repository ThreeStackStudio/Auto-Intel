import type { Session } from "@supabase/supabase-js";

export type RootStackParamList = {
  Auth: undefined;
  Home: undefined;
  Camera: undefined;
  Result: { car: CarWithRelations };
};

export type AppSession = Session;

export type ConditionScores = {
  exterior: number;
  interior: number;
  tires: number;
  damage: number;
};

export type AnalysisResult = {
  make: string;
  model: string;
  year: number;
  condition: ConditionScores;
  confidence: number;
  summary: string;
};

export type ProfileRow = {
  id: string;
  first_name: string;
  last_name: string;
  phone: string;
  created_at: string;
};

export type CarRow = {
  id: string;
  user_id: string;
  make: string;
  model: string;
  year: number;
  estimated_value: number;
  confidence: number;
  created_at: string;
};

export type ImageRow = {
  id: string;
  car_id: string;
  image_url: string;
  angle: string | null;
  created_at: string;
};

export type AnalysisRow = {
  id: string;
  car_id: string;
  exterior_score: number;
  interior_score: number;
  tire_score: number;
  damage_score: number;
  summary: string;
  created_at: string;
};

export type CarWithRelations = CarRow & {
  images: ImageRow[];
  analysis: AnalysisRow[];
};

