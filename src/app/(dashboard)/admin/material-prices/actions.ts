"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { logAction } from "@/lib/audit/log-action";
import { getCurrentUser } from "@/lib/auth/current-user";
import { updateMaterialPrices } from "@/lib/materials/price-updates";
import { createClient } from "@/lib/supabase/server";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MATERIAL_TIERS = ["R1", "R2", "R3", "R4"] as const;
const MATERIAL_UNITS = ["ton", "cy", "load", "bag", "sqft", "lbs", "each"] as const;

type MaterialTier = (typeof MATERIAL_TIERS)[number];
type MaterialUnit = (typeof MATERIAL_UNITS)[number];

type SupplierCatalogImportRow = {
  supplierName: string;
  parentCompany: string | null;
  street: string | null;
  city: string | null;
  state: string;
  postalCode: string | null;
  latitude: number | null;
  longitude: number | null;
  hours: string | null;
  contactName: string | null;
  contactPhone: string | null;
  materialName: string;
  tier: MaterialTier;
  unit: MaterialUnit;
  costPerUnit: number;
  minimumOrderQuantity: number | null;
  specialNotes: string | null;
  priceDate: string;
  notes: string | null;
};

type SupplierRecord = {
  id: string;
  name: string;
  parent_company: string | null;
  address: Record<string, unknown>;
  latitude: number | null;
  longitude: number | null;
  hours: string | null;
  primary_contact_name: string | null;
  primary_contact_phone: string | null;
  notes: string | null;
};

type MaterialRecord = {
  id: string;
  supplier_id: string;
  name: string;
  unit: MaterialUnit;
  tier: MaterialTier;
  cost_per_unit: number;
};

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

  try {
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
  } catch (error) {
    if (
      error instanceof Error &&
      error.message === "New price must be different from the current price."
    ) {
      revalidatePath("/admin/material-prices");
      redirect("/admin/material-prices?saved=1&unchanged=1");
    }

    throw error;
  }

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

  try {
    await updateMaterialPrices({
      user,
      supabase,
      updates: rows,
    });
  } catch (error) {
    if (
      error instanceof Error &&
      error.message === "New price must be different from the current price."
    ) {
      revalidatePath("/admin/material-prices");
      redirect("/admin/material-prices?saved=1&unchanged=1");
    }

    throw error;
  }

  revalidatePath("/admin/material-prices");
  revalidatePath("/admin/plants");
  revalidatePath("/quotes/new");
  redirect("/admin/material-prices?saved=1");
}

