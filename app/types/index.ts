import type { Session } from "@supabase/supabase-js";

export type RootStackParamList = {
  Auth: undefined;
  Home: undefined;
  Profile: undefined;
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

export type PhotoView =
  | "front"
  | "driver_side"
  | "passenger_side"
  | "rear"
  | "interior"
  | "tire_tread";

export type DetectedModification = {
  name: string;
  impactPercent: number;
  confidence: number;
  notes: string;
};

export type MarketListing = {
  source: string;
  title: string;
  price: number;
  currency: string;
  url: string;
};

export type MarketValuation = {
  baseMarketValue: number;
  conditionAdjustmentFactor: number;
  mileageAdjustmentFactor: number;
  modsAdjustmentFactor: number;
  estimatedValue: number;
  lowValue: number;
  highValue: number;
  listingCount: number;
  method: string;
};

export type AnalysisResult = {
  make: string;
  model: string;
  year: number;
  mileageKm: number;
  condition: ConditionScores;
  confidence: number;
  summary: string;
  detectedMods: DetectedModification[];
  marketListings: MarketListing[];
  marketValuation: MarketValuation | null;
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
  mileage_km: number | null;
  user_notes: string | null;
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
  detected_mods: DetectedModification[];
  market_listings: MarketListing[];
  base_market_value: number | null;
  condition_adjustment_factor: number | null;
  mileage_adjustment_factor: number | null;
  mods_adjustment_factor: number | null;
  low_value: number | null;
  high_value: number | null;
  created_at: string;
};

export type CarWithRelations = CarRow & {
  images: ImageRow[];
  analysis: AnalysisRow[];
};
