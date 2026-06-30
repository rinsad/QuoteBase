"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { logAction } from "@/lib/audit/log-action";
import { getCurrentUser } from "@/lib/auth/current-user";
import { createClient } from "@/lib/supabase/server";
import { extractSupplierDocument } from "@/lib/supplier-documents/extract";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{12}$/i;
const REQUIRED_FIELDS = ["description", "uom", "cost"] as const;
const OPTIONAL_FIELDS = ["sku", "category", "tier"] as const;
const ALL_FIELDS = [...REQUIRED_FIELDS, ...OPTIONAL_FIELDS] as const;
const MATERIAL_TIERS = ["R1", "R2", "R3", "R4"] as const;
const MATERIAL_UNITS = ["ton", "cy", "load", "bag", "sqft", "lbs", "each"] as const;
const MARKUP_SCOPES = ["global", "category", "item"] as const;
const MARKUP_TYPES = ["percent", "dollar"] as const;
const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;
const MAX_IMPORT_ROWS = 5000;
const PREVIEW_ROWS = 5;
const PRICE_BOOK_BUCKET = "supplier-price-books";

type CsvRow = Record<string, string>;
type CatalogItemPayload = {
  organization_id: string;
  supplier_id: string;
  catalog_version_id: string;
  sku: string | null;
  description: string;
  category: string | null;
  tier: (typeof MATERIAL_TIERS)[number];
  uom: string;
  cost: number;
  raw_row: CsvRow;
  is_active: boolean;
};

export async function uploadSupplierPriceBook(formData: FormData) {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/login");
  }

  if (user.role !== "admin" && user.role !== "account_manager") {
    throw new Error("Only admins and account managers can upload price books.");
  }

  const supabase = await createClient();

  if (!supabase) {
    throw new Error("Supabase is not configured for this workspace.");
  }

  const supplierId = requiredUuid(formData, "supplier_id");
  const file = formData.get("price_book_file");

  if (!(file instanceof File) || file.size === 0) {
    throw new Error("Price book file is required.");
  }

  if (file.size > MAX_UPLOAD_BYTES) {
    throw new Error("Price book uploads are limited to 20 MB.");
  }

  const fileData = await file.arrayBuffer();
  const extraction = await extractSupplierDocument({
    fileName: file.name,
    mimeType: file.type,
    data: fileData,
    maxRows: MAX_IMPORT_ROWS,
  });
  const suggestedMapping = suggestMapping(extraction.headers);
  const storagePath = `${user.organization_id}/${supplierId}/${Date.now()}-${safeFileName(file.name)}`;
  const upload = await supabase.storage
    .from(PRICE_BOOK_BUCKET)
    .upload(storagePath, file, {
      contentType: file.type || contentTypeFromName(file.name),
      upsert: false,
    });

  if (upload.error) {
    throw new Error(upload.error.message);
  }

  const { data: priceImport, error } = await supabase
    .from("supplier_price_imports")
    .insert({
      organization_id: user.organization_id,
      supplier_id: supplierId,
      uploaded_by: user.id,
      source_filename: file.name,
      source_mime_type: file.type || contentTypeFromName(file.name),
      source_size_bytes: file.size,
      source_storage_bucket: PRICE_BOOK_BUCKET,
      source_storage_path: storagePath,
      status: "mapping_required",
      detected_columns: extraction.headers,
      column_mapping: suggestedMapping,
      row_count: extraction.rows.length,
      preview_rows: extraction.rows.slice(0, PREVIEW_ROWS),
      error_summary: extraction.warnings.map((warning) => ({
        severity: "warning",
        message: warning,
        parser: extraction.parserId,
      })),
    })
    .select("id")
    .single<{ id: string }>();

  if (error || !priceImport) {
    await supabase.storage.from(PRICE_BOOK_BUCKET).remove([storagePath]);
    throw new Error(error?.message ?? "Could not create the price book import.");
  }

  await logAction({
    supabase,
    user,
    action: "supplier_price_book.uploaded",
    targetTable: "supplier_price_imports",
    targetId: priceImport.id,
    before: null,
    after: {
      supplier_id: supplierId,
      source_filename: file.name,
      row_count: extraction.rows.length,
      detected_columns: extraction.headers,
      parser: extraction.parserId,
      metadata: extraction.metadata,
    },
  });

  revalidatePath("/admin/price-book");
  redirect(`/admin/price-book?import=${priceImport.id}`);
}

