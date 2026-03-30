import type { ConditionScores, DetectedModification } from "../types";

const BRAND_MULTIPLIERS: Record<string, number> = {
  toyota: 1.05,
  honda: 1.03,
  ford: 1,
  chevrolet: 0.98,
  bmw: 1.25,
  mercedes: 1.28,
  audi: 1.2,
  tesla: 1.3
};

function clampMin(value: number, min: number) {
  return value < min ? min : value;
}

export function estimateBasePrice(make: string, _model: string, year: number) {
  const currentYear = new Date().getFullYear();
  const age = Math.max(currentYear - year, 0);
  const depreciationFactor = Math.max(0.35, 1 - age * 0.06);
  const brandMultiplier = BRAND_MULTIPLIERS[make.trim().toLowerCase()] ?? 1;
  const averageMarketBase = 28000;

  return Math.round(averageMarketBase * depreciationFactor * brandMultiplier);
}

function clamp(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) return min;
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

function calculateMileageFactor(mileageKm: number, year: number) {
  const currentYear = new Date().getFullYear();
  const age = Math.max(currentYear - year, 0);
  const expectedMileage = Math.max(10_000, age * 18_000);
  const ratio = mileageKm / expectedMileage;

  if (!Number.isFinite(ratio) || ratio <= 0) return 1;
  if (ratio <= 0.8) return 1.05;
  if (ratio <= 1.15) return 1;
  if (ratio <= 1.4) return 0.95;
  return 0.88;
}

function calculateModsFactor(mods: DetectedModification[]) {
  const totalImpact = mods.reduce((sum, mod) => sum + (mod.impactPercent || 0), 0);
  return clamp(1 + totalImpact / 100, 0.8, 1.2);
}

export function calculateEstimatedValue(
  basePrice: number,
  condition: ConditionScores,
  mileageKm = 0,
  year = new Date().getFullYear(),
  mods: DetectedModification[] = []
) {
  const overallCondition = (condition.exterior + condition.interior + condition.tires) / 3;
  const qualityFactor = 0.7 + overallCondition * 0.35;
  const damagePenalty = 1 - condition.damage * 0.45;
  const mileageFactor = calculateMileageFactor(mileageKm, year);
  const modsFactor = calculateModsFactor(mods);
  const finalValue = basePrice * qualityFactor * damagePenalty * mileageFactor * modsFactor;

  return Math.round(clampMin(finalValue, 1500));
}
