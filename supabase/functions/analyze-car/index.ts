import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
const OPENAI_MODEL = Deno.env.get("OPENAI_VISION_MODEL") ?? "gpt-4.1-mini";
const USD_TO_CAD_RATE = Number(Deno.env.get("USD_TO_CAD_RATE") ?? "1.36");

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type"
};

type PhotoView = "front" | "driver_side" | "passenger_side" | "rear" | "interior" | "tire_tread";

type ConditionScores = {
  exterior: number;
  interior: number;
  tires: number;
  damage: number;
};

type KnownVehicle = {
  make: string;
  model: string;
  year: number;
  mileageKm: number;
};

type AnalysisImageInput = {
  view: PhotoView;
  url: string;
};

type DetectedModification = {
  name: string;
  impact_percent: number;
  confidence: number;
  notes: string;
};

type MarketListing = {
  source: string;
  title: string;
  price: number;
  currency: string;
  url: string;
};

type MarketValuation = {
  base_market_value: number;
  condition_adjustment_factor: number;
  mileage_adjustment_factor: number;
  mods_adjustment_factor: number;
  estimated_value: number;
  low_value: number;
  high_value: number;
  listing_count: number;
  method: string;
};

const REQUIRED_VIEWS = new Set<PhotoView>([
  "front",
  "driver_side",
  "passenger_side",
  "rear",
  "interior",
  "tire_tread"
]);

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" }
  });
}

function clamp01(value: number) {
  if (!Number.isFinite(value)) return 0;
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

function clamp(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) return min;
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

function parseNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string") {
    const clean = value.replace(/,/g, "").trim();
    const match = clean.match(/-?\d+(\.\d+)?/);
    if (!match) return null;
    const numeric = Number(match[0]);
    if (!Number.isFinite(numeric)) return null;
    return numeric;
  }

  return null;
}

function parseScore(value: unknown) {
  const numeric = parseNumber(value);
  if (numeric === null) return null;
  if (numeric > 1) return numeric / 100;
  return numeric;
}

function parseJsonObject(text: string) {
  const trimmed = text.trim();

  try {
    return JSON.parse(trimmed) as Record<string, unknown>;
  } catch {
    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");
    if (start >= 0 && end > start) {
      const sliced = trimmed.slice(start, end + 1);
      return JSON.parse(sliced) as Record<string, unknown>;
    }
    throw new Error("Response was not valid JSON.");
  }
}

function normalizeKnownVehicle(input: unknown): KnownVehicle | null {
  if (!input || typeof input !== "object") return null;
  const candidate = input as Record<string, unknown>;
  const make = String(candidate.make ?? "").trim();
  const model = String(candidate.model ?? "").trim();
  const year = parseNumber(candidate.year);
  const mileageRaw =
    parseNumber(candidate.mileageKm) ??
    parseNumber(candidate.mileage_km) ??
    parseNumber(candidate.mileage);

  if (!make || !model || year === null || mileageRaw === null) {
    return null;
  }

  return {
    make,
    model,
    year: Math.round(year),
    mileageKm: Math.max(0, Math.round(mileageRaw))
  };
}

function normalizeImageSet(input: unknown): AnalysisImageInput[] {
  if (!Array.isArray(input)) return [];

  return input
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const raw = item as Record<string, unknown>;
      const view = String(raw.view ?? "").trim() as PhotoView;
      const url = String(raw.url ?? "").trim();
      if (!REQUIRED_VIEWS.has(view) || !url) return null;
      return { view, url };
    })
    .filter((item): item is AnalysisImageInput => item !== null);
}

function normalizeCondition(payload: Record<string, unknown>): ConditionScores {
  const conditionRaw = (payload.condition ?? payload) as Record<string, unknown>;
  const exterior = parseScore(conditionRaw.exterior ?? conditionRaw["exterior condition"]) ?? 0;
  const interior = parseScore(conditionRaw.interior ?? conditionRaw["interior condition"]) ?? 0;
  const tires = parseScore(conditionRaw.tires ?? conditionRaw.tire ?? conditionRaw["tire condition"]) ?? 0;
  const damage = parseScore(conditionRaw.damage ?? conditionRaw["damage level"]) ?? 0;

  return {
    exterior: clamp01(exterior),
    interior: clamp01(interior),
    tires: clamp01(tires),
    damage: clamp01(damage)
  };
}