export async function confirmSupplierPriceBookMapping(formData: FormData) {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/login");
  }

  if (user.role !== "admin" && user.role !== "account_manager") {
    throw new Error("Only admins and account managers can import price books.");
  }

  const supabase = await createClient();

  if (!supabase) {
    throw new Error("Supabase is not configured for this workspace.");
  }

  const importId = requiredUuid(formData, "import_id");
  const mapping = readColumnMapping(formData);

  for (const field of REQUIRED_FIELDS) {
    if (!mapping[field]) {
      throw new Error(`Map the ${field} column before importing.`);
    }
  }

  const { data: priceImport, error: importError } = await supabase
    .from("supplier_price_imports")
    .select(
      "id, organization_id, supplier_id, uploaded_by, source_filename, source_mime_type, source_storage_bucket, source_storage_path, row_count, column_mapping, status",
    )
    .eq("organization_id", user.organization_id)
    .eq("id", importId)
    .single<{
      id: string;
      organization_id: string;
      supplier_id: string;
      uploaded_by: string;
      source_filename: string;
      source_mime_type: string | null;
      source_storage_bucket: string | null;
      source_storage_path: string | null;
      row_count: number;
      column_mapping: Record<string, string>;
      status: string;
    }>();

  if (importError || !priceImport) {
    throw new Error(importError?.message ?? "Price book import was not found.");
  }

  if (!priceImport.source_storage_path) {
    throw new Error("Price book source file is missing.");
  }

  const download = await supabase.storage
    .from(priceImport.source_storage_bucket ?? PRICE_BOOK_BUCKET)
    .download(priceImport.source_storage_path);

  if (download.error) {
    throw new Error(download.error.message);
  }

  const extraction = await extractSupplierDocument({
    fileName: priceImport.source_filename,
    mimeType:
      priceImport.source_mime_type ?? contentTypeFromName(priceImport.source_filename),
    data: await download.data.arrayBuffer(),
    maxRows: MAX_IMPORT_ROWS,
  });
  const itemRows = extraction.rows.map((row, index) =>
    mapCatalogItemRow({
      row,
      rowNumber: index + 2,
      mapping,
      organizationId: user.organization_id,
      supplierId: priceImport.supplier_id,
    }),
  );
  const versionNumber = await getNextCatalogVersionNumber({
    supabase,
    organizationId: user.organization_id,
    supplierId: priceImport.supplier_id,
  });

  await supabase
    .from("supplier_catalog_versions")
    .update({
      status: "archived",
    })
    .eq("organization_id", user.organization_id)
    .eq("supplier_id", priceImport.supplier_id)
    .eq("status", "active");

  const { data: version, error: versionError } = await supabase
    .from("supplier_catalog_versions")
    .insert({
      organization_id: user.organization_id,
      supplier_id: priceImport.supplier_id,
      import_id: priceImport.id,
      version_number: versionNumber,
      status: "active",
      source_filename: priceImport.source_filename,
      row_count: itemRows.length,
      activated_at: new Date().toISOString(),
      uploaded_by: priceImport.uploaded_by,
    })
    .select("id")
    .single<{ id: string }>();

  if (versionError || !version) {
    throw new Error(versionError?.message ?? "Could not create catalog version.");
  }

  const payloads = itemRows.map((row) => ({
    ...row,
    catalog_version_id: version.id,
  }));
  const { error: itemError } = await supabase
    .from("supplier_catalog_items")
    .insert(payloads)
    .select("id, supplier_id, catalog_version_id, sku, description, category, tier, uom, cost")
    .returns<
      Array<{
        id: string;
        supplier_id: string;
        catalog_version_id: string;
        sku: string | null;
        description: string;
        category: string | null;
        tier: (typeof MATERIAL_TIERS)[number];
        uom: string;
        cost: number;
      }>
    >();

  if (itemError) {
    throw new Error(itemError.message);
  }

  const { data: importedItems, error: importedItemsError } = await supabase
    .from("supplier_catalog_items")
    .select("id, supplier_id, catalog_version_id, sku, description, category, tier, uom, cost")
    .eq("organization_id", user.organization_id)
    .eq("catalog_version_id", version.id)
    .returns<
      Array<{
        id: string;
        supplier_id: string;
        catalog_version_id: string;
        sku: string | null;
        description: string;
        category: string | null;
        tier: (typeof MATERIAL_TIERS)[number];
        uom: string;
        cost: number;
      }>
    >();

  if (importedItemsError || !importedItems) {
    throw new Error(importedItemsError?.message ?? "Could not read imported items.");
  }

  const { error: materialSyncError } = await supabase.from("materials").upsert(
    importedItems.map((item) => ({
      organization_id: user.organization_id,
      supplier_id: item.supplier_id,
      name: item.description,
      description: item.description,
      tier: item.tier,
      unit: normalizeMaterialUnit(item.uom),
      cost_per_unit: Number(item.cost),
      last_price_update: new Date().toISOString().slice(0, 10),
      is_active: true,
      supplier_catalog_version_id: item.catalog_version_id,
      supplier_catalog_item_id: item.id,
      catalog_sku: item.sku,
      catalog_category: item.category,
    })),
    {
      onConflict: "organization_id,supplier_id,name,unit",
    },
  );

  if (materialSyncError) {
    throw new Error(materialSyncError.message);
  }

  const { error: staleMaterialError } = await supabase
    .from("materials")
    .update({ is_active: false })
    .eq("organization_id", user.organization_id)
    .eq("supplier_id", priceImport.supplier_id)
    .not("supplier_catalog_version_id", "is", null)
    .neq("supplier_catalog_version_id", version.id);

  if (staleMaterialError) {
    throw new Error(staleMaterialError.message);
  }

  await supabase
    .from("supplier_column_mappings")
    .update({ is_default: false })
    .eq("organization_id", user.organization_id)
    .eq("supplier_id", priceImport.supplier_id)
    .eq("is_default", true);

  const { error: mappingError } = await supabase
    .from("supplier_column_mappings")
    .upsert(
      {
        organization_id: user.organization_id,
        supplier_id: priceImport.supplier_id,
        mapping_name: "Default",
        source_headers: extraction.headers,
        column_mapping: mapping,
        is_default: true,
        created_by: user.id,
      },
      { onConflict: "organization_id,supplier_id,mapping_name" },
    );

  if (mappingError) {
    throw new Error(mappingError.message);
  }

  const { error: updateImportError } = await supabase
    .from("supplier_price_imports")
    .update({
      status: "imported",
      column_mapping: mapping,
      imported_count: payloads.length,
      rejected_count: 0,
      completed_at: new Date().toISOString(),
    })
    .eq("organization_id", user.organization_id)
    .eq("id", priceImport.id);

  if (updateImportError) {
    throw new Error(updateImportError.message);
  }

  await logAction({
    supabase,
    user,
    action: "supplier_price_book.imported",
    targetTable: "supplier_catalog_versions",
    targetId: version.id,
    before: {
      previous_active_archived: true,
    },
    after: {
      supplier_id: priceImport.supplier_id,
      import_id: priceImport.id,
      version_number: versionNumber,
      items: payloads.length,
      synced_materials: importedItems.length,
      stale_catalog_materials_deactivated: true,
      parser: extraction.parserId,
      parser_metadata: extraction.metadata,
    },
  });

  revalidatePath("/admin/price-book");
  revalidatePath("/quotes/new");
  redirect(`/admin/price-book?import=${priceImport.id}&imported=${payloads.length}`);
}

