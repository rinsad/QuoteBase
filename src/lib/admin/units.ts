import { createClient } from "@/lib/supabase/server";
import type { SupabaseClient } from "@supabase/supabase-js";

export const UNIT_CALCULATION_BASES = [
  "weight",
  "volume",
  "load",
  "count",
  "area",
  "distance",
  "other",
] as const;

export type UnitCalculationBasis = (typeof UNIT_CALCULATION_BASES)[number];

export type AdminUnit = {
  id: string;
  unit_catalog_id: string | null;
  code: string;
  label: string;
  plural_label: string;
  calculation_basis: UnitCalculationBasis;
  measurement_system?: string;
  aliases?: string[];
  sort_order: number;
  is_active: boolean;
  updated_at: string;
};

export type UnitCatalogEntry = {
  id: string;
  code: string;
  label: string;
  plural_label: string;
  calculation_basis: UnitCalculationBasis;
  measurement_system: "us" | "metric" | "custom";
  aliases: string[];
  quote_quantity_basis: "ton" | "cy" | "load" | "count" | "none";
  quote_quantity_factor: number | null;
  sort_order: number;
  is_active: boolean;
  updated_at: string;
};

export type QuoteUnitConversion = {
  code: string;
  quoteQuantityBasis: "ton" | "cy" | "load" | "count" | "none";
  quoteQuantityFactor: number | null;
};

export type ActiveUnitLookup = {
  codes: string[];
  aliases: Record<string, string>;
};

export async function getAdminUnits(
  organizationId: string,
): Promise<AdminUnit[]> {
  const supabase = await createClient();

  if (!supabase) {
    return [];
  }

  const { data } = await supabase
    .from("organization_units")
    .select("id, unit_catalog_id, code, label, plural_label, calculation_basis, sort_order, is_active, updated_at")
    .eq("organization_id", organizationId)
    .order("sort_order", { ascending: true })
    .order("label", { ascending: true })
    .returns<AdminUnit[]>();

  return data ?? [];
}

export async function getUnitCatalog(): Promise<UnitCatalogEntry[]> {
  const supabase = await createClient();

  if (!supabase) {
    return [];
  }

  const { data } = await supabase
    .from("unit_catalog")
    .select("id, code, label, plural_label, calculation_basis, measurement_system, aliases, quote_quantity_basis, quote_quantity_factor, sort_order, is_active, updated_at")
    .eq("is_active", true)
    .order("calculation_basis", { ascending: true })
    .order("sort_order", { ascending: true })
    .returns<UnitCatalogEntry[]>();

  return data ?? [];
}

export async function getPlatformUnitCatalog(): Promise<UnitCatalogEntry[]> {
  const supabase = await createClient();

  if (!supabase) {
    return [];
  }

  const { data } = await supabase
    .from("unit_catalog")
    .select("id, code, label, plural_label, calculation_basis, measurement_system, aliases, quote_quantity_basis, quote_quantity_factor, sort_order, is_active, updated_at")
    .order("calculation_basis", { ascending: true })
    .order("sort_order", { ascending: true })
    .returns<UnitCatalogEntry[]>();

  return data ?? [];
}

export async function getActiveUnitCodes(
  organizationId: string,
): Promise<string[]> {
  const lookup = await getActiveUnitLookup(organizationId);

  return lookup.codes;
}

export async function getActiveUnitLookup(
  organizationId: string,
): Promise<ActiveUnitLookup> {
  const [units, catalog] = await Promise.all([
    getAdminUnits(organizationId),
    getUnitCatalog(),
  ]);
  const activeUnits = units.filter((unit) => unit.is_active);
  const catalogById = new Map(catalog.map((entry) => [entry.id, entry]));
  const aliases: Record<string, string> = {};

  for (const unit of activeUnits) {
    const catalogUnit = unit.unit_catalog_id
      ? catalogById.get(unit.unit_catalog_id)
      : null;
    const unitAliases = [
      unit.code,
      unit.label,
      unit.plural_label,
      ...(catalogUnit?.aliases ?? []),
      catalogUnit?.code,
      catalogUnit?.label,
      catalogUnit?.plural_label,
    ].filter((alias): alias is string => Boolean(alias));

    for (const alias of unitAliases) {
      aliases[normalizeUnitAlias(alias)] = unit.code;
    }
  }

  return {
    codes: activeUnits.map((unit) => unit.code),
    aliases,
  };
}

export function normalizeUnitAlias(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

export async function getQuoteUnitConversions({
  supabase,
  organizationId,
}: {
  supabase: SupabaseClient;
  organizationId: string;
}): Promise<QuoteUnitConversion[]> {
  const { data } = await supabase
    .from("organization_units")
    .select(
      "code, unit_catalog_id, unit_catalog(quote_quantity_basis, quote_quantity_factor)",
    )
    .eq("organization_id", organizationId)
    .eq("is_active", true)
    .returns<
      Array<{
        code: string;
        unit_catalog_id: string | null;
        unit_catalog:
          | {
              quote_quantity_basis: QuoteUnitConversion["quoteQuantityBasis"];
              quote_quantity_factor: number | null;
            }
          | Array<{
              quote_quantity_basis: QuoteUnitConversion["quoteQuantityBasis"];
              quote_quantity_factor: number | null;
            }>
          | null;
      }>
    >();

  return (
    data?.map((unit) => {
      const catalog = Array.isArray(unit.unit_catalog)
        ? unit.unit_catalog[0]
        : unit.unit_catalog;

      return {
        code: unit.code,
        quoteQuantityBasis: catalog?.quote_quantity_basis ?? "none",
        quoteQuantityFactor:
          catalog?.quote_quantity_factor === null ||
          catalog?.quote_quantity_factor === undefined
            ? null
            : Number(catalog.quote_quantity_factor),
      };
    }) ?? []
  );
}
