import { createHash } from "node:crypto";

import type { SupabaseClient } from "@supabase/supabase-js";

import { geocodeJobSiteAddress } from "@/lib/geo/geocode";
import {
  fetchGoogleSpreadsheet,
  getGoogleSheetsAccessToken,
  normalizeGoogleSheetsConfig,
  type GoogleSheetsIntegrationRecord,
} from "@/lib/integrations/google-sheets";
import { getMapboxIntegration } from "@/lib/integrations/mapbox";

type ParsedAddress = {
  street: string;
  city: string;
  state: string;
  postal_code: string | null;
  formatted: string;
};

type SheetMaterial = {
  supplierName: string;
  supplierKey: string;
  plantName: string;
  plantKey: string;
  address: ParsedAddress;
  materialName: string;
  materialKey: string;
  price: number;
  unit: string;
  lastUpdated: string;
  hours: string | null;
  isActive: boolean;
};

type SheetSupplier = { name: string; key: string };

export type GoogleSheetsSyncSummary = {
  suppliers: number;
  plants: number;
  materials: number;
  deactivatedSuppliers: number;
  deactivatedPlants: number;
  deactivatedMaterials: number;
  skippedRows: number;
  warnings: string[];
};

const LEGACY_IMPORTED_MATERIAL_TIER = "R1";
const MAX_WARNINGS = 50;

