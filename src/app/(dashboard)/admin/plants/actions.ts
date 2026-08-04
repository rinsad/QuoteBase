"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { logAction } from "@/lib/audit/log-action";
import { getCurrentUser } from "@/lib/auth/current-user";
import { createClient } from "@/lib/supabase/server";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function savePlant(formData: FormData) {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/login");
  }

  if (user.role !== "admin" && user.role !== "account_manager") {
    throw new Error("Only admins and account managers can add plants.");
  }

  const supabase = await createClient();

  if (!supabase) {
    throw new Error("Supabase is not configured for this workspace.");
  }

  const parentSupplierId = optionalUuid(formData, "parent_supplier_id");
  const name = optionalText(formData, "name");
  const city = optionalText(formData, "city");
  const state = optionalState(formData, "state");

  if (!parentSupplierId) {
    redirectPlantFormError("select-supplier");
  }

  if (!name) {
    redirectPlantFormError("plant-name", parentSupplierId);
  }

  if (!city) {
    redirectPlantFormError("city", parentSupplierId);
  }

  if (!state) {
    redirectPlantFormError("state", parentSupplierId);
  }

  const payload = {
    organization_id: user.organization_id,
    supplier_id: parentSupplierId,
    name,
    address: {
      street: optionalText(formData, "street"),
      city,
      state,
      postal_code: optionalText(formData, "postal_code"),
      mapbox_id: optionalText(formData, "mapbox_id"),
    },
    latitude: optionalCoordinate(formData, "latitude", -90, 90),
    longitude: optionalCoordinate(formData, "longitude", -180, 180),
    hours: optionalLimitedText(formData, "hours", 240),
    primary_contact_name: optionalLimitedText(
      formData,
      "primary_contact_name",
      160,
    ),
    primary_contact_phone: optionalLimitedText(
      formData,
      "primary_contact_phone",
      40,
    ),
    notes: optionalLimitedText(formData, "notes", 1000),
    is_active: true,
  };

  const { data: plant, error } = await supabase
    .from("supplier_plants")
    .insert(payload)
    .select(
      "id, supplier_id, name, address, latitude, longitude, hours, primary_contact_name, primary_contact_phone, notes, is_active",
    )
    .single<Record<string, unknown>>();

  if (error || !plant) {
    throw new Error(error?.message ?? "Could not add plant.");
  }

  await logAction({
    user,
    action: "plant.created",
    targetTable: "supplier_plants",
    targetId: typeof plant.id === "string" ? plant.id : undefined,
    before: null,
    after: plant,
  });

  revalidatePath("/admin/plants");
  revalidatePath("/admin/suppliers");
  revalidatePath("/quotes/new");
  redirect(`/admin/plants?plant=${plant.id}&saved=1`);
}

export async function togglePlantActive(formData: FormData) {
  const user = await getCurrentUser();

  if (!user) {
    throw new Error("You must be signed in to update plants.");
  }

  if (user.role !== "admin" && user.role !== "account_manager") {
    throw new Error("Only admins and account managers can update plant status.");
  }

  const supabase = await createClient();

  if (!supabase) {
    throw new Error("Supabase is not configured for this workspace.");
  }

  const plantId = requiredUuid(formData, "supplier_id");
  const isActive = formData.get("is_active") === "true";

  const { data: before, error: beforeError } = await supabase
    .from("supplier_plants")
    .select(
      "id, supplier_id, name, address, latitude, longitude, is_active, updated_at",
    )
    .eq("organization_id", user.organization_id)
    .eq("id", plantId)
    .maybeSingle<Record<string, unknown>>();

  if (beforeError || !before) {
    throw new Error(beforeError?.message ?? "Plant not found.");
  }

  const { data: after, error } = await supabase
    .from("supplier_plants")
    .update({ is_active: isActive })
    .eq("organization_id", user.organization_id)
    .eq("id", plantId)
    .select(
      "id, supplier_id, name, address, latitude, longitude, is_active, updated_at",
    )
    .single<Record<string, unknown>>();

  if (error || !after) {
    throw new Error(error?.message ?? "Could not update plant status.");
  }

  await logAction({
    user,
    action: isActive ? "plant.activated" : "plant.deactivated",
    targetTable: "supplier_plants",
    targetId: plantId,
    before,
    after,
    metadata: {
      historical_data_preserved: true,
    },
  });

  revalidatePath("/admin/plants");
  revalidatePath("/admin/suppliers");
  revalidatePath("/quotes/new");
}

