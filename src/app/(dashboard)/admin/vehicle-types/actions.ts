"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { logAction } from "@/lib/audit/log-action";
import { getCurrentUser } from "@/lib/auth/current-user";
import { createClient } from "@/lib/supabase/server";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function saveVehicleType(formData: FormData) {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/login");
  }

  if (user.role !== "admin") {
    throw new Error("Only admins can manage vehicle types.");
  }

  const supabase = await createClient();

  if (!supabase) {
    throw new Error("Supabase is not configured for this workspace.");
  }

  const vehicleTypeId = optionalUuid(formData, "vehicle_type_id");
  const payload = {
    organization_id: user.organization_id,
    name: requiredText(formData, "name"),
    capacity_tons: requiredPositiveNumber(formData, "capacity_tons"),
    capacity_cy: optionalPositiveNumber(formData, "capacity_cy"),
    is_active: formData.get("is_active") === "on",
  };

  const { data: before } = vehicleTypeId
    ? await supabase
        .from("vehicle_types")
        .select("*")
        .eq("organization_id", user.organization_id)
        .eq("id", vehicleTypeId)
        .maybeSingle<Record<string, unknown>>()
    : { data: null };

  const query = vehicleTypeId
    ? supabase
        .from("vehicle_types")
        .update(payload)
        .eq("organization_id", user.organization_id)
        .eq("id", vehicleTypeId)
    : supabase.from("vehicle_types").insert(payload);

  const { data: vehicleType, error } = await query
    .select("id, name, capacity_tons, capacity_cy, is_active")
    .single<Record<string, unknown>>();

  if (error || !vehicleType) {
    throw new Error(error?.message ?? "Could not save vehicle type.");
  }

  await logAction({
    user,
    action: vehicleTypeId ? "vehicle_type.updated" : "vehicle_type.created",
    targetTable: "vehicle_types",
    targetId: typeof vehicleType.id === "string" ? vehicleType.id : undefined,
    before,
    after: vehicleType,
  });

  revalidatePath("/admin/vehicle-types");
  revalidatePath("/admin/plants");
  revalidatePath("/quotes/new");
  redirect("/admin/vehicle-types?saved=1");
}

function optionalUuid(formData: FormData, key: string): string | null {
  const value = formData.get(key);

  if (typeof value !== "string" || !value) {
    return null;
  }

  if (!UUID_PATTERN.test(value)) {
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

function requiredPositiveNumber(formData: FormData, key: string): number {
  const value = formData.get(key);
  const numberValue = typeof value === "string" ? Number(value) : NaN;

  if (!Number.isFinite(numberValue) || numberValue <= 0) {
    throw new Error(`${key} must be greater than zero.`);
  }

  return Math.round((numberValue + Number.EPSILON) * 100) / 100;
}

function optionalPositiveNumber(formData: FormData, key: string): number | null {
  const value = formData.get(key);

  if (typeof value !== "string" || !value.trim()) {
    return null;
  }

  const numberValue = Number(value);

  if (!Number.isFinite(numberValue) || numberValue <= 0) {
    throw new Error(`${key} must be greater than zero.`);
  }

  return Math.round((numberValue + Number.EPSILON) * 100) / 100;
}