function normalizeDetectedMods(source: unknown): DetectedModification[] {
  if (!Array.isArray(source)) return [];

  return source
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const raw = item as Record<string, unknown>;
      const name = String(raw.name ?? raw.modification ?? raw.mod ?? "").trim();
      if (!name) return null;

      const impactRaw = parseNumber(raw.impact_percent ?? raw.impactPercent ?? raw.value_impact_percent) ?? 0;
      const impactPercent = Math.abs(impactRaw) <= 1 ? impactRaw * 100 : impactRaw;
      const confidence = parseScore(raw.confidence ?? raw.confidence_score) ?? 0;
      const notes = String(raw.notes ?? raw.reason ?? "").trim();

      return {
        name,
        impact_percent: clamp(impactPercent, -30, 30),
        confidence: clamp01(confidence),
        notes
      };
    })
    .filter((item): item is DetectedModification => item !== null);
}

function decodeHtmlEntities(text: string) {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/<[^>]+>/g, "")
    .trim();
}

function parseListingPrice(text: string) {
  const primaryMatch = text.match(/(?:C\$|CA\$|US\$|USD|CAD|\$)\s?\d{1,3}(?:,\d{3})+(?:\.\d{2})?/i);
  const fallbackMatch = text.match(/\$\s?\d{4,6}(?:\.\d{2})?/);
  const token = primaryMatch?.[0] ?? fallbackMatch?.[0];

  if (!token) {
    return null;
  }

  const amount = parseNumber(token);
  if (!amount || amount <= 1000) {
    return null;
  }

  const normalizedToken = token.toUpperCase();
  const normalizedText = text.toUpperCase();
  const currency =
    normalizedToken.includes("USD") ||
    normalizedToken.includes("US$") ||
    (!normalizedToken.includes("CAD") &&
      !normalizedToken.includes("C$") &&
      !normalizedToken.includes("CA$") &&
      normalizedText.includes("USD"))
      ? "USD"
      : "CAD";

  return {
    amount: Math.round(amount),
    currency
  };
}

function toCadValue(price: { amount: number; currency: string }) {
  const fx = Number.isFinite(USD_TO_CAD_RATE) && USD_TO_CAD_RATE > 0 ? USD_TO_CAD_RATE : 1.36;
  if (price.currency === "USD") {
    return Math.round(price.amount * fx);
  }
  return Math.round(price.amount);
}

function unwrapSearchResultUrl(url: string) {
  const trimmed = url.trim();
  if (!trimmed) return "";

  try {
    const candidate = trimmed.startsWith("//") ? `https:${trimmed}` : trimmed;
    const parsed = new URL(candidate, "https://duckduckgo.com");

    const uddg = parsed.searchParams.get("uddg");
    if (uddg) {
      return decodeURIComponent(uddg);
    }

    return parsed.toString();
  } catch {
    return trimmed;
  }
}

function inferSourceFromUrl(url: string) {
  const normalized = url.toLowerCase();
  if (normalized.includes("autotrader")) return "AutoTrader";
  if (normalized.includes("facebook.com/marketplace")) return "Facebook Marketplace";
  return "Marketplace";
}

