"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { logAction } from "@/lib/audit/log-action";
import {
  UNIT_CALCULATION_BASES,
  type UnitCalculationBasis,
} from "@/lib/admin/units";
import { getCurrentUser } from "@/lib/auth/current-user";
import { createClient } from "@/lib/supabase/server";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const UNIT_CODE_PATTERN = /^[a-z0-9][a-z0-9_-]{0,31}$/;
const MEASUREMENT_SYSTEMS = ["us", "metric", "custom"] as const;
const QUOTE_QUANTITY_BASES = ["ton", "cy", "load", "count", "none"] as const;

type MeasurementSystem = (typeof MEASUREMENT_SYSTEMS)[number];
type QuoteQuantityBasis = (typeof QUOTE_QUANTITY_BASES)[number];

export async function saveUnitCatalogEntry(formData: FormData) {
  const user = await requirePlatformAdmin();
  const supabase = await createClient();

  if (!supabase) {
    throw new Error("Supabase is not configured for this workspace.");
  }

  const unitId = optionalUuid(formData, "unit_id");
  const payload = {
    code: requiredUnitCode(formData, "code"),
    label: requiredText(formData, "label"),
    plural_label: requiredText(formData, "plural_label"),
    calculation_basis: requiredCalculationBasis(formData, "calculation_basis"),
    measurement_system: requiredMeasurementSystem(formData, "measurement_system"),
    aliases: aliasesFromText(optionalText(formData, "aliases") ?? ""),
    quote_quantity_basis: requiredQuoteQuantityBasis(
      formData,
      "quote_quantity_basis",
    ),
    quote_quantity_factor: optionalPositiveNumber(
      formData,
      "quote_quantity_factor",
    ),
    sort_order: optionalInteger(formData, "sort_order") ?? 0,
    is_active: formData.get("is_active") === "on",
  };

  if (
    payload.quote_quantity_basis !== "none" &&
    payload.quote_quantity_factor === null
  ) {
    throw new Error("Quote conversion factor is required unless basis is none.");
  }

  const { data: before } = unitId
    ? await supabase
        .from("unit_catalog")
        .select("*")
        .eq("id", unitId)
        .maybeSingle<Record<string, unknown>>()
    : { data: null };

  const query = unitId
    ? supabase.from("unit_catalog").update(payload).eq("id", unitId)
    : supabase.from("unit_catalog").insert(payload);

  const { data: after, error } = await query
    .select("id, code, label, plural_label, calculation_basis, measurement_system, aliases, quote_quantity_basis, quote_quantity_factor, sort_order, is_active, updated_at")
    .single<Record<string, unknown>>();

  if (error || !after) {
    throw new Error(error?.message ?? "Could not save unit catalog entry.");
  }

  await logAction({
    user,
    action: unitId ? "unit_catalog.updated" : "unit_catalog.created",
    targetTable: "unit_catalog",
    targetId: typeof after.id === "string" ? after.id : undefined,
    before,
    after,
    supabase,
  });

  revalidatePath("/platform/units");
  revalidatePath("/admin/units");
  redirect("/platform/units?saved=1");
}

async function requirePlatformAdmin() {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/login");
  }

  if (user.role !== "platform_admin") {
    throw new Error("Only platform admins can manage the unit catalog.");
  }

  return user;
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

function optionalText(formData: FormData, key: string): string | null {
  const value = formData.get(key);

  if (typeof value !== "string" || !value.trim()) {
    return null;
  }

  return value.trim();
}

function requiredUnitCode(formData: FormData, key: string): string {
  const value = requiredText(formData, key).toLowerCase();

  if (!UNIT_CODE_PATTERN.test(value)) {
    throw new Error(
      "Unit code must be 1-32 lowercase letters, numbers, dashes, or underscores.",
    );
  }

  return value;
}

function requiredCalculationBasis(
  formData: FormData,
  key: string,
): UnitCalculationBasis {
  const value = requiredText(formData, key);

  if (!UNIT_CALCULATION_BASES.includes(value as UnitCalculationBasis)) {
    throw new Error(`${key} is invalid.`);
  }

  return value as UnitCalculationBasis;
}

function requiredMeasurementSystem(
  formData: FormData,
  key: string,
): MeasurementSystem {
  const value = requiredText(formData, key);

  if (!MEASUREMENT_SYSTEMS.includes(value as MeasurementSystem)) {
    throw new Error(`${key} is invalid.`);
  }

  return value as MeasurementSystem;
}

function requiredQuoteQuantityBasis(
  formData: FormData,
  key: string,
): QuoteQuantityBasis {
  const value = requiredText(formData, key);

  if (!QUOTE_QUANTITY_BASES.includes(value as QuoteQuantityBasis)) {
    throw new Error(`${key} is invalid.`);
  }

  return value as QuoteQuantityBasis;
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

function optionalPositiveNumber(formData: FormData, key: string): number | null {
  const value = formData.get(key);

  if (typeof value !== "string" || !value.trim()) {
    return null;
  }

  const numberValue = Number(value);

  if (!Number.isFinite(numberValue) || numberValue <= 0) {
    throw new Error(`${key} must be greater than zero.`);
  }

  return Math.round((numberValue + Number.EPSILON) * 100000000) / 100000000;
}

function aliasesFromText(value: string): string[] {
  return [
    ...new Set(
      value
        .split(",")
        .map((alias) => alias.trim().toLowerCase())
        .filter(Boolean),
    ),
  ];
}
