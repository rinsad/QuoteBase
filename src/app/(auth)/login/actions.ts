"use server";

import { redirect } from "next/navigation";

import {
  isAllowedWesternMaterialsEmail,
  normalizeEmail,
} from "@/lib/auth/allowlist";
import { getBaseUrl } from "@/lib/env";
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