function parseDuckDuckGoListings(html: string): MarketListing[] {
  const results: MarketListing[] = [];
  const linkRegex = /<a[^>]*class="result__a"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;

  let match: RegExpExecArray | null = linkRegex.exec(html);
  while (match) {
    const rawUrl = match[1] ?? "";
    const rawTitle = match[2] ?? "";
    const resolvedUrl = unwrapSearchResultUrl(rawUrl);
    const source = inferSourceFromUrl(resolvedUrl);

    if (source !== "Marketplace") {
      const title = decodeHtmlEntities(rawTitle);
      const nearbyText = html.slice(match.index, Math.min(html.length, match.index + 600));
      const snippetText = decodeHtmlEntities(nearbyText);
      const parsedPrice = parseListingPrice(`${title} ${snippetText}`);

      if (title && parsedPrice !== null) {
        results.push({
          source,
          title,
          price: toCadValue(parsedPrice),
          currency: "CAD",
          url: resolvedUrl
        });
      }
    }

    match = linkRegex.exec(html);
  }

  const dedupedByUrl = new Map<string, MarketListing>();
  for (const listing of results) {
    if (!dedupedByUrl.has(listing.url)) {
      dedupedByUrl.set(listing.url, listing);
    }
  }
  return [...dedupedByUrl.values()];
}