export async function runGoogleSheetsSync({
  supabase,
  integration,
}: {
  supabase: SupabaseClient;
  integration: GoogleSheetsIntegrationRecord;
}): Promise<GoogleSheetsSyncSummary> {
  const config = normalizeGoogleSheetsConfig(integration.config);

  if (!integration.is_enabled || !config.spreadsheetId) {
    throw new Error("Google Sheets synchronization is not enabled.");
  }

  const accessToken = await getGoogleSheetsAccessToken({
    supabase,
    integration,
  });
  const spreadsheet = await fetchGoogleSpreadsheet({
    accessToken,
    spreadsheetId: config.spreadsheetId,
  });
  const unitAliases = await loadUnitAliases(
    supabase,
    integration.organization_id,
  );
  const parsed = parseSpreadsheet({
    tabs: spreadsheet.tabs,
    config,
    unitAliases,
  });
  const syncedAt = new Date().toISOString();
  const mapbox = await getMapboxIntegration({
    supabase,
    organizationId: integration.organization_id,
  });
  const supplierRows = parsed.suppliers;
  logSyncStage(integration.organization_id, "suppliers", supplierRows.length);
  const { data: suppliers, error: supplierError } = await supabase
    .from("suppliers")
    .upsert(
      supplierRows.map((supplier) => ({
        organization_id: integration.organization_id,
        name: supplier.name,
        parent_company: supplier.name,
        address: {},
        is_active: true,
        google_sheet_sync_key: supplier.key,
        google_sheet_synced_at: syncedAt,
      })),
      { onConflict: "organization_id,name" },
    )
    .select("id, name, google_sheet_sync_key")
    .returns<
      Array<{ id: string; name: string; google_sheet_sync_key: string | null }>
    >();

  if (supplierError) {
    throw new Error(supplierError.message);
  }

  const supplierIdByKey = new Map(
    (suppliers ?? []).map((supplier) => [
      supplier.google_sheet_sync_key ?? syncKey(supplier.name),
      supplier.id,
    ]),
  );
  const plantsToSync = uniqueBy(parsed.materials, (row) => row.plantKey);
  const { data: existingPlants, error: existingPlantError } = await supabase
    .from("supplier_plants")
    .select("google_sheet_sync_key, latitude, longitude")
    .eq("organization_id", integration.organization_id)
    .in(
      "google_sheet_sync_key",
      plantsToSync.map((row) => row.plantKey),
    )
    .returns<
      Array<{
        google_sheet_sync_key: string | null;
        latitude: number | null;
        longitude: number | null;
      }>
    >();

  if (existingPlantError) {
    throw new Error(existingPlantError.message);
  }

  const existingCoordinates = new Map(
    (existingPlants ?? [])
      .filter(
        (plant): plant is typeof plant & { google_sheet_sync_key: string } =>
          Boolean(plant.google_sheet_sync_key),
      )
      .map((plant) => [
        plant.google_sheet_sync_key,
        {
          latitude: plant.latitude === null ? null : Number(plant.latitude),
          longitude: plant.longitude === null ? null : Number(plant.longitude),
        },
      ]),
  );
  const geocodedPlants = await mapWithConcurrency(
    plantsToSync,
    5,
    async (row) => {
      const coordinates = await geocodeJobSiteAddress({
        line1: row.address.street,
        city: row.address.city,
        state: row.address.state,
        apiKey:
          mapbox?.isEnabled && mapbox.publicAccessToken
            ? mapbox.publicAccessToken
            : null,
      });
      return { row, coordinates };
    },
  );
  for (const { row, coordinates } of geocodedPlants) {
    if (!coordinates && !existingCoordinates.get(row.plantKey)?.latitude) {
      addWarning(
        parsed.warnings,
        `${row.supplierName}: plant address could not be geocoded (${row.address.formatted}).`,
      );
    }
  }
  const plantPayloads = geocodedPlants.map(({ row, coordinates }) => {
    const supplierId = supplierIdByKey.get(row.supplierKey);

    if (!supplierId) {
      throw new Error(`Supplier was not synchronized for ${row.supplierName}.`);
    }

    return {
      organization_id: integration.organization_id,
      supplier_id: supplierId,
      name: row.plantName,
      address: row.address,
      latitude:
        coordinates?.latitude ??
        existingCoordinates.get(row.plantKey)?.latitude ??
        null,
      longitude:
        coordinates?.longitude ??
        existingCoordinates.get(row.plantKey)?.longitude ??
        null,
      hours: row.hours,
      is_active: true,
      google_sheet_sync_key: row.plantKey,
      google_sheet_synced_at: syncedAt,
    };
  });
  logSyncStage(integration.organization_id, "plants", plantPayloads.length);
  const { data: plants, error: plantError } = await supabase
    .from("supplier_plants")
    .upsert(plantPayloads, { onConflict: "organization_id,supplier_id,name" })
    .select("id, name, google_sheet_sync_key")
    .returns<
      Array<{ id: string; name: string; google_sheet_sync_key: string | null }>
    >();

  if (plantError) {
    throw new Error(plantError.message);
  }

  const plantIdByKey = new Map(
    (plants ?? [])
      .filter(
        (plant): plant is typeof plant & { google_sheet_sync_key: string } =>
          Boolean(plant.google_sheet_sync_key),
      )
      .map((plant) => [plant.google_sheet_sync_key, plant.id]),
  );
  const materialRows = uniqueBy(parsed.materials, (row) => row.materialKey);
  const materialKeys = materialRows.map((row) => row.materialKey);
  const { data: existingMaterials, error: existingMaterialError } =
    await supabase
      .from("materials")
      .select("id, google_sheet_sync_key, cost_per_unit")
      .eq("organization_id", integration.organization_id)
      .in("google_sheet_sync_key", materialKeys)
      .returns<
        Array<{
          id: string;
          google_sheet_sync_key: string | null;
          cost_per_unit: number;
        }>
      >();

  if (existingMaterialError) {
    throw new Error(existingMaterialError.message);
  }

  const materialPayloads = materialRows.map((row) => {
    const plantId = plantIdByKey.get(row.plantKey);

    if (!plantId) {
      throw new Error(`Plant was not synchronized for ${row.plantName}.`);
    }

    return {
      organization_id: integration.organization_id,
      supplier_id: plantId,
      name: row.materialName,
      description: row.materialName,
      tier: LEGACY_IMPORTED_MATERIAL_TIER,
      unit: row.unit,
      cost_per_unit: row.price,
      last_price_update: row.lastUpdated,
      is_active: row.isActive,
      google_sheet_sync_key: row.materialKey,
      google_sheet_synced_at: syncedAt,
    };
  });
  logSyncStage(integration.organization_id, "materials", materialPayloads.length);
  const { data: materials, error: materialError } = await supabase
    .from("materials")
    .upsert(materialPayloads, {
      onConflict: "organization_id,supplier_id,name,unit",
    })
    .select("id, google_sheet_sync_key, cost_per_unit")
    .returns<
      Array<{
        id: string;
        google_sheet_sync_key: string | null;
        cost_per_unit: number;
      }>
    >();

  if (materialError) {
    throw new Error(materialError.message);
  }

  const existingByKey = new Map(
    (existingMaterials ?? [])
      .filter(
        (
          material,
        ): material is typeof material & {
          google_sheet_sync_key: string;
        } => Boolean(material.google_sheet_sync_key),
      )
      .map((material) => [material.google_sheet_sync_key, material]),
  );
  const changedPrices = (materials ?? []).flatMap((material) => {
    if (!material.google_sheet_sync_key) return [];
    const before = existingByKey.get(material.google_sheet_sync_key);
    const oldPrice = before ? Number(before.cost_per_unit) : null;
    const newPrice = Number(material.cost_per_unit);

    return before && oldPrice !== newPrice
      ? [
          {
            organization_id: integration.organization_id,
            material_id: material.id,
            old_price: oldPrice,
            new_price: newPrice,
            changed_by: config.connectedBy,
            notes: "Daily Google Sheets supplier synchronization",
          },
        ]
      : [];
  });

  if (changedPrices.length && config.connectedBy) {
    const { error } = await supabase
      .from("material_price_history")
      .insert(changedPrices);
    if (error) throw new Error(error.message);
  }

  // Never deactivate previous catalog data from a partially invalid source.
  const canDeactivateMissing = parsed.skippedRows === 0;
  const deactivatedSuppliers = canDeactivateMissing
    ? await deactivateMissing({
        supabase,
        table: "suppliers",
        organizationId: integration.organization_id,
        currentKeys: supplierRows.map((row) => row.key),
      })
    : 0;
  const deactivatedPlants = canDeactivateMissing
    ? await deactivateMissing({
        supabase,
        table: "supplier_plants",
        organizationId: integration.organization_id,
        currentKeys: plantsToSync.map((row) => row.plantKey),
      })
    : 0;
  const deactivatedMaterials = canDeactivateMissing
    ? await deactivateMissing({
        supabase,
        table: "materials",
        organizationId: integration.organization_id,
        currentKeys: materialKeys,
      })
    : 0;
  if (!canDeactivateMissing) {
    addWarning(
      parsed.warnings,
      "Previously synchronized records were not deactivated because this run contained invalid rows.",
    );
  }
  const summary: GoogleSheetsSyncSummary = {
    suppliers: supplierRows.length,
    plants: plantsToSync.length,
    materials: materialRows.length,
    deactivatedSuppliers,
    deactivatedPlants,
    deactivatedMaterials,
    skippedRows: parsed.skippedRows,
    warnings: parsed.warnings,
  };
  const nextConfig = {
    ...config,
    spreadsheetTitle: spreadsheet.title,
    lastSyncAt: syncedAt,
    lastSyncStatus: "success" as const,
    lastSyncError: "",
    lastSyncSummary: summary,
    syncLog: [
      { at: syncedAt, status: "success" as const, summary },
      ...(config.syncLog ?? []),
    ].slice(0, 20),
  };
  const { error: integrationError } = await supabase
    .from("organization_integrations")
    .update({ config: nextConfig, updated_at: syncedAt })
    .eq("organization_id", integration.organization_id)
    .eq("id", integration.id)
    .eq("provider", "google_sheets");

  if (integrationError) {
    throw new Error(integrationError.message);
  }

  await supabase.from("audit_log").insert({
    organization_id: integration.organization_id,
    user_id: config.connectedBy ?? null,
    action: "integration.google_sheets.synchronized",
    target_table: "organization_integrations",
    target_id: integration.id,
    before_value: {
      last_sync_at: config.lastSyncAt ?? null,
      last_sync_status: config.lastSyncStatus ?? null,
    },
    after_value: { last_sync_at: syncedAt, summary },
  });

  return summary;
}

