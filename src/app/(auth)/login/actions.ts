"use server";

import { redirect } from "next/navigation";

import {
  isAllowedWesternMaterialsEmail,
  normalizeEmail,
} from "@/lib/auth/allowlist";
import { getBaseUrl, isLocalSupabase, isSupabaseReachable } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

type DevLoginUser = {
  key: string;
  email: string;
  password: string;
  fullName: string;
};

const DEV_LOGIN_USERS: DevLoginUser[] = [
  {
    key: "rinsad",
    email: "rinsad@gmail.com",
    password: "local-dev-rinsad-password",
    fullName: "Rinsad",
  },
  {
    key: "judd",
    email: "admin@westernmaterials.net",
    password: "local-dev-judd-password",
    fullName: "Judd",
  },
  {
    key: "gloria",
    email: "estimate@westernmaterials.net",
    password: "local-dev-gloria-password",
    fullName: "Gloria",
  },
  {
    key: "claudina",
    email: "dispatch@westernmaterials.net",
    password: "local-dev-claudina-password",
    fullName: "Claudina",
  },
  {
    key: "john-tenant-b",
    email: "john@westernmaterials.net",
    password: "local-dev-john-password",
    fullName: "John Tenant B",
  },
];

export type LoginState = {
  message: string;
  status: "idle" | "success" | "error";
};

function getDevLoginUnavailableRedirect(formData: FormData): string {
  const redirectValue = formData.get("dev_login_redirect");
  const redirectPath =
    typeof redirectValue === "string" ? redirectValue : "";

  if (
    redirectPath === "/?dev_login=unavailable" ||
    redirectPath === "/login?dev_login=unavailable"
  ) {
    return redirectPath;
  }

  return "/login?dev_login=unavailable";
}

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

export async function devSignInAsTestUser(formData: FormData) {
  const unavailableRedirect = getDevLoginUnavailableRedirect(formData);

  if (process.env.NODE_ENV === "production" || !isLocalSupabase()) {
    redirect(unavailableRedirect);
  }

  if (!(await isSupabaseReachable())) {
    redirect(unavailableRedirect);
  }

  const admin = createAdminClient();
  const supabase = await createClient();

  if (!admin || !supabase) {
    redirect(unavailableRedirect);
  }

  const devUserKeyValue = formData.get("dev_user");
  const devUserKey =
    typeof devUserKeyValue === "string" ? devUserKeyValue : "rinsad";
  const devUser =
    DEV_LOGIN_USERS.find((candidate) => candidate.key === devUserKey) ??
    DEV_LOGIN_USERS[0];

  try {
    const { data: usersData, error: usersError } =
      await admin.auth.admin.listUsers({
        page: 1,
        perPage: 1000,
      });

    if (usersError) {
      redirect(unavailableRedirect);
    }

    let authUser = usersData.users.find(
      (user) => user.email?.toLowerCase() === devUser.email,
    );

    if (!authUser) {
      const { data, error } = await admin.auth.admin.createUser({
        email: devUser.email,
        password: devUser.password,
        email_confirm: true,
        user_metadata: {
          full_name: devUser.fullName,
        },
      });

      if (error || !data.user) {
        redirect(unavailableRedirect);
      }

      authUser = data.user;
    } else {
      const { data, error } = await admin.auth.admin.updateUserById(authUser.id, {
        password: devUser.password,
        email_confirm: true,
        user_metadata: {
          full_name: devUser.fullName,
        },
      });

      if (error || !data.user) {
        redirect(unavailableRedirect);
      }

      authUser = data.user;
    }

    const { data: invite, error: inviteError } = await admin
      .from("user_invites")
      .select("organization_id, email, full_name, role")
      .eq("email", devUser.email)
      .eq("is_active", true)
      .single<{
        organization_id: string;
        email: string;
        full_name: string;
        role: "admin" | "account_manager" | "estimator";
      }>();

    if (inviteError || !invite) {
      redirect(unavailableRedirect);
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
      email: devUser.email,
      password: devUser.password,
    });

    if (signInError) {
      redirect(unavailableRedirect);
    }
  } catch {
    redirect(unavailableRedirect);
  }

  redirect("/dashboard");
}