async function fetchListingsForQuery(query: string) {
  const url = `https://duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
  const response = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0",
      Accept: "text/html,application/xhtml+xml"
    }
  });

  if (!response.ok) {
    return [];
  }

  const html = await response.text();
  return parseDuckDuckGoListings(html);
}

async function fetchMarketListings(knownVehicle: KnownVehicle): Promise<MarketListing[]> {
  const base = `${knownVehicle.year} ${knownVehicle.make} ${knownVehicle.model}`;
  const mileageText = `${knownVehicle.mileageKm} km`;
  const queries = [
    `site:autotrader.ca ${base} ${mileageText} canada`,
    `site:autotrader.ca ${base} canada`,
    `site:facebook.com/marketplace ${base} ${mileageText} canada`,
    `site:facebook.com/marketplace ${base} canada`
  ];

  const listingGroups = await Promise.all(
    queries.map(async (query) => {
      try {
        return await fetchListingsForQuery(query);
      } catch {
        return [];
      }
    })
  );

  const flattened = listingGroups.flat();
  const deduped = new Map<string, MarketListing>();
  for (const listing of flattened) {
    if (!deduped.has(listing.url)) {
      deduped.set(listing.url, listing);
    }
  }

  return [...deduped.values()].slice(0, 10);
}

function estimateFallbackBaseValue(knownVehicle: KnownVehicle) {
  const currentYear = new Date().getFullYear();
  const age = Math.max(currentYear - knownVehicle.year, 0);
  const depreciationFactor = Math.max(0.3, 1 - age * 0.06);
  const premiumBrands = new Set(["bmw", "mercedes", "mercedes-benz", "audi", "tesla", "lexus", "porsche"]);
  const brandMultiplier = premiumBrands.has(knownVehicle.make.toLowerCase()) ? 1.2 : 1;
  const baseline = 30_000;
  return Math.round(baseline * depreciationFactor * brandMultiplier);
}

function computeMileageFactor(mileageKm: number, year: number) {
  const currentYear = new Date().getFullYear();
  const age = Math.max(currentYear - year, 0);
  const expected = Math.max(10_000, age * 18_000);
  const ratio = mileageKm / expected;

  if (!Number.isFinite(ratio) || ratio <= 0) return 1;
  if (ratio <= 0.8) return 1.06;
  if (ratio <= 1.0) return 1.02;
  if (ratio <= 1.2) return 1;
  if (ratio <= 1.4) return 0.95;
  return 0.88;
}

function computeConditionFactor(condition: ConditionScores) {
  const overall =
    condition.exterior * 0.35 +
    condition.interior * 0.25 +
    condition.tires * 0.2 +
    (1 - condition.damage) * 0.2;

  return clamp(0.72 + overall * 0.5, 0.72, 1.25);
}

function computeModsFactor(mods: DetectedModification[]) {
  const totalImpact = mods.reduce((sum, mod) => sum + mod.impact_percent, 0);
  return clamp(1 + totalImpact / 100, 0.8, 1.25);
}

function median(values: number[]) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return (sorted[mid - 1] + sorted[mid]) / 2;
  }
  return sorted[mid];
}

function buildMarketValuation(
  listings: MarketListing[],
  knownVehicle: KnownVehicle,
  condition: ConditionScores,
  mods: DetectedModification[]
): MarketValuation {
  const listingPrices = listings.map((listing) => listing.price).filter((value) => value > 0);
  const baseMarket = listingPrices.length > 0 ? median(listingPrices) : estimateFallbackBaseValue(knownVehicle);
  const conditionFactor = computeConditionFactor(condition);
  const mileageFactor = computeMileageFactor(knownVehicle.mileageKm, knownVehicle.year);
  const modsFactor = computeModsFactor(mods);
  const estimated = Math.round(baseMarket * conditionFactor * mileageFactor * modsFactor);

  const rangePercent = listingPrices.length >= 5 ? 0.08 : listingPrices.length >= 2 ? 0.1 : 0.13;
  const lowValue = Math.round(estimated * (1 - rangePercent));
  const highValue = Math.round(estimated * (1 + rangePercent));

  return {
    base_market_value: Math.round(baseMarket),
    condition_adjustment_factor: Number(conditionFactor.toFixed(4)),
    mileage_adjustment_factor: Number(mileageFactor.toFixed(4)),
    mods_adjustment_factor: Number(modsFactor.toFixed(4)),
    estimated_value: Math.max(1500, estimated),
    low_value: Math.max(1000, lowValue),
    high_value: Math.max(1500, highValue),
    listing_count: listingPrices.length,
    method: listingPrices.length > 0 ? "market_listings_plus_adjustments" : "fallback_no_direct_listings"
  };
}

async function runOpenAiJsonRequest(
  content: Array<Record<string, unknown>>,
  maxTokens = 700
): Promise<Record<string, unknown>> {
  const completionResponse = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${OPENAI_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: OPENAI_MODEL,
      response_format: { type: "json_object" },
      messages: [{ role: "user", content }],
      max_tokens: maxTokens
    })
  });

  const completionJson = await completionResponse.json();

  if (!completionResponse.ok) {
    const upstreamMessage =
      completionJson?.error?.message ??
      completionJson?.message ??
      completionJson?.details?.error?.message ??
      "Unknown OpenAI error.";
    throw new Error(`OpenAI request failed: ${upstreamMessage}`);
  }

  const responseText = completionJson?.choices?.[0]?.message?.content;
  if (!responseText || typeof responseText !== "string") {
    throw new Error("OpenAI response did not include JSON content.");
  }

  return parseJsonObject(responseText);
}

function parseBoolean(value: unknown) {
  if (typeof value === "boolean") {
    return value;
  }
  return String(value ?? "")
    .trim()
    .toLowerCase() === "true";
}

async function verifySideProfileImage(imageUrl: string) {
  const prompt = `You are validating if a vehicle image is a usable side profile.

Return ONLY JSON:
{
  "is_side_profile": true|false,
  "detected_side_hint": "driver_side|passenger_side|unknown",
  "confidence": 0 to 1,
  "reason": "one short sentence"
}

Rules:
- is_side_profile=true only if a clear exterior side profile is visible.
- If unsure, return false.
- detected_side_hint is best effort only and can be "unknown".`;

  const ai = await runOpenAiJsonRequest(
    [
      { type: "text", text: prompt },
      { type: "image_url", image_url: { url: imageUrl } }
    ],
    300
  );

  return {
    isSideProfile: parseBoolean(ai.is_side_profile ?? ai.isSideProfile),
    detectedSideHint: String(ai.detected_side_hint ?? ai.detectedSideHint ?? "unknown"),
    confidence: clamp01(parseScore(ai.confidence ?? ai.confidence_score) ?? 0),
    reason: String(ai.reason ?? ai.summary ?? "")
  };
}

async function verifyOppositeSide(referenceImageUrl: string, candidateImageUrl: string) {
  const prompt = `You are comparing two side-profile photos of a car.

Image 1: reference side (first captured side photo)
Image 2: candidate side (should be the opposite side)

Return ONLY JSON:
{
  "is_opposite_side": true|false,
  "confidence": 0 to 1,
  "reason": "one short sentence"
}

Rules:
- Return true only if the candidate clearly shows the opposite side from the reference.
- Return false if they show the same side or if uncertain.`;

  const ai = await runOpenAiJsonRequest(
    [
      { type: "text", text: prompt },
      { type: "text", text: "Image 1: reference side profile" },
      { type: "image_url", image_url: { url: referenceImageUrl } },
      { type: "text", text: "Image 2: candidate opposite side profile" },
      { type: "image_url", image_url: { url: candidateImageUrl } }
    ],
    350
  );

  return {
    isOppositeSide: parseBoolean(ai.is_opposite_side ?? ai.isOppositeSide),
    confidence: clamp01(parseScore(ai.confidence ?? ai.confidence_score) ?? 0),
    reason: String(ai.reason ?? ai.summary ?? "")
  };
}

async function handleVerifyPhoto(input: Record<string, unknown>) {
  const imageUrl = String(input.imageUrl ?? "").trim();
  const requiredView = String(input.requiredView ?? "").trim() as PhotoView;
  const referenceImageUrl = String(input.referenceImageUrl ?? "").trim();

  if (!imageUrl) {
    return jsonResponse({ error: "imageUrl is required for verify_photo mode." }, 400);
  }
  if (!REQUIRED_VIEWS.has(requiredView)) {
    return jsonResponse({ error: "requiredView is invalid." }, 400);
  }

  if (requiredView === "driver_side" || requiredView === "passenger_side") {
    const sideCheck = await verifySideProfileImage(imageUrl);
    if (!sideCheck.isSideProfile) {
      return jsonResponse({
        required_view: requiredView,
        detected_view: sideCheck.detectedSideHint,
        is_match: false,
        confidence: sideCheck.confidence,
        reason: sideCheck.reason || "Image is not a clear side profile."
      });
    }

    if (requiredView === "passenger_side" && referenceImageUrl) {
      const comparison = await verifyOppositeSide(referenceImageUrl, imageUrl);
      if (!comparison.isOppositeSide) {
        return jsonResponse({
          required_view: requiredView,
          detected_view: sideCheck.detectedSideHint,
          is_match: false,
          confidence: comparison.confidence,
          reason:
            comparison.reason || "This looks like the same side as your first side photo. Try the opposite side."
        });
      }

      return jsonResponse({
        required_view: requiredView,
        detected_view: sideCheck.detectedSideHint,
        is_match: true,
        confidence: Math.min(sideCheck.confidence, comparison.confidence),
        reason: "Verified as the opposite side of the first side photo."
      });
    }

    return jsonResponse({
      required_view: requiredView,
      detected_view: sideCheck.detectedSideHint,
      is_match: true,
      confidence: sideCheck.confidence,
      reason: "Verified side profile."
    });
  }

  const prompt = `You are validating a vehicle photo submission.

Required view: ${requiredView}

Determine if the image matches the required view. Valid views are:
- front
- driver_side
- passenger_side
- rear
- interior
- tire_tread

Rules:
- Be strict.
- If unsure, return is_match=false.
- "driver_side" means left side of the vehicle from driver's perspective.
- "passenger_side" means right side of the vehicle from driver's perspective.
- "tire_tread" requires a close enough tire shot to inspect tread wear.

Return ONLY JSON:
{
  "required_view": "<required_view>",
  "detected_view": "<best_guess_view_or_unknown>",
  "is_match": true|false,
  "confidence": 0 to 1,
  "reason": "one short sentence"
}`;

  const ai = await runOpenAiJsonRequest(
    [
      { type: "text", text: prompt },
      { type: "image_url", image_url: { url: imageUrl } }
    ],
    300
  );

  const isMatch = parseBoolean(ai.is_match ?? ai.isMatch);

  return jsonResponse({
    required_view: requiredView,
    detected_view: String(ai.detected_view ?? ai.detectedView ?? "unknown"),
    is_match: isMatch,
    confidence: clamp01(parseScore(ai.confidence ?? ai.confidence_score) ?? 0),
    reason: String(ai.reason ?? ai.summary ?? "")
  });
}

async function handleAnalyzeVehicle(input: Record<string, unknown>) {
  const knownVehicle = normalizeKnownVehicle(input.knownVehicle);
  const imageSet = normalizeImageSet(input.imageSet);
  const fallbackUrls = Array.isArray(input.imageUrls)
    ? input.imageUrls.filter((value): value is string => typeof value === "string" && value.length > 0)
    : [];
  const normalizedImageSet =
    imageSet.length > 0
      ? imageSet
      : fallbackUrls.map((url, index) => ({
          view: (index === 0 ? "front" : "interior") as PhotoView,
          url
        }));

  if (normalizedImageSet.length === 0) {
    return jsonResponse({ error: "imageSet or imageUrls must contain at least one image." }, 400);
  }

  if (!knownVehicle) {
    return jsonResponse({ error: "knownVehicle is required and must include make/model/year/mileage." }, 400);
  }

  const marketListings = await fetchMarketListings(knownVehicle);
  const marketContext =
    marketListings.length > 0
      ? marketListings
          .map(
            (listing, index) =>
              `${index + 1}. ${listing.source} | ${listing.title} | ${listing.currency} ${listing.price} | ${listing.url}`
          )
          .join("\n")
      : "No direct listings found from AutoTrader/Facebook Marketplace search results.";

  const prompt = `You are an expert automotive appraiser.

Vehicle details provided by user (authoritative):
- make: ${knownVehicle.make}
- model: ${knownVehicle.model}
- year: ${knownVehicle.year}
- mileage_km: ${knownVehicle.mileageKm}

You are given labeled vehicle photos and scraped market listing comps from AutoTrader and Facebook Marketplace.
All listing prices below are normalized to CAD.
Use only visible evidence for condition and modifications.

Listing comps:
${marketContext}

Return ONLY JSON with this shape:
{
  "condition": {
    "exterior": 0 to 1,
    "interior": 0 to 1,
    "tires": 0 to 1,
    "damage": 0 to 1
  },
  "confidence": 0 to 1,
  "summary": "2-4 sentences with key condition drivers",
  "detected_mods": [
    {
      "name": "modification name",
      "impact_percent": -15 to +15,
      "confidence": 0 to 1,
      "notes": "how this mod affects value"
    }
  ]
}`;

  const content: Array<Record<string, unknown>> = [{ type: "text", text: prompt }];
  for (const image of normalizedImageSet) {
    content.push({ type: "text", text: `Image label: ${image.view}` });
    content.push({ type: "image_url", image_url: { url: image.url } });
  }

  const ai = await runOpenAiJsonRequest(content, 900);
  const condition = normalizeCondition(ai);
  const detectedMods = normalizeDetectedMods(ai.detected_mods ?? ai.detectedMods);
  const marketValuation = buildMarketValuation(marketListings, knownVehicle, condition, detectedMods);

  return jsonResponse({
    make: knownVehicle.make,
    model: knownVehicle.model,
    year: knownVehicle.year,
    mileage_km: knownVehicle.mileageKm,
    condition,
    confidence: clamp01(parseScore(ai.confidence ?? ai.confidence_score) ?? 0),
    summary: String(ai.summary ?? ""),
    detected_mods: detectedMods,
    market_listings: marketListings,
    market_valuation: marketValuation
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed." }, 405);
  }

  if (!OPENAI_API_KEY) {
    return jsonResponse({ error: "Missing OPENAI_API_KEY." }, 500);
  }

  try {
    const input = (await req.json()) as Record<string, unknown>;
    const mode = String(input.mode ?? "analyze_vehicle");

    if (mode === "verify_photo") {
      return await handleVerifyPhoto(input);
    }

    return await handleAnalyzeVehicle(input);
  } catch (error) {
    return jsonResponse(
      {
        error: "Internal server error.",
        details: error instanceof Error ? error.message : "Unknown error"
      },
      500
    );
  }
});
