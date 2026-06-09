"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { getCurrentUser } from "@/lib/auth/current-user";
import { logAction } from "@/lib/audit/log-action";
import { createClient } from "@/lib/supabase/server";

const DEFAULT_TRUCK_RATES = ["standard", "target", "premium", "stretch"];

export async function updatePricingConfig(formData: FormData) {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/login");
  }

  if (user.role !== "admin") {
    throw new Error("Only admins can update pricing configuration.");
  }

  const supabase = await createClient();

  if (!supabase) {
    throw new Error("Supabase is not configured for this workspace.");
  }

  const payload = {
    tier_r1_min: requiredNumber(formData, "tier_r1_min"),
    tier_r1_max: requiredNumber(formData, "tier_r1_max"),
    tier_r2_min: requiredNumber(formData, "tier_r2_min"),
    tier_r2_max: requiredNumber(formData, "tier_r2_max"),
    tier_r3_min: requiredNumber(formData, "tier_r3_min"),
    tier_r3_max: requiredNumber(formData, "tier_r3_max"),
    tier_r4_min: requiredNumber(formData, "tier_r4_min"),
    tier_r4_max: requiredNumber(formData, "tier_r4_max"),
    truck_floor_rate: requiredNumber(formData, "truck_floor_rate"),
    truck_standard_rate: requiredNumber(formData, "truck_standard_rate"),
    truck_target_rate: requiredNumber(formData, "truck_target_rate"),
    truck_premium_rate: requiredNumber(formData, "truck_premium_rate"),
    truck_stretch_rate: requiredNumber(formData, "truck_stretch_rate"),
    default_truck_rate: requiredOption(formData, "default_truck_rate"),
    material_minimum: requiredNumber(formData, "material_minimum"),
    trucking_minimum: requiredNumber(formData, "trucking_minimum"),
    fuel_surcharge_per_load: requiredNumber(formData, "fuel_surcharge_per_load"),
    environmental_fee_per_load: requiredNumber(
      formData,
      "environmental_fee_per_load",
    ),
    cc_surcharge_pct: requiredNumber(formData, "cc_surcharge_pct"),
    overhead_per_ton: requiredNumber(formData, "overhead_per_ton"),
    updated_at: new Date().toISOString(),
  };

  validateRange(payload.tier_r1_min, payload.tier_r1_max, "R1 dollar markup");
  validateRange(payload.tier_r2_min, payload.tier_r2_max, "R2 dollar markup");
  validateRange(payload.tier_r3_min, payload.tier_r3_max, "R3 dollar markup");
  validateRange(payload.tier_r4_min, payload.tier_r4_max, "R4 dollar markup");

  const { data: before } = await supabase
    .from("pricing_config")
    .select("*")
    .eq("organization_id", user.organization_id)
    .single<Record<string, unknown>>();

  const { data: after, error } = await supabase
    .from("pricing_config")
    .update(payload)
    .eq("organization_id", user.organization_id)
    .select("id")
    .single<{ id: string }>();

  if (error || !after) {
    throw new Error(error?.message ?? "Could not update pricing configuration.");
  }

  await logAction({
    user,
    action: "pricing_config.updated",
    targetTable: "pricing_config",
    targetId: after.id,
    before,
    after: payload,
  });

  revalidatePath("/admin/pricing");
  redirect("/admin/pricing?saved=1");
}

function requiredNumber(formData: FormData, key: string): number {
  const value = formData.get(key);
  const numberValue = typeof value === "string" ? Number(value) : NaN;

  if (!Number.isFinite(numberValue) || numberValue < 0) {
    throw new Error(`${key} must be a non-negative number.`);
  }

  return Math.round((numberValue + Number.EPSILON) * 100) / 100;
}

function requiredOption(formData: FormData, key: string): string {
  const value = formData.get(key);

  if (typeof value !== "string" || !DEFAULT_TRUCK_RATES.includes(value)) {
    throw new Error(`${key} is invalid.`);
  }

  return value;
}

function validateRange(min: number, max: number, label: string) {
  if (min > max) {
    throw new Error(`${label} minimum cannot be greater than maximum.`);
  }
}