export async function saveSupplierMarkupRule(formData: FormData) {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/login");
  }

  if (user.role !== "admin" && user.role !== "account_manager") {
    throw new Error("Only admins and account managers can save markup rules.");
  }

  const supabase = await createClient();

  if (!supabase) {
    throw new Error("Supabase is not configured for this workspace.");
  }

  const scope = enumValue(formData, "scope", MARKUP_SCOPES);
  const markupType = enumValue(formData, "markup_type", MARKUP_TYPES);
  const supplierId = optionalUuid(formData, "supplier_id");
  const catalogItemId = optionalUuid(formData, "catalog_item_id");
  const category = optionalText(formData, "category", 120);
  const markupValue = positiveNumber(formData, "markup_value", 1000000);
  const marginFloorPct = optionalNumber(formData, "margin_floor_pct", 0, 100);
  const priority = optionalInteger(formData, "priority", 0, 100000) ?? 100;

  if (scope === "category" && !category) {
    throw new Error("Category rules require a category.");
  }

  if (scope === "item" && !catalogItemId) {
    throw new Error("Item rules require a catalog item.");
  }

  const { data: rule, error } = await supabase
    .from("supplier_markup_rules")
    .insert({
      organization_id: user.organization_id,
      supplier_id: supplierId,
      scope,
      category: scope === "category" ? category : null,
      catalog_item_id: scope === "item" ? catalogItemId : null,
      markup_type: markupType,
      markup_value: markupValue,
      margin_floor_pct: marginFloorPct,
      priority,
      effective_from: new Date().toISOString().slice(0, 10),
      is_active: true,
      created_by: user.id,
    })
    .select("id")
    .single<{ id: string }>();

  if (error || !rule) {
    throw new Error(error?.message ?? "Could not save markup rule.");
  }

  await logAction({
    supabase,
    user,
    action: "supplier_markup_rule.created",
    targetTable: "supplier_markup_rules",
    targetId: rule.id,
    before: null,
    after: {
      supplier_id: supplierId,
      scope,
      category: scope === "category" ? category : null,
      catalog_item_id: scope === "item" ? catalogItemId : null,
      markup_type: markupType,
      markup_value: markupValue,
      margin_floor_pct: marginFloorPct,
      priority,
    },
  });

  revalidatePath("/admin/price-book");
  revalidatePath("/quotes/new");
  redirect("/admin/price-book?rules=saved");
}