export async function recordGoogleSheetsSyncFailure({
  supabase,
  integration,
  error,
}: {
  supabase: SupabaseClient;
  integration: GoogleSheetsIntegrationRecord;
  error: unknown;
}): Promise<void> {
  const config = normalizeGoogleSheetsConfig(integration.config);
  const message =
    error instanceof Error ? error.message : "Google Sheets sync failed.";
  const failedAt = new Date().toISOString();
  await supabase
    .from("organization_integrations")
    .update({
      config: {
        ...config,
        lastSyncAt: failedAt,
        lastSyncStatus: "failed",
        lastSyncError: message.slice(0, 500),
        syncLog: [
          { at: failedAt, status: "failed", message: message.slice(0, 500) },
          ...(config.syncLog ?? []),
        ].slice(0, 20),
      },
      updated_at: failedAt,
    })
    .eq("organization_id", integration.organization_id)
    .eq("id", integration.id)
    .eq("provider", "google_sheets");
}

function parseSpreadsheet({
  tabs,
  config,
  unitAliases,
}: {
  tabs: Array<{ title: string; values: unknown[][] }>;
  config: ReturnType<typeof normalizeGoogleSheetsConfig>;
  unitAliases: Map<string, string>;
}): {
  suppliers: SheetSupplier[];
  materials: SheetMaterial[];
  skippedRows: number;
  warnings: string[];
} {
  const suppliers: SheetSupplier[] = [];
  const materials: SheetMaterial[] = [];
  const warnings: string[] = [];
  let skippedRows = 0;
  const indexes = Object.fromEntries(
    Object.entries(config.columns).map(([key, column]) => [
      key,
      columnToIndex(column),
    ]),
  ) as Record<keyof typeof config.columns, number>;

  for (const tab of tabs) {
    const supplierName = tab.title.trim();
    const supplierKey = syncKey(supplierName);
    const hasContent = tab.values
      .slice(config.headerRow)
      .some((row) => row.some((value) => cellValue(value) !== ""));
    if (!supplierName || !hasContent) continue;
    suppliers.push({ name: supplierName, key: supplierKey });
    let currentAddress: ParsedAddress | null = null;
    let currentPlantLabel: string | null = null;

    for (let index = config.headerRow; index < tab.values.length; index += 1) {
      const row = tab.values[index] ?? [];
      const addressText = cell(row, indexes.address);
      const materialName = cell(row, indexes.material);
      const priceText = cell(row, indexes.price);
      const unitText = cell(row, indexes.unit);
      const parsedAddress = addressText ? parseAddress(addressText) : null;

      if (
        addressText &&
        !parsedAddress &&
        !materialName &&
        !parsePrice(priceText)
      ) {
        currentPlantLabel = addressText;
        continue;
      }

      if (parsedAddress) currentAddress = parsedAddress;
      if (!materialName && !priceText) continue;

      const price = parsePrice(priceText);
      const unit = resolveUnit(unitText, unitAliases);

      if (!currentAddress || !materialName || price === null || !unit) {
        skippedRows += 1;
        const reasons = [
          !currentAddress ? "plant address is missing or invalid" : null,
          !materialName ? "material name is missing" : null,
          price === null ? "price is not numeric" : null,
          !unit ? `unit is not recognized${unitText ? ` (${unitText})` : ""}` : null,
        ].filter((reason): reason is string => Boolean(reason));
        addWarning(warnings, `${tab.title} row ${index + 1}: ${reasons.join(", ")}.`);
        continue;
      }

      const plantName = currentPlantLabel?.trim()
        ? `${currentPlantLabel.trim()} - ${currentAddress.formatted}`
        : `${supplierName} - ${currentAddress.formatted}`;
      // Address is the plant identity in the spreadsheet. Repeated copies of
      // the same normalized address beside material rows resolve to one plant.
      const plantKey = syncKey(`${supplierKey}|${currentAddress.formatted}`);
      materials.push({
        supplierName,
        supplierKey,
        plantName,
        plantKey,
        address: currentAddress,
        materialName,
        materialKey: syncKey(`${plantKey}|${materialName}|${unit}`),
        price,
        unit,
        lastUpdated: parseDate(cell(row, indexes.lastUpdated)),
        hours: cell(row, indexes.hours) || null,
        isActive: !/^(n|no|out|inactive|false)$/i.test(
          cell(row, indexes.inventory),
        ),
      });
    }
  }

  if (!materials.length) {
    throw new Error("No valid supplier material rows were found.");
  }

  return {
    suppliers: uniqueBy(suppliers, (row) => row.key),
    materials,
    skippedRows,
    warnings,
  };
}