export async function updatePlantOperations(formData: FormData) {
  const user = await getCurrentUser();

  if (!user) {
    throw new Error("You must be signed in to update plants.");
  }

  if (user.role !== "admin" && user.role !== "account_manager") {
    throw new Error("Only admins and account managers can update plant details.");
  }

  const supabase = await createClient();

  if (!supabase) {
    throw new Error("Supabase is not configured for this workspace.");
  }

  const plantId = requiredUuid(formData, "plant_id");
  const payload = {
    hours: optionalLimitedText(formData, "hours", 240),
    primary_contact_name: optionalLimitedText(
      formData,
      "primary_contact_name",
      160,
    ),
    primary_contact_phone: optionalLimitedText(
      formData,
      "primary_contact_phone",
      40,
    ),
    notes: optionalLimitedText(formData, "notes", 1000),
  };

  const { data: before, error: beforeError } = await supabase
    .from("supplier_plants")
    .select(
      "id, supplier_id, name, hours, primary_contact_name, primary_contact_phone, notes, updated_at",
    )
    .eq("organization_id", user.organization_id)
    .eq("id", plantId)
    .maybeSingle<Record<string, unknown>>();

  if (beforeError || !before) {
    throw new Error(beforeError?.message ?? "Plant not found.");
  }

  const { data: after, error } = await supabase
    .from("supplier_plants")
    .update(payload)
    .eq("organization_id", user.organization_id)
    .eq("id", plantId)
    .select(
      "id, supplier_id, name, hours, primary_contact_name, primary_contact_phone, notes, updated_at",
    )
    .single<Record<string, unknown>>();

  if (error || !after) {
    throw new Error(error?.message ?? "Could not update plant details.");
  }

  await logAction({
    user,
    action: "plant.operations_updated",
    targetTable: "supplier_plants",
    targetId: plantId,
    before,
    after,
  });

  revalidatePath("/admin/plants");
  revalidatePath("/quotes/new");
  redirect(`/admin/plants?plant=${plantId}&saved=operations`);
}

function optionalUuid(formData: FormData, key: string): string | null {
  const value = formData.get(key);

  if (typeof value !== "string" || !value.trim()) {
    return null;
  }

  return UUID_PATTERN.test(value) ? value : null;
}

function optionalText(formData: FormData, key: string): string | null {
  const value = formData.get(key);

  if (typeof value !== "string" || !value.trim()) {
    return null;
  }

  return value.trim();
}

function optionalLimitedText(
  formData: FormData,
  key: string,
  maxLength: number,
): string | null {
  const value = optionalText(formData, key);

  if (!value) {
    return null;
  }

  if (value.length > maxLength) {
    throw new Error(`${key} must be ${maxLength} characters or fewer.`);
  }

  return value;
}

function optionalState(formData: FormData, key: string): string | null {
  const value = optionalText(formData, key)?.toUpperCase() ?? null;

  if (!value) {
    return null;
  }

  return /^[A-Z]{2}$/.test(value) ? value : null;
}

function optionalCoordinate(
  formData: FormData,
  key: string,
  min: number,
  max: number,
): number | null {
  const value = formData.get(key);

  if (typeof value !== "string" || !value.trim()) {
    return null;
  }

  const numberValue = Number(value);

  if (!Number.isFinite(numberValue) || numberValue < min || numberValue > max) {
    throw new Error(`${key} is out of range.`);
  }

  return Math.round((numberValue + Number.EPSILON) * 10000000) / 10000000;
}

function requiredUuid(formData: FormData, key: string): string {
  const value = formData.get(key);

  if (typeof value !== "string" || !UUID_PATTERN.test(value)) {
    throw new Error(`${key} is invalid.`);
  }

  return value;
}

function redirectPlantFormError(code: string, supplierId?: string): never {
  const params = new URLSearchParams({ new: "1", error: code });

  if (supplierId) {
    params.set("supplier", supplierId);
  }

  redirect(`/admin/plants?${params.toString()}`);
}