export async function deactivateSupplierMarkupRule(formData: FormData) {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/login");
  }

  if (user.role !== "admin" && user.role !== "account_manager") {
    throw new Error("Only admins and account managers can deactivate markup rules.");
  }

  const supabase = await createClient();

  if (!supabase) {
    throw new Error("Supabase is not configured for this workspace.");
  }

  const ruleId = requiredUuid(formData, "rule_id");
  const { data: existingRule } = await supabase
    .from("supplier_markup_rules")
    .select(
      "id, supplier_id, scope, category, catalog_item_id, markup_type, markup_value, margin_floor_pct, priority, is_active",
    )
    .eq("organization_id", user.organization_id)
    .eq("id", ruleId)
    .eq("is_active", true)
    .single<Record<string, unknown>>();

  if (!existingRule) {
    throw new Error("Markup rule was not found.");
  }

  const { error } = await supabase
    .from("supplier_markup_rules")
    .update({ is_active: false })
    .eq("organization_id", user.organization_id)
    .eq("id", ruleId)
    .eq("is_active", true);

  if (error) {
    throw new Error(error.message);
  }

  await logAction({
    supabase,
    user,
    action: "supplier_markup_rule.deactivated",
    targetTable: "supplier_markup_rules",
    targetId: ruleId,
    before: existingRule,
    after: { is_active: false },
  });

  revalidatePath("/admin/price-book");
  revalidatePath("/quotes/new");
  redirect("/admin/price-book?rules=disabled");
}

