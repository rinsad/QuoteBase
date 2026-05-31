"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { logAction } from "@/lib/audit/log-action";
import { getCurrentUser } from "@/lib/auth/current-user";
import { createClient } from "@/lib/supabase/server";

type MaterialRecord = {
  id: string;
  name: string;
  cost_per_unit: number;
  last_price_update: string | null;
  is_active: boolean;
};

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function updateMaterialPrice(formData: FormData) {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/login");
  }

  if (user.role !== "admin" && user.role !== "account_manager") {
    throw new Error("Only admins and account managers can update material prices.");
  }

  const supabase = await createClient();

  if (!supabase) {
    throw new Error("Supabase is not configured for this workspace.");
  }

  const materialId = requiredUuid(formData, "material_id");
  const newPrice = requiredMoney(formData, "new_price");
  const notes = optionalText(formData, "notes");
  const priceDate = requiredDate(formData, "price_date");

  const { data: before, error: beforeError } = await supabase
    .from("materials")
    .select("id, name, cost_per_unit, last_price_update, is_active")
    .eq("organization_id", user.organization_id)
    .eq("id", materialId)
    .eq("is_active", true)
    .single<MaterialRecord>();

  if (beforeError || !before) {
    throw new Error(beforeError?.message ?? "Material was not found.");
  }

  const oldPrice = Number(before.cost_per_unit);

  if (oldPrice === newPrice) {
    throw new Error("New price must be different from the current price.");
  }

  const updatePayload = {
    cost_per_unit: newPrice,
    last_price_update: priceDate,
  };

  const { data: after, error: updateError } = await supabase
    .from("materials")
    .update(updatePayload)
    .eq("organization_id", user.organization_id)
    .eq("id", materialId)
    .eq("is_active", true)
    .select("id, name, cost_per_unit, last_price_update")
    .single<{
      id: string;
      name: string;
      cost_per_unit: number;
      last_price_update: string | null;
    }>();

  if (updateError || !after) {
    throw new Error(updateError?.message ?? "Could not update material price.");
  }

  const { error: historyError } = await supabase
    .from("material_price_history")
    .insert({
      organization_id: user.organization_id,
      material_id: materialId,
      old_price: oldPrice,
      new_price: newPrice,
      changed_by: user.id,
      notes,
    });

  if (historyError) {
    await supabase
      .from("materials")
      .update({
        cost_per_unit: oldPrice,
        last_price_update: before.last_price_update,
      })
      .eq("organization_id", user.organization_id)
      .eq("id", materialId);

    throw new Error(historyError.message);
  }

  await logAction({
    user,
    action: "material.price_updated",
    targetTable: "materials",
    targetId: materialId,
    before,
    after,
    metadata: {
      notes,
    },
  });

  revalidatePath("/admin/material-prices");
  revalidatePath("/admin/plants");
  revalidatePath("/quotes/new");
  redirect("/admin/material-prices?saved=1");
}

function requiredUuid(formData: FormData, key: string): string {
  const value = formData.get(key);

  if (typeof value !== "string" || !UUID_PATTERN.test(value)) {
    throw new Error(`${key} is invalid.`);
  }

  return value;
}

function requiredMoney(formData: FormData, key: string): number {
  const value = formData.get(key);
  const numberValue = typeof value === "string" ? Number(value) : NaN;

  if (!Number.isFinite(numberValue) || numberValue <= 0) {
    throw new Error(`${key} must be greater than zero.`);
  }

  return Math.round((numberValue + Number.EPSILON) * 100) / 100;
}

function optionalText(formData: FormData, key: string): string | null {
  const value = formData.get(key);

  if (typeof value !== "string" || !value.trim()) {
    return null;
  }

  return value.trim();
}

function requiredDate(formData: FormData, key: string): string {
  const value = formData.get(key);

  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error(`${key} must be a valid date.`);
  }

  return value;
}
