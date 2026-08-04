"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { logAction } from "@/lib/audit/log-action";
import { getCurrentUser } from "@/lib/auth/current-user";
import { createClient } from "@/lib/supabase/server";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function saveOrganizationUnit(formData: FormData) {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/login");
  }

  if (user.role !== "admin") {
    throw new Error("Only admins can manage tenant units.");
  }

  const supabase = await createClient();

  if (!supabase) {
    throw new Error("Supabase is not configured for this workspace.");
  }

  const unitId = optionalUuid(formData, "unit_id");
  const code = requiredUnitCode(formData, "code");
  const label = requiredText(formData, "label");

  const { data: before } = unitId
    ? await supabase
        .from("organization_units")
        .select("*")
        .eq("organization_id", user.organization_id)
        .eq("id", unitId)
        .maybeSingle<Record<string, unknown>>()
    : { data: null };

  if (unitId && !before) {
    throw new Error("Unit was not found.");
  }

  const previousCode = typeof before?.code === "string" ? before.code : null;
  const payload = {
    organization_id: user.organization_id,
    unit_catalog_id:
      previousCode === code && typeof before?.unit_catalog_id === "string"
        ? before.unit_catalog_id
        : null,
    code,
    label,
    plural_label: label,
    calculation_basis:
      typeof before?.calculation_basis === "string"
        ? before.calculation_basis
        : "other",
    sort_order: optionalInteger(formData, "sort_order") ?? 0,
    is_active: formData.get("is_active") === "on",
  };

  const query = unitId
    ? supabase
        .from("organization_units")
        .update(payload)
        .eq("organization_id", user.organization_id)
        .eq("id", unitId)
    : supabase.from("organization_units").insert(payload);

  const { data: unit, error } = await query
    .select("id, unit_catalog_id, code, label, plural_label, calculation_basis, sort_order, is_active, updated_at")
    .single<Record<string, unknown>>();

  if (error || !unit) {
    throw new Error(error?.message ?? "Could not save unit.");
  }

  await logAction({
    user,
    action: unitId ? "organization_unit.updated" : "organization_unit.created",
    targetTable: "organization_units",
    targetId: typeof unit.id === "string" ? unit.id : undefined,
    before,
    after: unit,
    supabase,
  });

  revalidateUnitPaths();
  redirect("/admin/units?saved=1");
}

export async function setOrganizationUnitActive(formData: FormData) {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/login");
  }

  if (user.role !== "admin") {
    throw new Error("Only admins can manage tenant units.");
  }

  const supabase = await createClient();

  if (!supabase) {
    throw new Error("Supabase is not configured for this workspace.");
  }

  const unitId = requiredUuid(formData, "unit_id");
  const isActive = formData.get("is_active") === "true";

  const { data: before, error: beforeError } = await supabase
    .from("organization_units")
    .select("*")
    .eq("organization_id", user.organization_id)
    .eq("id", unitId)
    .maybeSingle<Record<string, unknown>>();

  if (beforeError || !before) {
    throw new Error(beforeError?.message ?? "Unit was not found.");
  }

  const { data: after, error } = await supabase
    .from("organization_units")
    .update({
      is_active: isActive,
      updated_at: new Date().toISOString(),
    })
    .eq("organization_id", user.organization_id)
    .eq("id", unitId)
    .select("id, code, label, plural_label, calculation_basis, sort_order, is_active, updated_at")
    .single<Record<string, unknown>>();

  if (error || !after) {
    throw new Error(error?.message ?? "Could not update unit status.");
  }

  await logAction({
    user,
    action: isActive
      ? "organization_unit.activated"
      : "organization_unit.deactivated",
    targetTable: "organization_units",
    targetId: unitId,
    before,
    after,
    supabase,
  });

  revalidateUnitPaths();
  redirect("/admin/units?saved=1");
}

function revalidateUnitPaths(): void {
  revalidatePath("/admin/units");
  revalidatePath("/admin/material-prices");
  revalidatePath("/admin/price-book");
  revalidatePath("/admin/plants");
  revalidatePath("/quotes/new");
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

function requiredUuid(formData: FormData, key: string): string {
  const value = optionalUuid(formData, key);

  if (!value) {
    throw new Error(`${key} is required.`);
  }

  return value;
}

function optionalText(formData: FormData, key: string): string | null {
  const value = formData.get(key);

  if (typeof value !== "string" || !value.trim()) {
    return null;
  }

  return value.trim();
}

function requiredText(formData: FormData, key: string): string {
  const value = optionalText(formData, key);

  if (!value) {
    throw new Error(`${key} is required.`);
  }

  return value;
}

function requiredUnitCode(formData: FormData, key: string): string {
  const value = requiredText(formData, key).toLowerCase();

  if (!/^[a-z0-9][a-z0-9_-]{0,31}$/.test(value)) {
    throw new Error(
      "Unit value must use lowercase letters, numbers, underscores, or hyphens.",
    );
  }

  return value;
}

function optionalInteger(formData: FormData, key: string): number | null {
  const value = formData.get(key);

  if (typeof value !== "string" || !value.trim()) {
    return null;
  }

  const numberValue = Number(value);

  if (!Number.isInteger(numberValue)) {
    throw new Error(`${key} must be a whole number.`);
  }

  return numberValue;
}
