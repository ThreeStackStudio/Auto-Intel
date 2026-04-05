import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY");
const IMAGE_BUCKET = "car-images";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type"
};

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" }
  });
}

function getBearerToken(authorizationHeader: string | null) {
  if (!authorizationHeader) return null;
  const match = authorizationHeader.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || null;
}

function chunk<T>(items: T[], size: number) {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

function extractStoragePathFromImageUrl(imageUrl: string): string | null {
  const trimmed = imageUrl.trim();
  if (!trimmed) {
    return null;
  }

  if (!/^https?:\/\//i.test(trimmed)) {
    return trimmed.replace(/^\/+/, "");
  }

  try {
    const parsed = new URL(trimmed);
    const markers = [
      `/storage/v1/object/public/${IMAGE_BUCKET}/`,
      `/storage/v1/object/sign/${IMAGE_BUCKET}/`,
      `/storage/v1/object/authenticated/${IMAGE_BUCKET}/`,
      `/storage/v1/object/${IMAGE_BUCKET}/`
    ];

    for (const marker of markers) {
      const markerIndex = parsed.pathname.indexOf(marker);
      if (markerIndex < 0) {
        continue;
      }
      const encodedPath = parsed.pathname.slice(markerIndex + marker.length);
      const decodedPath = decodeURIComponent(encodedPath).replace(/^\/+/, "");
      return decodedPath || null;
    }
  } catch {
    return null;
  }

  return null;
}

async function listAllUserStoragePaths(
  client: ReturnType<typeof createClient>,
  userId: string
): Promise<string[]> {
  const paths: string[] = [];
  let offset = 0;
  const limit = 100;

  while (true) {
    const { data, error } = await client.storage.from(IMAGE_BUCKET).list(userId, {
      limit,
      offset,
      sortBy: { column: "name", order: "asc" }
    });

    if (error) {
      throw new Error(`Could not list storage objects: ${error.message}`);
    }

    if (!data || data.length === 0) {
      break;
    }

    for (const item of data) {
      if (item.name) {
        paths.push(`${userId}/${item.name}`);
      }
    }

    if (data.length < limit) {
      break;
    }
    offset += data.length;
  }

  return paths;
}

async function verifyPassword(email: string, password: string) {
  const apiKey = SUPABASE_ANON_KEY ?? SUPABASE_SERVICE_ROLE_KEY;

  if (!apiKey || !SUPABASE_URL) {
    throw new Error("Missing Supabase auth configuration.");
  }

  const response = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: {
      apikey: apiKey,
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ email, password })
  });

  return response.ok;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed." }, 405);
  }

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return jsonResponse({ error: "Missing function secrets." }, 500);
  }

  const accessToken = getBearerToken(req.headers.get("authorization"));
  if (!accessToken) {
    return jsonResponse({ error: "Missing Authorization token." }, 401);
  }

  const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false }
  });

  const { data: userResult, error: userError } = await adminClient.auth.getUser(accessToken);
  const user = userResult.user;

  if (userError || !user) {
    return jsonResponse({ error: "Invalid or expired token." }, 401);
  }

  if (!user.email) {
    return jsonResponse({ error: "User email not found." }, 400);
  }

  let password = "";
  try {
    const payload = (await req.json()) as Record<string, unknown>;
    password = String(payload.password ?? "").trim();
  } catch {
    return jsonResponse({ error: "Invalid JSON payload." }, 400);
  }

  if (!password) {
    return jsonResponse({ error: "Password is required." }, 400);
  }

  const isPasswordValid = await verifyPassword(user.email, password);
  if (!isPasswordValid) {
    return jsonResponse({ error: "Current password is incorrect." }, 401);
  }

  try {
    const { data: carRows, error: carsError } = await adminClient
      .from("cars")
      .select("id")
      .eq("user_id", user.id);

    if (carsError) {
      throw new Error(`Could not load user cars: ${carsError.message}`);
    }

    const carIds = (carRows ?? []).map((row) => String((row as { id: string }).id));
    const imagePathSet = new Set<string>();

    if (carIds.length > 0) {
      const { data: imageRows, error: imagesError } = await adminClient
        .from("images")
        .select("image_url")
        .in("car_id", carIds);

      if (imagesError) {
        throw new Error(`Could not load user images: ${imagesError.message}`);
      }

      for (const row of imageRows ?? []) {
        const imageUrl = String((row as { image_url?: string }).image_url ?? "");
        const path = extractStoragePathFromImageUrl(imageUrl);
        if (path) {
          imagePathSet.add(path);
        }
      }
    }

    const folderPaths = await listAllUserStoragePaths(adminClient, user.id);
    for (const path of folderPaths) {
      imagePathSet.add(path);
    }

    const imagePaths = [...imagePathSet];
    if (imagePaths.length > 0) {
      for (const group of chunk(imagePaths, 100)) {
        const { error: removeError } = await adminClient.storage.from(IMAGE_BUCKET).remove(group);
        if (removeError) {
          throw new Error(`Could not remove storage images: ${removeError.message}`);
        }
      }
    }

    const { error: deleteUserError } = await adminClient.auth.admin.deleteUser(user.id);
    if (deleteUserError) {
      throw new Error(`Could not delete auth user: ${deleteUserError.message}`);
    }

    return jsonResponse({
      success: true,
      deleted_user_id: user.id,
      deleted_storage_objects: imagePaths.length
    });
  } catch (error) {
    return jsonResponse(
      {
        error: "Failed to delete account.",
        details: error instanceof Error ? error.message : "Unknown error"
      },
      500
    );
  }
});
