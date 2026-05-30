"use server";

import { redirect } from "next/navigation";

import {
  isAllowedWesternMaterialsEmail,
  normalizeEmail,
} from "@/lib/auth/allowlist";
import { getBaseUrl, isLocalSupabase } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export type LoginState = {
  message: string;
  status: "idle" | "success" | "error";
};

export async function sendMagicLink(
  _previousState: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const emailValue = formData.get("email");
  const email = typeof emailValue === "string" ? normalizeEmail(emailValue) : "";

  if (!email) {
    return {
      message: "Enter your Western Materials email.",
      status: "error",
    };
  }

  if (!isAllowedWesternMaterialsEmail(email)) {
    return {
      message: "That email is not on the Western Materials allowlist.",
      status: "error",
    };
  }

  const supabase = await createClient();

  if (!supabase) {
    return {
      message: "Supabase keys are not configured yet. Add them to .env.local.",
      status: "error",
    };
  }

  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo: `${getBaseUrl()}/auth/callback?next=/dashboard`,
    },
  });

  if (error) {
    return {
      message: error.message,
      status: "error",
    };
  }

  return {
    message: "Magic link sent. Check your email to continue.",
    status: "success",
  };
}

export async function signOut() {
  const supabase = await createClient();

  if (supabase) {
    await supabase.auth.signOut();
  }

  redirect("/login");
}

export async function devSignInAsRinsad() {
  if (process.env.NODE_ENV === "production" || !isLocalSupabase()) {
    throw new Error("Dev sign-in is only available with local Supabase.");
  }

  const admin = createAdminClient();
  const supabase = await createClient();

  if (!admin || !supabase) {
    throw new Error("Local Supabase is not configured.");
  }

  const { data, error } = await admin.auth.admin.generateLink({
    type: "magiclink",
    email: "rinsad@gmail.com",
    options: {
      redirectTo: `${getBaseUrl()}/auth/callback?next=/dashboard`,
    },
  });

  if (error || !data.properties?.hashed_token) {
    throw new Error(error?.message ?? "Could not create local dev login link.");
  }

  const { error: verifyError } = await supabase.auth.verifyOtp({
    type: "magiclink",
    token_hash: data.properties.hashed_token,
  });

  if (verifyError) {
    throw new Error(verifyError.message);
  }

  redirect("/dashboard");
}