export async function uploadSupplierCatalogCsv(formData: FormData) {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/login");
  }

  if (user.role !== "admin") {
    throw new Error("Only admins can import supplier catalog rows.");
  }

  const supabase = await createClient();

  if (!supabase) {
    throw new Error("Supabase is not configured for this workspace.");
  }

  const file = formData.get("supplier_catalog_csv");

  if (!(file instanceof File) || file.size === 0) {
    throw new Error("Supplier catalog CSV file is required.");
  }

  const rows = parseSupplierCatalogCsv(await file.text());
  const supplierNames = [...new Set(rows.map((row) => row.supplierName))];
  const { data: existingSuppliers, error: existingSuppliersError } =
    await supabase
      .from("suppliers")
      .select(
        "id, name, parent_company, address, latitude, longitude, hours, primary_contact_name, primary_contact_phone, notes",
      )
      .eq("organization_id", user.organization_id)
      .in("name", supplierNames)
      .returns<SupplierRecord[]>();

  if (existingSuppliersError) {
    throw new Error(existingSuppliersError.message);
  }

  const existingSupplierByName = new Map(
    (existingSuppliers ?? []).map((supplier) => [supplier.name, supplier]),
  );
  const firstRowBySupplier = new Map<string, SupplierCatalogImportRow>();

  for (const row of rows) {
    if (!firstRowBySupplier.has(row.supplierName)) {
      firstRowBySupplier.set(row.supplierName, row);
    }
  }

  const supplierPayloads = [...firstRowBySupplier.values()].map((row) => {
    const existing = existingSupplierByName.get(row.supplierName);

    return {
      ...(existing ? { id: existing.id } : {}),
      organization_id: user.organization_id,
      name: row.supplierName,
      parent_company: row.parentCompany ?? existing?.parent_company ?? null,
      address: {
        ...(existing?.address ?? {}),
        street: row.street ?? addressValue(existing?.address, "street"),
        city: row.city ?? addressValue(existing?.address, "city"),
        state: row.state || addressValue(existing?.address, "state") || "CA",
        postal_code:
          row.postalCode ?? addressValue(existing?.address, "postal_code"),
      },
      latitude: row.latitude ?? existing?.latitude ?? null,
      longitude: row.longitude ?? existing?.longitude ?? null,
      hours: row.hours ?? existing?.hours ?? null,
      primary_contact_name:
        row.contactName ?? existing?.primary_contact_name ?? null,
      primary_contact_phone:
        row.contactPhone ?? existing?.primary_contact_phone ?? null,
      notes: row.notes ?? existing?.notes ?? null,
      is_active: true,
    };
  });

  const { data: upsertedSuppliers, error: supplierError } = await supabase
    .from("suppliers")
    .upsert(supplierPayloads, { onConflict: "organization_id,name" })
    .select("id, name")
    .returns<Array<{ id: string; name: string }>>();

  if (supplierError || !upsertedSuppliers) {
    throw new Error(supplierError?.message ?? "Could not import suppliers.");
  }

  const supplierIdByName = new Map(
    upsertedSuppliers.map((supplier) => [supplier.name, supplier.id]),
  );
  const supplierIds = [...supplierIdByName.values()];
  const { data: existingMaterials, error: existingMaterialsError } =
    await supabase
      .from("materials")
      .select("id, supplier_id, name, unit, tier, cost_per_unit")
      .eq("organization_id", user.organization_id)
      .in("supplier_id", supplierIds)
      .returns<MaterialRecord[]>();

  if (existingMaterialsError) {
    throw new Error(existingMaterialsError.message);
  }

  const existingMaterialByKey = new Map(
    (existingMaterials ?? []).map((material) => [
      materialKey(material.supplier_id, material.name, material.unit),
      material,
    ]),
  );
  const uniqueRows = dedupeCatalogRows(rows, supplierIdByName);
  const materialPayloads = uniqueRows.map((row) => {
    const supplierId = supplierIdByName.get(row.supplierName);

    if (!supplierId) {
      throw new Error(`Supplier "${row.supplierName}" was not imported.`);
    }

    const existing = existingMaterialByKey.get(
      materialKey(supplierId, row.materialName, row.unit),
    );

    return {
      ...(existing ? { id: existing.id } : {}),
      organization_id: user.organization_id,
      supplier_id: supplierId,
      name: row.materialName,
      tier: row.tier,
      unit: row.unit,
      cost_per_unit: row.costPerUnit,
      last_price_update: row.priceDate,
      minimum_order_quantity: row.minimumOrderQuantity,
      special_notes: row.specialNotes,
      is_active: true,
    };
  });

  const { data: upsertedMaterials, error: materialError } = await supabase
    .from("materials")
    .upsert(materialPayloads, {
      onConflict: "organization_id,supplier_id,name,unit",
    })
    .select("id, supplier_id, name, unit, cost_per_unit")
    .returns<
      Array<{
        id: string;
        supplier_id: string;
        name: string;
        unit: MaterialUnit;
        cost_per_unit: number;
      }>
    >();

  if (materialError || !upsertedMaterials) {
    throw new Error(materialError?.message ?? "Could not import materials.");
  }

  const materialIdByKey = new Map(
    upsertedMaterials.map((material) => [
      materialKey(material.supplier_id, material.name, material.unit),
      material.id,
    ]),
  );
  const historyRows = uniqueRows
    .map((row) => {
      const supplierId = supplierIdByName.get(row.supplierName);

      if (!supplierId) {
        return null;
      }

      const key = materialKey(supplierId, row.materialName, row.unit);
      const materialId = materialIdByKey.get(key);
      const before = existingMaterialByKey.get(key);

      if (!materialId) {
        return null;
      }

      if (before && Number(before.cost_per_unit) === row.costPerUnit) {
        return null;
      }

      return {
        organization_id: user.organization_id,
        material_id: materialId,
        old_price: before ? Number(before.cost_per_unit) : null,
        new_price: row.costPerUnit,
        changed_by: user.id,
        notes: row.notes ?? "Supplier catalog import",
      };
    })
    .filter((row): row is NonNullable<typeof row> => Boolean(row));

  if (historyRows.length) {
    const { error: historyError } = await supabase
      .from("material_price_history")
      .insert(historyRows);

    if (historyError) {
      throw new Error(historyError.message);
    }
  }

  await logAction({
    supabase,
    user,
    action: "supplier_catalog.imported",
    targetTable: "materials",
    before: {
      matching_suppliers: existingSuppliers?.length ?? 0,
      matching_materials: existingMaterials?.length ?? 0,
    },
    after: {
      rows: rows.length,
      suppliers: supplierPayloads.length,
      materials: materialPayloads.length,
      price_history_rows: historyRows.length,
    },
    metadata: {
      filename: file.name,
      source: "supplier_catalog_csv",
    },
  });

  revalidatePath("/admin/material-prices");
  revalidatePath("/admin/suppliers");
  revalidatePath("/admin/plants");
  revalidatePath("/quotes/new");
  redirect(
    `/admin/material-prices?saved=1&catalog_imported=${materialPayloads.length}`,
  );
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

