"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { logAction } from "@/lib/audit/log-action";
import { getCurrentUser } from "@/lib/auth/current-user";
import { createAdminClient } from "@/lib/supabase/admin";

const ROLES = ["admin", "account_manager", "estimator"] as const;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type AppRole = (typeof ROLES)[number];

export async function saveUserInvite(formData: FormData) {
  const user = await requireAdminUser();
  const admin = createAdminClient();

  if (!admin) {
    throw new Error("Supabase service role is not configured for this workspace.");
  }

  const payload = {
    organization_id: user.organization_id,
    email: requiredEmail(formData, "email"),
    full_name: requiredText(formData, "full_name"),
    role: requiredRole(formData, "role"),
    is_active: true,
  };

  const { data: beforeInvite } = await admin
    .from("user_invites")
    .select("*")
    .eq("email", payload.email)
    .maybeSingle<Record<string, unknown>>();

  const { data: invite, error: inviteError } = await admin
    .from("user_invites")
    .upsert(payload, { onConflict: "email" })
    .select("id, email, full_name, role, is_active")
    .single<Record<string, unknown>>();

  if (inviteError || !invite) {
    throw new Error(inviteError?.message ?? "Could not save user invite.");
  }

  const { data: existingUser } = await admin
    .from("users")
    .select("*")
    .eq("organization_id", user.organization_id)
    .eq("email", payload.email)
    .maybeSingle<Record<string, unknown>>();

  if (existingUser) {
    const { error: userError } = await admin
      .from("users")
      .update({
        full_name: payload.full_name,
        role: payload.role,
        is_active: true,
      })
      .eq("organization_id", user.organization_id)
      .eq("email", payload.email);

    if (userError) {
      throw new Error(userError.message);
    }
  }

  await logAction({
    user,
    action: "user_invite.saved",
    targetTable: "user_invites",
    targetId: typeof invite.id === "string" ? invite.id : undefined,
    before: beforeInvite,
    after: invite,
  });

  revalidatePath("/admin/users");
  redirect("/admin/users?saved=invite");
}

export async function updateAppUser(formData: FormData) {
  const user = await requireAdminUser();
  const admin = createAdminClient();

  if (!admin) {
    throw new Error("Supabase service role is not configured for this workspace.");
  }

  const targetUserId = requiredUuid(formData, "user_id");
  const isActive = formData.get("is_active") === "on";

  if (targetUserId === user.id && !isActive) {
    throw new Error("You cannot deactivate your own account.");
  }

  const payload = {
    full_name: requiredText(formData, "full_name"),
    role: requiredRole(formData, "role"),
    is_active: isActive,
  };

  const { data: before, error: beforeError } = await admin
    .from("users")
    .select("*")
    .eq("organization_id", user.organization_id)
    .eq("id", targetUserId)
    .single<Record<string, unknown>>();

  if (beforeError || !before) {
    throw new Error(beforeError?.message ?? "User was not found.");
  }

  const { data: after, error } = await admin
    .from("users")
    .update(payload)
    .eq("organization_id", user.organization_id)
    .eq("id", targetUserId)
    .select("id, email, full_name, role, is_active, updated_at")
    .single<Record<string, unknown>>();

  if (error || !after) {
    throw new Error(error?.message ?? "Could not update user.");
  }

  await logAction({
    user,
    action: "user.updated",
    targetTable: "users",
    targetId: targetUserId,
    before,
    after,
  });

  revalidatePath("/admin/users");
  redirect("/admin/users?saved=user");
}

async function requireAdminUser() {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/login");
  }

  if (user.role !== "admin") {
    throw new Error("Only admins can manage users.");
  }

  return user;
}

function requiredUuid(formData: FormData, key: string): string {
  const value = formData.get(key);

  if (typeof value !== "string" || !UUID_PATTERN.test(value)) {
    throw new Error(`${key} is invalid.`);
  }

  return value;
}

function requiredText(formData: FormData, key: string): string {
  const value = formData.get(key);

  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${key} is required.`);
  }

  return value.trim();
}

function requiredEmail(formData: FormData, key: string): string {
  const value = requiredText(formData, key).toLowerCase();

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
    throw new Error("Email is invalid.");
  }

  return value;
}

function requiredRole(formData: FormData, key: string): AppRole {
  const value = formData.get(key);

  if (typeof value !== "string" || !ROLES.includes(value as AppRole)) {
    throw new Error(`${key} is invalid.`);
  }

  return value as AppRole;
}
