"use server";

import { redirect } from "next/navigation";

import { getBaseUrl, isDevLoginEnabled, isSupabaseReachable } from "@/lib/env";
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
    email: "admin@demo-distributor.test",
    password: "local-dev-rinsad-password",
    fullName: "Demo Admin",
  },
  {
    key: "judd",
    email: "owner@demo-distributor.test",
    password: "local-dev-judd-password",
    fullName: "Demo Owner",
  },
  {
    key: "gloria",
    email: "sales@demo-distributor.test",
    password: "local-dev-gloria-password",
    fullName: "Demo Sales",
  },
  {
    key: "claudina",
    email: "dispatch@demo-distributor.test",
    password: "local-dev-claudina-password",
    fullName: "Demo Dispatch",
  },
  {
    key: "john-tenant-b",
    email: "owner@demo-distributor.test",
    password: "local-dev-john-password",
    fullName: "Demo Tenant B",
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
      message: "Enter your work email.",
      status: "error",
    };
  }

  if (!(await isApprovedWorkspaceEmail(email))) {
    return {
      message: "That email is not approved for this workspace.",
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

  if (!isDevLoginEnabled()) {
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

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

async function isApprovedWorkspaceEmail(email: string): Promise<boolean> {
  const admin = createAdminClient();

  if (!admin) {
    return false;
  }

  const [{ data: invite }, { data: user }] = await Promise.all([
    admin
      .from("user_invites")
      .select("id")
      .eq("email", email)
      .eq("is_active", true)
      .maybeSingle<{ id: string }>(),
    admin
      .from("users")
      .select("id")
      .eq("email", email)
      .eq("is_active", true)
      .maybeSingle<{ id: string }>(),
  ]);

  return Boolean(invite || user);
}
