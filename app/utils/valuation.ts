import type { ConditionScores } from "../types";

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

export function calculateEstimatedValue(basePrice: number, condition: ConditionScores) {
  const overallCondition = (condition.exterior + condition.interior + condition.tires) / 3;
  const qualityFactor = 0.7 + overallCondition * 0.35;
  const damagePenalty = 1 - condition.damage * 0.45;
  const finalValue = basePrice * qualityFactor * damagePenalty;

  return Math.round(clampMin(finalValue, 1500));
}

