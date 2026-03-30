import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
const OPENAI_MODEL = Deno.env.get("OPENAI_VISION_MODEL") ?? "gpt-4.1-mini";

const PROMPT = `You are an expert automotive appraiser.

Analyze the provided car images carefully.

Only use visible evidence. Do NOT guess hidden details.

Return a JSON object with:
- make
- model
- approximate year
- condition scores (0 to 1):
  - exterior condition (paint, scratches, dents)
  - interior condition (seats, cleanliness, wear)
  - tire condition (tread, wear)
  - damage level (accidents, misalignment, visible issues)
- confidence score (0\u20131)
- short summary (1\u20132 sentences)

Be strict and accurate.

OUTPUT ONLY JSON.`;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type"
};

type ConditionScores = {
  exterior: number;
  interior: number;
  tires: number;
  damage: number;
};

type AiResponse = {
  make: string;
  model: string;
  year: number;
  condition: ConditionScores;
  confidence: number;
  summary: string;
};

type KnownVehicle = {
  make: string;
  model: string;
  year: number;
};

function clamp01(value: number) {
  if (Number.isNaN(value)) return 0;
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

function readNumber(source: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = Number(source[key]);
    if (Number.isFinite(value)) {
      return value;
    }
  }
  return 0;
}

function normalizeKnownVehicle(input: unknown): KnownVehicle | null {
  if (!input || typeof input !== "object") return null;
  const candidate = input as Record<string, unknown>;
  const make = String(candidate.make ?? "").trim();
  const model = String(candidate.model ?? "").trim();
  const year = Number(candidate.year ?? 0);

  if (!make || !model || !Number.isFinite(year)) {
    return null;
  }

  return { make, model, year: Math.round(year) };
}

function normalizeResponse(payload: Record<string, unknown>, knownVehicle: KnownVehicle | null): AiResponse {
  const condition = (payload.condition as Record<string, unknown> | undefined) ?? {};
  const yearCandidate = Number(payload.year ?? payload["approximate year"] ?? new Date().getFullYear());
  const year = Number.isFinite(yearCandidate) ? Math.round(yearCandidate) : new Date().getFullYear();

  return {
    make: knownVehicle?.make ?? String(payload.make ?? "Unknown"),
    model: knownVehicle?.model ?? String(payload.model ?? "Unknown"),
    year: knownVehicle?.year ?? year,
    condition: {
      exterior: clamp01(readNumber(condition, ["exterior", "exterior condition"])),
      interior: clamp01(readNumber(condition, ["interior", "interior condition"])),
      tires: clamp01(readNumber(condition, ["tires", "tire", "tire condition"])),
      damage: clamp01(readNumber(condition, ["damage", "damage level"]))
    },
    confidence: clamp01(Number(payload.confidence ?? payload["confidence score"] ?? 0)),
    summary: String(payload.summary ?? "")
  };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed." }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }

  if (!OPENAI_API_KEY) {
    return new Response(JSON.stringify({ error: "Missing OPENAI_API_KEY." }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }

  try {
    const { imageUrls, knownVehicle: knownVehicleInput } = (await req.json()) as {
      imageUrls?: string[];
      knownVehicle?: unknown;
    };
    const knownVehicle = normalizeKnownVehicle(knownVehicleInput);

    if (!Array.isArray(imageUrls) || imageUrls.length === 0) {
      return new Response(JSON.stringify({ error: "imageUrls must be a non-empty array." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    const promptWithVehicleContext = knownVehicle
      ? `${PROMPT}

User-provided vehicle details (authoritative):
- make: ${knownVehicle.make}
- model: ${knownVehicle.model}
- year: ${knownVehicle.year}

Use these exact make/model/year values in your JSON output.`
      : PROMPT;

    const completionResponse = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: OPENAI_MODEL,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: promptWithVehicleContext },
              ...imageUrls.map((url) => ({
                type: "image_url",
                image_url: { url }
              }))
            ]
          }
        ],
        max_tokens: 600
      })
    });

    const completionJson = await completionResponse.json();

    if (!completionResponse.ok) {
      const upstreamMessage =
        completionJson?.error?.message ??
        completionJson?.message ??
        completionJson?.details?.error?.message ??
        "Unknown OpenAI error.";

      return new Response(
        JSON.stringify({
          error: `OpenAI request failed: ${upstreamMessage}`,
          details: completionJson
        }),
        {
          status: completionResponse.status,
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        }
      );
    }

    const content = completionJson?.choices?.[0]?.message?.content;
    if (!content || typeof content !== "string") {
      return new Response(JSON.stringify({ error: "Invalid OpenAI response format." }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    const parsed = JSON.parse(content) as Record<string, unknown>;
    const normalized = normalizeResponse(parsed, knownVehicle);

    return new Response(JSON.stringify(normalized), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  } catch (error) {
    return new Response(
      JSON.stringify({
        error: "Internal server error.",
        details: error instanceof Error ? error.message : "Unknown error"
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      }
    );
  }
});
