"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { logAction } from "@/lib/audit/log-action";
import { getCurrentUser } from "@/lib/auth/current-user";
import { createClient } from "@/lib/supabase/server";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function saveTruckingProfile(formData: FormData): Promise<void> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role !== "admin") {
    throw new Error("Only admins can manage trucking profiles.");
  }

  const supabase = await createClient();
  if (!supabase) {
    throw new Error("Supabase is not configured for this workspace.");
  }

  const profileId = optionalUuid(formData, "profile_id");
  const payload = {
    organization_id: user.organization_id,
    name: requiredText(formData, "name"),
    average_speed_mph: requiredPositiveNumber(formData, "average_speed_mph", 100),
    hourly_rate: requiredNonNegativeNumber(formData, "hourly_rate", 10000),
    round_trip_factor: requiredPositiveNumber(formData, "round_trip_factor", 10),
    loading_unloading_hours: requiredNonNegativeNumber(
      formData,
      "loading_unloading_hours",
      24,
    ),
    is_active: true,
  };

  const { data: before } = profileId
    ? await supabase
        .from("trucking_profiles")
        .select("*")
        .eq("organization_id", user.organization_id)
        .eq("id", profileId)
        .maybeSingle<Record<string, unknown>>()
    : { data: null };

  const profileQuery = profileId
    ? supabase
        .from("trucking_profiles")
        .update(payload)
        .eq("organization_id", user.organization_id)
        .eq("id", profileId)
    : supabase.from("trucking_profiles").insert(payload);

  const { data: profile, error } = await profileQuery
    .select(
      "id, name, average_speed_mph, hourly_rate, round_trip_factor, loading_unloading_hours, is_active",
    )
    .single<Record<string, unknown>>();

  if (error || typeof profile?.id !== "string") {
    throw new Error(error?.message ?? "Could not save trucking profile.");
  }

  await logAction({
    user,
    action: profileId ? "trucking_profile.updated" : "trucking_profile.created",
    targetTable: "trucking_profiles",
    targetId: profile.id,
    before,
    after: profile,
    supabase,
  });

  revalidatePath("/admin/trucking-profiles");
  revalidatePath("/admin/material-prices");
  revalidatePath("/quotes/new");
  redirect("/admin/trucking-profiles?saved=1");
}

function requiredText(formData: FormData, key: string): string {
  const value = formData.get(key);
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(key + " is required.");
  }

  return value.trim().slice(0, 120);
}

function optionalUuid(formData: FormData, key: string): string | null {
  const value = formData.get(key);
  return typeof value === "string" && value ? validateUuid(value, key) : null;
}

function validateUuid(value: string, key: string): string {
  if (!UUID_PATTERN.test(value)) {
    throw new Error(key + " is invalid.");
  }

  return value;
}

function requiredPositiveNumber(
  formData: FormData,
  key: string,
  maximum: number,
): number {
  const value = requiredNonNegativeNumber(formData, key, maximum);
  if (value <= 0) {
    throw new Error(key + " must be greater than zero.");
  }

  return value;
}

function requiredNonNegativeNumber(
  formData: FormData,
  key: string,
  maximum: number,
): number {
  const rawValue = formData.get(key);
  const value = typeof rawValue === "string" ? Number(rawValue) : NaN;

  if (!Number.isFinite(value) || value < 0 || value > maximum) {
    throw new Error(key + " must be between 0 and " + maximum + ".");
  }

  return Math.round((value + Number.EPSILON) * 100) / 100;
}
