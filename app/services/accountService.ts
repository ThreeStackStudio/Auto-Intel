import { logError, logInfo } from "../utils/logger";
import type { ProfileRow } from "../types";
import { supabase } from "./supabase";

export type UserProfile = {
  email: string;
  firstName: string;
  lastName: string;
  phone: string;
  createdAt: string | null;
};

export async function fetchMyProfile(): Promise<UserProfile> {
  const {
    data: { user },
    error: userError
  } = await supabase.auth.getUser();

  if (userError || !user) {
    throw new Error(userError?.message ?? "Could not load user.");
  }

  const { data: profileRow, error: profileError } = await supabase
    .from("profiles")
    .select("first_name, last_name, phone, created_at")
    .eq("id", user.id)
    .maybeSingle();

  if (profileError) {
    throw new Error(`Could not load profile: ${profileError.message}`);
  }

  const profile = (profileRow ?? null) as Pick<ProfileRow, "first_name" | "last_name" | "phone" | "created_at"> | null;

  return {
    email: user.email ?? "",
    firstName: profile?.first_name ?? String(user.user_metadata?.first_name ?? ""),
    lastName: profile?.last_name ?? String(user.user_metadata?.last_name ?? ""),
    phone: profile?.phone ?? String(user.user_metadata?.phone ?? ""),
    createdAt: profile?.created_at ?? null
  };
}

export async function updateMyPhone(phone: string): Promise<void> {
  const nextPhone = phone.trim();
  if (!nextPhone) {
    throw new Error("Phone number is required.");
  }

  const {
    data: { user },
    error: userError
  } = await supabase.auth.getUser();

  if (userError || !user) {
    throw new Error(userError?.message ?? "Could not load user.");
  }

  const { data: updatedProfile, error: updateError } = await supabase
    .from("profiles")
    .update({ phone: nextPhone })
    .eq("id", user.id)
    .select("id")
    .maybeSingle();

  if (updateError) {
    throw new Error(`Could not update phone: ${updateError.message}`);
  }

  if (!updatedProfile) {
    throw new Error("Could not update phone: profile not found.");
  }

  const { error: metadataError } = await supabase.auth.updateUser({
    data: {
      ...user.user_metadata,
      phone: nextPhone
    }
  });

  if (metadataError) {
    logInfo("AccountService", "Phone updated but metadata sync failed.", {
      message: metadataError.message
    });
  }
}

export async function verifyCurrentPassword(password: string): Promise<void> {
  const trimmed = password.trim();
  if (!trimmed) {
    throw new Error("Current password is required.");
  }

  const {
    data: { user },
    error: userError
  } = await supabase.auth.getUser();

  if (userError || !user?.email) {
    throw new Error(userError?.message ?? "Could not verify current user.");
  }

  const { error } = await supabase.auth.signInWithPassword({
    email: user.email,
    password: trimmed
  });

  if (error) {
    throw new Error("Current password is incorrect.");
  }
}

export async function changePasswordWithVerification(currentPassword: string, newPassword: string): Promise<void> {
  await verifyCurrentPassword(currentPassword);

  const { error } = await supabase.auth.updateUser({ password: newPassword });
  if (error) {
    throw new Error(`Could not update password: ${error.message}`);
  }
}

async function parseFunctionErrorMessage(error: any) {
  const context = error?.context;

  if (typeof context === "string" && context.length > 0) {
    return context;
  }

  if (context && typeof context === "object") {
    const responseLike = context as {
      status?: number;
      statusText?: string;
      text?: () => Promise<string>;
      clone?: () => { text: () => Promise<string> };
    };

    const baseStatus = responseLike.status
      ? `HTTP ${responseLike.status}${responseLike.statusText ? ` ${responseLike.statusText}` : ""}`
      : "";

    try {
      const text =
        typeof responseLike.clone === "function"
          ? await responseLike.clone().text()
          : typeof responseLike.text === "function"
            ? await responseLike.text()
            : "";

      if (!text) {
        return baseStatus || "Unknown function error.";
      }

      try {
        const parsed = JSON.parse(text) as Record<string, unknown>;
        const parsedError = parsed.error ?? parsed.message ?? parsed.details;
        if (typeof parsedError === "string" && parsedError.length > 0) {
          return baseStatus ? `${baseStatus}: ${parsedError}` : parsedError;
        }
      } catch {
        // Use raw text fallback below.
      }

      return baseStatus ? `${baseStatus}: ${text}` : text;
    } catch {
      return baseStatus || "Unknown function error.";
    }
  }

  return error?.message ?? "Unknown function error.";
}

export async function deleteMyAccount(password: string): Promise<void> {
  await verifyCurrentPassword(password);

  const {
    data: { session }
  } = await supabase.auth.getSession();
  const accessToken = session?.access_token ?? null;

  if (!accessToken) {
    throw new Error("No active session found.");
  }

  const { error } = await supabase.functions.invoke("delete-account", {
    body: { password },
    headers: {
      Authorization: `Bearer ${accessToken}`
    }
  });

  if (error) {
    const detailedMessage = await parseFunctionErrorMessage(error);
    logError("AccountService", error, { operation: "delete-account", detailedMessage });
    throw new Error(`Could not delete account: ${detailedMessage}`);
  }

  const { error: signOutError } = await supabase.auth.signOut();
  if (signOutError) {
    logInfo("AccountService", "Account deleted but local sign-out failed.", {
      message: signOutError.message
    });
  }
}