function parseAddress(value: string): ParsedAddress | null {
  const normalized = value.replace(/\s+/g, " ").trim();
  const parts = normalized.split(",").map((part) => part.trim());
  if (parts.length < 3) return null;

  const street = parts[0];
  const city = parts[1];
  const statePostal = parts[2].match(/^([A-Za-z]{2})\s*(\d{5}(?:-\d{4})?)?/);
  if (!street || !city || !statePostal) return null;

  return {
    street,
    city,
    state: statePostal[1].toUpperCase(),
    postal_code: statePostal[2] ?? null,
    formatted: normalized,
  };
}

async function loadUnitAliases(
  supabase: SupabaseClient,
  organizationId: string,
): Promise<Map<string, string>> {
  const { data, error } = await supabase
    .from("organization_units")
    .select(
      "code, label, plural_label, unit_catalog(code, label, plural_label, aliases)",
    )
    .eq("organization_id", organizationId)
    .eq("is_active", true);
  if (error) throw new Error(error.message);

  const aliases = new Map<string, string>();
  for (const unit of data ?? []) {
    const catalog = Array.isArray(unit.unit_catalog)
      ? unit.unit_catalog[0]
      : unit.unit_catalog;
    const values = [
      unit.code,
      unit.label,
      unit.plural_label,
      catalog?.code,
      catalog?.label,
      catalog?.plural_label,
      ...(Array.isArray(catalog?.aliases) ? catalog.aliases : []),
    ];
    for (const value of values) {
      if (typeof value === "string" && value.trim()) {
        aliases.set(normalize(value), unit.code);
      }
    }
  }
  for (const [alias, code] of Array.from(aliases.entries())) {
    aliases.set(`per ${alias}`, code);
    aliases.set(`$/${alias}`, code);
    aliases.set(`$ per ${alias}`, code);
  }
  return aliases;
}