function requiredUuid(formData: FormData, key: string): string {
  const value = formData.get(key);

  if (typeof value !== "string" || !UUID_PATTERN.test(value)) {
    throw new Error(`${key} is invalid.`);
  }

  return value;
}

function optionalUuid(formData: FormData, key: string): string | null {
  const value = formData.get(key);

  if (typeof value !== "string" || !value.trim()) {
    return null;
  }

  if (!UUID_PATTERN.test(value)) {
    throw new Error(`${key} is invalid.`);
  }

  return value;
}

function enumValue<const T extends readonly string[]>(
  formData: FormData,
  key: string,
  allowedValues: T,
): T[number] {
  const value = formData.get(key);

  if (
    typeof value !== "string" ||
    !allowedValues.includes(value as T[number])
  ) {
    throw new Error(`${key} is invalid.`);
  }

  return value as T[number];
}

function optionalText(
  formData: FormData,
  key: string,
  maxLength: number,
): string | null {
  const value = formData.get(key);

  if (typeof value !== "string") {
    return null;
  }

  const text = value.trim();

  if (!text) {
    return null;
  }

  if (text.length > maxLength) {
    throw new Error(`${key} is too long.`);
  }

  return text;
}

function positiveNumber(
  formData: FormData,
  key: string,
  maxValue: number,
): number {
  const value = Number(formData.get(key));

  if (!Number.isFinite(value) || value < 0 || value > maxValue) {
    throw new Error(`${key} must be a valid positive number.`);
  }

  return Math.round((value + Number.EPSILON) * 10000) / 10000;
}