function parseSupplierCatalogCsv(csv: string): SupplierCatalogImportRow[] {
  const lines = csv
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length < 2) {
    throw new Error("CSV must include a header row and at least one catalog row.");
  }

  if (lines.length > 251) {
    throw new Error("Supplier catalog import is limited to 250 rows.");
  }

  const headers = splitCsvLine(lines[0]).map((header) =>
    header.trim().toLowerCase(),
  );

  return lines.slice(1).map((line, index) => {
    const cells = splitCsvLine(line);
    const rowNumber = index + 2;
    const supplierName = requiredCsvText({
      headers,
      cells,
      key: "supplier_name",
      rowNumber,
    });
    const materialName = requiredCsvText({
      headers,
      cells,
      key: "material_name",
      rowNumber,
    });
    const tier = requiredTier(csvValue(headers, cells, "tier"), rowNumber);
    const unit = requiredUnit(csvValue(headers, cells, "unit") || "ton", rowNumber);
    const costPerUnit = requiredCsvMoney({
      headers,
      cells,
      key: "cost_per_unit",
      rowNumber,
    });
    const priceDate = optionalCsvText(headers, cells, "price_date") ?? today();

    if (!/^\d{4}-\d{2}-\d{2}$/.test(priceDate)) {
      throw new Error(`Row ${rowNumber}: price_date must be YYYY-MM-DD.`);
    }

    return {
      supplierName,
      parentCompany: optionalCsvText(headers, cells, "parent_company"),
      street: optionalCsvText(headers, cells, "street"),
      city: optionalCsvText(headers, cells, "city"),
      state: optionalCsvText(headers, cells, "state")?.toUpperCase() ?? "CA",
      postalCode: optionalCsvText(headers, cells, "postal_code"),
      latitude: optionalCsvNumber(headers, cells, "latitude", rowNumber),
      longitude: optionalCsvNumber(headers, cells, "longitude", rowNumber),
      hours: optionalCsvText(headers, cells, "hours"),
      contactName: optionalCsvText(headers, cells, "contact_name"),
      contactPhone: optionalCsvText(headers, cells, "contact_phone"),
      materialName,
      tier,
      unit,
      costPerUnit,
      minimumOrderQuantity: optionalCsvNumber(
        headers,
        cells,
        "minimum_order_quantity",
        rowNumber,
      ),
      specialNotes: optionalCsvText(headers, cells, "special_notes"),
      priceDate,
      notes: optionalCsvText(headers, cells, "notes"),
    };
  });
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

function requiredCsvText({
  headers,
  cells,
  key,
  rowNumber,
}: {
  headers: string[];
  cells: string[];
  key: string;
  rowNumber: number;
}): string {
  const value = optionalCsvText(headers, cells, key);

  if (!value) {
    throw new Error(`Row ${rowNumber}: ${key} is required.`);
  }

  return value;
}

function requiredCsvMoney({
  headers,
  cells,
  key,
  rowNumber,
}: {
  headers: string[];
  cells: string[];
  key: string;
  rowNumber: number;
}): number {
  const value = Number(csvValue(headers, cells, key));

  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`Row ${rowNumber}: ${key} must be greater than zero.`);
  }

  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function optionalCsvText(
  headers: string[],
  cells: string[],
  key: string,
): string | null {
  const value = csvValue(headers, cells, key).trim();

  return value || null;
}

function optionalCsvNumber(
  headers: string[],
  cells: string[],
  key: string,
  rowNumber: number,
): number | null {
  const rawValue = csvValue(headers, cells, key).trim();

  if (!rawValue) {
    return null;
  }

  const value = Number(rawValue);

  if (!Number.isFinite(value)) {
    throw new Error(`Row ${rowNumber}: ${key} must be a number.`);
  }

  return value;
}

function csvValue(headers: string[], cells: string[], key: string): string {
  const index = headers.indexOf(key);

  if (index === -1) {
    return "";
  }

  return cells[index] ?? "";
}

function requiredTier(value: string, rowNumber: number): MaterialTier {
  const normalizedValue = value.trim().toUpperCase();

  if (!MATERIAL_TIERS.includes(normalizedValue as MaterialTier)) {
    throw new Error(`Row ${rowNumber}: tier must be R1, R2, R3, or R4.`);
  }

  return normalizedValue as MaterialTier;
}

function requiredUnit(value: string, rowNumber: number): MaterialUnit {
  const normalizedValue = value.trim().toLowerCase();

  if (!MATERIAL_UNITS.includes(normalizedValue as MaterialUnit)) {
    throw new Error(
      `Row ${rowNumber}: unit must be one of ${MATERIAL_UNITS.join(", ")}.`,
    );
  }

  return normalizedValue as MaterialUnit;
}

function dedupeCatalogRows(
  rows: SupplierCatalogImportRow[],
  supplierIdByName: Map<string, string>,
): SupplierCatalogImportRow[] {
  const rowsByKey = new Map<string, SupplierCatalogImportRow>();

  for (const row of rows) {
    const supplierId = supplierIdByName.get(row.supplierName);

    if (!supplierId) {
      continue;
    }

    rowsByKey.set(materialKey(supplierId, row.materialName, row.unit), row);
  }

  return [...rowsByKey.values()];
}

function materialKey(
  supplierId: string,
  materialName: string,
  unit: string,
): string {
  return `${supplierId}|${materialName.trim().toLowerCase()}|${unit}`;
}

function addressValue(
  address: Record<string, unknown> | undefined,
  key: string,
): string | null {
  const value = address?.[key];

  return typeof value === "string" && value.trim() ? value : null;
}

function today() {
  return new Date().toISOString().slice(0, 10);
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
