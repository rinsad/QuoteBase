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

export async function uploadMaterialPriceCsv(formData: FormData) {
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

  const file = formData.get("price_csv");

  if (!(file instanceof File) || file.size === 0) {
    throw new Error("CSV file is required.");
  }

  const rows = parsePriceCsv(await file.text());

  await updateMaterialPrices({
    user,
    supabase,
    updates: rows,
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

function parsePriceCsv(
  csv: string,
): Array<{
  materialId: string;
  newPrice: number;
  priceDate: string;
  notes: string | null;
}> {
  const lines = csv
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length < 2) {
    throw new Error("CSV must include a header row and at least one price row.");
  }

  const headers = splitCsvLine(lines[0]).map((header) =>
    header.trim().toLowerCase(),
  );
  const materialIdIndex = headers.indexOf("material_id");
  const newPriceIndex = headers.indexOf("new_price");
  const priceDateIndex = headers.indexOf("price_date");
  const notesIndex = headers.indexOf("notes");

  if (materialIdIndex === -1 || newPriceIndex === -1 || priceDateIndex === -1) {
    throw new Error("CSV headers must include material_id,new_price,price_date.");
  }

  if (lines.length > 101) {
    throw new Error("CSV upload is limited to 100 price rows.");
  }

  return lines.slice(1).map((line, index) => {
    const cells = splitCsvLine(line);
    const materialId = cells[materialIdIndex]?.trim() ?? "";
    const newPrice = Number(cells[newPriceIndex]);
    const priceDate = cells[priceDateIndex]?.trim() ?? "";
    const notes = cells[notesIndex]?.trim() || null;

    if (!UUID_PATTERN.test(materialId)) {
      throw new Error(`Row ${index + 2}: material_id is invalid.`);
    }

    if (!Number.isFinite(newPrice) || newPrice <= 0) {
      throw new Error(`Row ${index + 2}: new_price must be greater than zero.`);
    }

    if (!/^\d{4}-\d{2}-\d{2}$/.test(priceDate)) {
      throw new Error(`Row ${index + 2}: price_date must be YYYY-MM-DD.`);
    }

    return {
      materialId,
      newPrice: Math.round((newPrice + Number.EPSILON) * 100) / 100,
      priceDate,
      notes,
    };
  });
}

function splitCsvLine(line: string): string[] {
  const cells: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    const nextCharacter = line[index + 1];

    if (character === '"' && inQuotes && nextCharacter === '"') {
      current += '"';
      index += 1;
      continue;
    }

    if (character === '"') {
      inQuotes = !inQuotes;
      continue;
    }

    if (character === "," && !inQuotes) {
      cells.push(current);
      current = "";
      continue;
    }

    current += character;
  }

  cells.push(current);

  return cells;
}