function optionalNumber(
  formData: FormData,
  key: string,
  minValue: number,
  maxValue: number,
): number | null {
  const rawValue = formData.get(key);

  if (typeof rawValue !== "string" || !rawValue.trim()) {
    return null;
  }

  const value = Number(rawValue);

  if (!Number.isFinite(value) || value < minValue || value > maxValue) {
    throw new Error(`${key} is outside the allowed range.`);
  }

  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function optionalInteger(
  formData: FormData,
  key: string,
  minValue: number,
  maxValue: number,
): number | null {
  const value = optionalNumber(formData, key, minValue, maxValue);

  return value === null ? null : Math.round(value);
}

function readColumnMapping(formData: FormData): Record<string, string> {
  const mapping: Record<string, string> = {};

  for (const field of ALL_FIELDS) {
    const value = formData.get(`map_${field}`);

    if (typeof value === "string" && value.trim()) {
      mapping[field] = value.trim();
    }
  }

  return mapping;
}

function safeFileName(name: string): string {
  return name.replace(/[^A-Za-z0-9._-]+/g, "-").slice(0, 120) || "price-book.csv";
}

function normalizeHeader(header: string): string {
  return header.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
}

function suggestMapping(headers: string[]): Record<string, string> {
  const lookup = new Map(headers.map((header) => [header, header]));

  return {
    sku: firstHeader(lookup, ["sku", "item", "item_number", "product_code"]) ?? "",
    description:
      firstHeader(lookup, ["description", "desc", "material", "material_name", "product"]) ??
      "",
    uom: firstHeader(lookup, ["uom", "unit", "unit_of_measure"]) ?? "",
    cost:
      firstHeader(lookup, [
        "cost",
        "cost_per_unit",
        "mat_price",
        "price",
        "unit_cost",
      ]) ?? "",
    category: firstHeader(lookup, ["category", "type", "class"]) ?? "",
    tier: firstHeader(lookup, ["tier", "price_tier", "material_tier"]) ?? "",
  };
}

function contentTypeFromName(name: string): string {
  const normalized = name.toLowerCase();

  if (normalized.endsWith(".pdf")) {
    return "application/pdf";
  }

  if (normalized.endsWith(".xlsx")) {
    return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
  }

  if (normalized.endsWith(".xls")) {
    return "application/vnd.ms-excel";
  }

  return "text/csv";
}

function firstHeader(
  headers: Map<string, string>,
  candidates: string[],
): string | null {
  for (const candidate of candidates) {
    const normalized = normalizeHeader(candidate);

    if (headers.has(normalized)) {
      return normalized;
    }
  }

  return null;
}

function mapCatalogItemRow({
  row,
  rowNumber,
  mapping,
  organizationId,
  supplierId,
}: {
  row: CsvRow;
  rowNumber: number;
  mapping: Record<string, string>;
  organizationId: string;
  supplierId: string;
}): Omit<CatalogItemPayload, "catalog_version_id"> {
  const description = mappedText(row, mapping.description);
  const uom = mappedText(row, mapping.uom);
  const tier = normalizeTier(mappedText(row, mapping.tier));
  const cost = Number(mappedText(row, mapping.cost).replace(/[$,]/g, ""));

  if (!description) {
    throw new Error(`Row ${rowNumber}: description is required.`);
  }

  if (!uom) {
    throw new Error(`Row ${rowNumber}: UOM is required.`);
  }

  if (!Number.isFinite(cost) || cost < 0) {
    throw new Error(`Row ${rowNumber}: cost must be a valid number.`);
  }

  return {
    organization_id: organizationId,
    supplier_id: supplierId,
    sku: mappedText(row, mapping.sku) || null,
    description,
    category: mappedText(row, mapping.category) || null,
    tier,
    uom,
    cost: Math.round((cost + Number.EPSILON) * 10000) / 10000,
    raw_row: row,
    is_active: true,
  };
}

function normalizeTier(value: string): (typeof MATERIAL_TIERS)[number] {
  const normalized = value.trim().toUpperCase();

  return MATERIAL_TIERS.includes(normalized as (typeof MATERIAL_TIERS)[number])
    ? (normalized as (typeof MATERIAL_TIERS)[number])
    : "R2";
}

function normalizeMaterialUnit(value: string): (typeof MATERIAL_UNITS)[number] {
  const normalized = value.trim().toLowerCase();
  const unitAliases: Record<string, (typeof MATERIAL_UNITS)[number]> = {
    tons: "ton",
    tonne: "ton",
    tonnes: "ton",
    cubic_yard: "cy",
    cubic_yards: "cy",
    yard: "cy",
    yards: "cy",
    lbs: "lbs",
    lb: "lbs",
    pound: "lbs",
    pounds: "lbs",
    each: "each",
    ea: "each",
  };
  const unit = unitAliases[normalized] ?? normalized;

  if (!MATERIAL_UNITS.includes(unit as (typeof MATERIAL_UNITS)[number])) {
    throw new Error(`Unsupported UOM "${value}". Use ton, cy, load, bag, sqft, lbs, or each.`);
  }

  return unit as (typeof MATERIAL_UNITS)[number];
}

function mappedText(row: CsvRow, column: string | undefined): string {
  if (!column) {
    return "";
  }

  return row[column]?.trim() ?? "";
}

async function getNextCatalogVersionNumber({
  supabase,
  organizationId,
  supplierId,
}: {
  supabase: Awaited<ReturnType<typeof createClient>>;
  organizationId: string;
  supplierId: string;
}): Promise<number> {
  if (!supabase) {
    return 1;
  }

  const { data } = await supabase
    .from("supplier_catalog_versions")
    .select("version_number")
    .eq("organization_id", organizationId)
    .eq("supplier_id", supplierId)
    .order("version_number", { ascending: false })
    .limit(1)
    .maybeSingle<{ version_number: number }>();

  return Number(data?.version_number ?? 0) + 1;
}
