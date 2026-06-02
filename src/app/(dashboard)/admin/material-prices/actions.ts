"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { getCurrentUser } from "@/lib/auth/current-user";
import { updateMaterialPrices } from "@/lib/materials/price-updates";
import { createClient } from "@/lib/supabase/server";

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

  await updateMaterialPrices({
    user,
    supabase,
    updates: [
      {
        materialId,
        newPrice,
        priceDate,
        notes,
      },
    ],
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
