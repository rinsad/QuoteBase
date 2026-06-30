import { createClient } from "@/lib/supabase/server";

export type PriceBookSupplier = {
  id: string;
  name: string;
};

export type SupplierPriceImport = {
  id: string;
  supplier_id: string;
  source_filename: string;
  status: string;
  detected_columns: string[];
  column_mapping: Record<string, string>;
  row_count: number;
  imported_count: number;
  rejected_count: number;
  preview_rows: Array<Record<string, unknown>>;
  error_summary: Array<Record<string, unknown>>;
  created_at: string;
  completed_at: string | null;
  supplier_name: string;
};

export type SupplierMarkupRuleView = {
  id: string;
  supplier_id: string | null;
  supplier_name: string;
  scope: "global" | "category" | "item";
  category: string | null;
  catalog_item_id: string | null;
  catalog_item_label: string | null;
  markup_type: "percent" | "dollar";
  markup_value: number;
  margin_floor_pct: number | null;
  priority: number;
  created_at: string;
};

export type SupplierCatalogItemOption = {
  id: string;
  supplier_id: string;
  supplier_name: string;
  label: string;
  category: string | null;
};

type SupplierRecord = PriceBookSupplier;

type ImportRecord = Omit<SupplierPriceImport, "supplier_name"> & {
  suppliers: { name: string } | { name: string }[] | null;
};

type SupplierMarkupRuleRecord = Omit<
  SupplierMarkupRuleView,
  "supplier_name" | "catalog_item_label"
> & {
  suppliers: { name: string } | { name: string }[] | null;
  supplier_catalog_items:
    | { sku: string | null; description: string }
    | { sku: string | null; description: string }[]
    | null;
};

type SupplierCatalogItemRecord = {
  id: string;
  supplier_id: string;
  sku: string | null;
  description: string;
  category: string | null;
  suppliers: { name: string } | { name: string }[] | null;
};

export async function getPriceBookSuppliers(
  organizationId: string,
): Promise<PriceBookSupplier[]> {
  const supabase = await createClient();

  if (!supabase) {
    return [];
  }

  const { data } = await supabase
    .from("suppliers")
    .select("id, name")
    .eq("organization_id", organizationId)
    .eq("is_active", true)
    .order("name", { ascending: true })
    .returns<SupplierRecord[]>();

  return data ?? [];
}

export async function getSupplierPriceImports({
  organizationId,
  importId,
}: {
  organizationId: string;
  importId?: string;
}): Promise<{
  selectedImport: SupplierPriceImport | null;
  recentImports: SupplierPriceImport[];
}> {
  const supabase = await createClient();

  if (!supabase) {
    return { selectedImport: null, recentImports: [] };
  }

  const recentResult = await supabase
    .from("supplier_price_imports")
    .select(
      "id, supplier_id, source_filename, status, detected_columns, column_mapping, row_count, imported_count, rejected_count, preview_rows, error_summary, created_at, completed_at, suppliers(name)",
    )
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: false })
    .limit(10)
    .returns<ImportRecord[]>();

  const recentImports = (recentResult.data ?? []).map(normalizeImportRecord);
  let selectedImport =
    recentImports.find((priceImport) => priceImport.id === importId) ?? null;

  if (importId && !selectedImport) {
    const { data } = await supabase
      .from("supplier_price_imports")
      .select(
        "id, supplier_id, source_filename, status, detected_columns, column_mapping, row_count, imported_count, rejected_count, preview_rows, error_summary, created_at, completed_at, suppliers(name)",
      )
      .eq("organization_id", organizationId)
      .eq("id", importId)
      .maybeSingle<ImportRecord>();

    selectedImport = data ? normalizeImportRecord(data) : null;
  }

  return { selectedImport, recentImports };
}

export async function getSupplierMarkupRules(
  organizationId: string,
): Promise<SupplierMarkupRuleView[]> {
  const supabase = await createClient();

  if (!supabase) {
    return [];
  }

  const { data } = await supabase
    .from("supplier_markup_rules")
    .select(
      "id, supplier_id, scope, category, catalog_item_id, markup_type, markup_value, margin_floor_pct, priority, created_at, suppliers(name), supplier_catalog_items(sku, description)",
    )
    .eq("organization_id", organizationId)
    .eq("is_active", true)
    .order("priority", { ascending: true })
    .order("created_at", { ascending: false })
    .returns<SupplierMarkupRuleRecord[]>();

  return (
    data?.map((rule) => {
      const item = relationOne(rule.supplier_catalog_items);
      const itemLabel = item
        ? [item.sku, item.description].filter(Boolean).join(" - ")
        : null;

      return {
        ...rule,
        supplier_name: relationOne(rule.suppliers)?.name ?? "All suppliers",
        catalog_item_label: itemLabel,
        markup_value: Number(rule.markup_value),
        margin_floor_pct:
          rule.margin_floor_pct === null ? null : Number(rule.margin_floor_pct),
        priority: Number(rule.priority),
      };
    }) ?? []
  );
}

export async function getSupplierCatalogItemOptions(
  organizationId: string,
): Promise<SupplierCatalogItemOption[]> {
  const supabase = await createClient();

  if (!supabase) {
    return [];
  }

  const { data } = await supabase
    .from("supplier_catalog_items")
    .select("id, supplier_id, sku, description, category, suppliers(name)")
    .eq("organization_id", organizationId)
    .eq("is_active", true)
    .order("description", { ascending: true })
    .limit(500)
    .returns<SupplierCatalogItemRecord[]>();

  return (
    data?.map((item) => ({
      id: item.id,
      supplier_id: item.supplier_id,
      supplier_name: relationOne(item.suppliers)?.name ?? "Unknown supplier",
      label: [item.sku, item.description].filter(Boolean).join(" - "),
      category: item.category,
    })) ?? []
  );
}

function normalizeImportRecord(record: ImportRecord): SupplierPriceImport {
  return {
    ...record,
    detected_columns: Array.isArray(record.detected_columns)
      ? record.detected_columns.filter((value): value is string => typeof value === "string")
      : [],
    column_mapping:
      record.column_mapping &&
      typeof record.column_mapping === "object" &&
      !Array.isArray(record.column_mapping)
        ? record.column_mapping
        : {},
    error_summary: Array.isArray(record.error_summary)
      ? record.error_summary.filter(
          (value): value is Record<string, unknown> =>
            Boolean(value) && typeof value === "object" && !Array.isArray(value),
        )
      : [],
    preview_rows: Array.isArray(record.preview_rows)
      ? record.preview_rows.filter(
          (value): value is Record<string, unknown> =>
            Boolean(value) && typeof value === "object" && !Array.isArray(value),
        )
      : [],
    supplier_name: relationOne(record.suppliers)?.name ?? "Unknown supplier",
  };
}

function relationOne<T>(value: T | T[] | null): T | null {
  return Array.isArray(value) ? (value[0] ?? null) : value;
}