function resolveUnit(value: string, aliases: Map<string, string>): string | undefined {
  const simplified = normalize(value)
    .replace(/^\$\s*\/\s*/, "")
    .replace(/^\$\s+per\s+/, "")
    .replace(/^per\s+/, "")
    .replace(/s$/, "");
  return aliases.get(normalize(value)) ?? aliases.get(simplified);
}

function addWarning(warnings: string[], warning: string): void {
  if (warnings.length < MAX_WARNINGS) warnings.push(warning);
}

function logSyncStage(
  organizationId: string,
  stage: "suppliers" | "plants" | "materials",
  rows: number,
): void {
  console.info(JSON.stringify({
    level: "info",
    message: "Google Sheets synchronization stage started.",
    organizationId,
    stage,
    rows,
  }));
}

async function deactivateMissing({
  supabase,
  table,
  organizationId,
  currentKeys,
}: {
  supabase: SupabaseClient;
  table: "suppliers" | "supplier_plants" | "materials";
  organizationId: string;
  currentKeys: string[];
}): Promise<number> {
  const { data, error } = await supabase
    .from(table)
    .select("id, google_sheet_sync_key")
    .eq("organization_id", organizationId)
    .not("google_sheet_sync_key", "is", null);
  if (error) throw new Error(error.message);

  const current = new Set(currentKeys);
  const staleIds = (data ?? [])
    .filter(
      (row) =>
        typeof row.google_sheet_sync_key === "string" &&
        !current.has(row.google_sheet_sync_key),
    )
    .map((row) => row.id);
  if (!staleIds.length) return 0;

  const { error: updateError } = await supabase
    .from(table)
    .update({ is_active: false })
    .eq("organization_id", organizationId)
    .in("id", staleIds);
  if (updateError) throw new Error(updateError.message);
  return staleIds.length;
}

async function mapWithConcurrency<T, R>(
  values: T[],
  concurrency: number,
  mapper: (value: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(values.length);
  let nextIndex = 0;
  await Promise.all(
    Array.from({ length: Math.min(concurrency, values.length) }, async () => {
      while (nextIndex < values.length) {
        const index = nextIndex;
        nextIndex += 1;
        results[index] = await mapper(values[index]);
      }
    }),
  );
  return results;
}

function uniqueBy<T>(values: T[], key: (value: T) => string): T[] {
  return Array.from(
    new Map(values.map((value) => [key(value), value])).values(),
  );
}

function columnToIndex(column: string): number {
  return (
    column
      .toUpperCase()
      .split("")
      .reduce(
        (total, character) => total * 26 + character.charCodeAt(0) - 64,
        0,
      ) - 1
  );
}

function cell(row: unknown[], index: number): string {
  const value = row[index];
  return typeof value === "string" || typeof value === "number"
    ? String(value).trim()
    : "";
}

function cellValue(value: unknown): string {
  return typeof value === "string" || typeof value === "number"
    ? String(value).trim()
    : "";
}

function parsePrice(value: string): number | null {
  if (!value) return null;
  const number = Number(value.replace(/[$,\s]/g, ""));
  return Number.isFinite(number) && number >= 0 ? number : null;
}

function parseDate(value: string): string {
  const match = value.match(/^(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{2,4})$/);
  if (!match) return new Date().toISOString().slice(0, 10);
  const year = match[3].length === 2 ? `20${match[3]}` : match[3];
  const month = match[1].padStart(2, "0");
  const day = match[2].padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function syncKey(value: string): string {
  return createHash("sha256").update(normalize(value)).digest("hex");
}

function normalize(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}
