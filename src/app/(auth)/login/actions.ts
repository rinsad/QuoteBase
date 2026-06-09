"use server";

import { redirect } from "next/navigation";

import {
  isAllowedWesternMaterialsEmail,
  normalizeEmail,
} from "@/lib/auth/allowlist";
import { getBaseUrl, isLocalSupabase, isSupabaseReachable } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

const DEV_LOGIN_EMAIL = "rinsad@gmail.com";
const DEV_LOGIN_PASSWORD = "local-dev-rinsad-password";

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
    redirect("/login?dev_login=unavailable");
  }

  if (!(await isSupabaseReachable())) {
    redirect("/login?dev_login=unavailable");
  }

  const admin = createAdminClient();
  const supabase = await createClient();

  if (!admin || !supabase) {
    redirect("/login?dev_login=unavailable");
  }

  try {
    const { data: usersData, error: usersError } =
      await admin.auth.admin.listUsers({
        page: 1,
        perPage: 1000,
      });

    if (usersError) {
      redirect("/login?dev_login=unavailable");
    }

    let authUser = usersData.users.find(
      (user) => user.email?.toLowerCase() === DEV_LOGIN_EMAIL,
    );

    if (!authUser) {
      const { data, error } = await admin.auth.admin.createUser({
        email: DEV_LOGIN_EMAIL,
        password: DEV_LOGIN_PASSWORD,
        email_confirm: true,
        user_metadata: {
          full_name: "Rinsad",
        },
      });

      if (error || !data.user) {
        redirect("/login?dev_login=unavailable");
      }

      authUser = data.user;
    } else {
      const { data, error } = await admin.auth.admin.updateUserById(authUser.id, {
        password: DEV_LOGIN_PASSWORD,
        email_confirm: true,
        user_metadata: {
          full_name: "Rinsad",
        },
      });

      if (error || !data.user) {
        redirect("/login?dev_login=unavailable");
      }

      authUser = data.user;
    }

    const { data: invite, error: inviteError } = await admin
      .from("user_invites")
      .select("organization_id, email, full_name, role")
      .eq("email", DEV_LOGIN_EMAIL)
      .eq("is_active", true)
      .single<{
        organization_id: string;
        email: string;
        full_name: string;
        role: "admin" | "account_manager" | "estimator";
      }>();

    if (inviteError || !invite) {
      redirect("/login?dev_login=unavailable");
    }

    await admin.from("users").upsert(
      {
        organization_id: invite.organization_id,
        auth_user_id: authUser.id,
        email: invite.email,
        full_name: invite.full_name,
        role: invite.role,
        is_active: true,
      },
      {
        onConflict: "auth_user_id",
      },
    );

    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: DEV_LOGIN_EMAIL,
      password: DEV_LOGIN_PASSWORD,
    });

    if (signInError) {
      redirect("/login?dev_login=unavailable");
    }
  } catch {
    redirect("/login?dev_login=unavailable");
  }

  redirect("/dashboard");
}
