const FALLBACK_RATE = 1.36;
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

let cachedRate = FALLBACK_RATE;
let lastFetched = 0;

export async function getUsdToCadRate(): Promise<number> {
  const now = Date.now();
  if (now - lastFetched < CACHE_TTL_MS) return cachedRate;

  try {
    const res = await fetch("https://open.er-api.com/v6/latest/USD");
    const json = await res.json() as { result?: string; rates?: Record<string, number> };
    if (json.result === "success" && typeof json.rates?.CAD === "number") {
      cachedRate = json.rates.CAD;
      lastFetched = now;
    }
  } catch {
    // keep cached/fallback rate
  }

  return cachedRate;
}
