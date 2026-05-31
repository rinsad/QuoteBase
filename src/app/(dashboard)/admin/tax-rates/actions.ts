"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { logAction } from "@/lib/audit/log-action";
import { getCurrentUser } from "@/lib/auth/current-user";
import { createClient } from "@/lib/supabase/server";

export async function saveTaxRate(formData: FormData) {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/login");
  }

  if (user.role !== "admin") {
    throw new Error("Only admins can manage tax rates.");
  }

  const supabase = await createClient();

  if (!supabase) {
    throw new Error("Supabase is not configured for this workspace.");
  }

  const id = optionalUuid(formData, "id");
  const payload = {
    organization_id: user.organization_id,
    city: requiredText(formData, "city"),
    county: requiredText(formData, "county"),
    state: requiredState(formData, "state"),
    rate: requiredPercent(formData, "rate_percent") / 100,
    effective_date: requiredDate(formData, "effective_date"),
  };

  const { data: before } = id
    ? await supabase
        .from("sales_tax_rates")
        .select("*")
        .eq("organization_id", user.organization_id)
        .eq("id", id)
        .maybeSingle<Record<string, unknown>>()
    : { data: null };

  const query = id
    ? supabase
        .from("sales_tax_rates")
        .update(payload)
        .eq("organization_id", user.organization_id)
        .eq("id", id)
    : supabase.from("sales_tax_rates").insert(payload);

  const { data: saved, error } = await query
    .select("id, city, county, state, rate, effective_date")
    .single<{
      id: string;
      city: string;
      county: string;
      state: string;
      rate: number;
      effective_date: string;
    }>();

  if (error || !saved) {
    throw new Error(error?.message ?? "Could not save tax rate.");
  }

  await logAction({
    user,
    action: id ? "sales_tax_rate.updated" : "sales_tax_rate.created",
    targetTable: "sales_tax_rates",
    targetId: saved.id,
    before,
    after: saved,
  });

  revalidatePath("/admin/tax-rates");
  revalidatePath("/quotes/new");
  redirect("/admin/tax-rates?saved=1");
}

function optionalUuid(formData: FormData, key: string): string | null {
  const value = formData.get(key);

  if (typeof value !== "string" || !value) {
    return null;
  }

  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) {
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

function requiredState(formData: FormData, key: string): string {
  const value = requiredText(formData, key).toUpperCase();

  if (!/^[A-Z]{2}$/.test(value)) {
    throw new Error("State must be a two-letter code.");
  }

  return value;
}

function requiredPercent(formData: FormData, key: string): number {
  const value = formData.get(key);
  const numberValue = typeof value === "string" ? Number(value) : NaN;

  if (!Number.isFinite(numberValue) || numberValue < 0 || numberValue > 25) {
    throw new Error("Tax rate must be between 0 and 25 percent.");
  }

  return Math.round((numberValue + Number.EPSILON) * 10000) / 10000;
}

function requiredDate(formData: FormData, key: string): string {
  const value = formData.get(key);

  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error(`${key} must be a valid date.`);
  }

  return value;
}
