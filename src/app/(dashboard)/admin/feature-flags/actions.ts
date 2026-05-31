"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { logAction } from "@/lib/audit/log-action";
import { getCurrentUser } from "@/lib/auth/current-user";
import { createClient } from "@/lib/supabase/server";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function updateFeatureFlag(formData: FormData) {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/login");
  }

  if (user.role !== "admin") {
    throw new Error("Only admins can update feature flags.");
  }

  const supabase = await createClient();

  if (!supabase) {
    throw new Error("Supabase is not configured for this workspace.");
  }

  const flagId = requiredUuid(formData, "flag_id");
  const config = parseJsonConfig(formData, "config");
  const payload = {
    is_enabled: formData.get("is_enabled") === "on",
    config,
    updated_by: user.id,
    updated_at: new Date().toISOString(),
  };

  const { data: before, error: beforeError } = await supabase
    .from("feature_flags")
    .select("id, feature_name, is_enabled, config, updated_by, updated_at")
    .eq("organization_id", user.organization_id)
    .eq("id", flagId)
    .single<Record<string, unknown>>();

  if (beforeError || !before) {
    throw new Error(beforeError?.message ?? "Feature flag was not found.");
  }

  const { data: after, error } = await supabase
    .from("feature_flags")
    .update(payload)
    .eq("organization_id", user.organization_id)
    .eq("id", flagId)
    .select("id, feature_name, is_enabled, config, updated_by, updated_at")
    .single<Record<string, unknown>>();

  if (error || !after) {
    throw new Error(error?.message ?? "Could not update feature flag.");
  }

  await logAction({
    user,
    action: "feature_flag.updated",
    targetTable: "feature_flags",
    targetId: flagId,
    before,
    after,
  });

  revalidatePath("/admin/feature-flags");
  revalidatePath("/dashboard");
  redirect("/admin/feature-flags?saved=1");
}

function requiredUuid(formData: FormData, key: string): string {
  const value = formData.get(key);

  if (typeof value !== "string" || !UUID_PATTERN.test(value)) {
    throw new Error(`${key} is invalid.`);
  }

  return value;
}

function parseJsonConfig(formData: FormData, key: string): unknown {
  const value = formData.get(key);

  if (typeof value !== "string" || !value.trim()) {
    return null;
  }

  try {
    return JSON.parse(value) as unknown;
  } catch {
    throw new Error("Feature config must be valid JSON.");
  }
}
