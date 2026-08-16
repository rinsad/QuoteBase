import { z } from "zod";

import {
  apiOk,
  badRequest,
  serverError,
  unauthorized,
} from "@/lib/api/responses";
import { getQuoteUnitConversions } from "@/lib/admin/units";
import { UUID_PATTERN } from "@/lib/api/validation";
import { getCurrentUser } from "@/lib/auth/current-user";
import { geocodeJobSiteAddress } from "@/lib/geo/geocode";
import { getMapboxIntegration } from "@/lib/integrations/mapbox";
import {
  normalizePricingConfig,
  normalizeVehicleTypes,
} from "@/lib/quotes/new-quote";
import {
  selectBestPlantForQuote,
  type PlantSelectionMaterial,
} from "@/lib/quotes/plant-selection";
import {
  normalizeCatalogMarkupRules,
  type CatalogMarkupRule,
  type PricingConfig,
  type VehicleCapacity,
} from "@/lib/quotes/pricing";
import { createClient } from "@/lib/supabase/server";

type TaxRateRecord = {
  id: string;
  city: string;
  county: string;
  state: string;
  rate: number;
};

type JobSiteRecord = {
  id: string;
  name: string;
  city: string;
  county: string;
  state: string;
  address: Record<string, unknown>;
  latitude: number | null;
  longitude: number | null;
};

const calculateQuoteSchema = z
  .object({
    material_id: z.string().regex(UUID_PATTERN),
    tax_rate_id: z.string().regex(UUID_PATTERN).optional().or(z.literal("")),
    quantity: z.coerce.number().positive().max(100000),
    job_site_id: z.string().regex(UUID_PATTERN).optional().or(z.literal("")),
    site_city: z.string().trim().max(120).optional().default(""),
    site_county: z.string().trim().max(120).optional().default(""),
    site_state: z.string().trim().min(2).max(2).optional().default("CA"),
    site_latitude: z.coerce.number().min(-90).max(90).nullable().optional(),
    site_longitude: z.coerce.number().min(-180).max(180).nullable().optional(),
    manual_route_distance_miles: z.coerce
      .number()
      .min(0)
      .max(10000)
      .nullable()
      .optional(),
    manual_deadhead_distance_miles: z.coerce
      .number()
      .min(0)
      .max(10000)
      .nullable()
      .optional(),
    payment_terms: z.string().trim().max(80).optional().default(""),
    use_selected_plant: z.boolean().optional().default(false),
    material_unit_price_override: z.coerce
      .number()
      .positive()
      .max(1000000)
      .nullable()
      .optional(),
    truck_rate_override: z
      .enum(["floor", "standard", "target", "premium", "stretch"])
      .nullable()
      .optional(),
    material_minimum_override: z.coerce
      .number()
      .min(0)
      .max(1000000)
      .nullable()
      .optional(),
    trucking_minimum_override: z.coerce
      .number()
      .min(0)
      .max(1000000)
      .nullable()
      .optional(),
  })
  .superRefine((value, context) => {
    const hasLatitude =
      value.site_latitude !== undefined && value.site_latitude !== null;
    const hasLongitude =
      value.site_longitude !== undefined && value.site_longitude !== null;

    if (hasLatitude !== hasLongitude) {
      context.addIssue({
        code: "custom",
        message: "site_latitude and site_longitude must be provided together.",
        path: ["site_latitude"],
      });
    }
  });

export async function POST(request: Request) {
  const user = await getCurrentUser();

  if (!user) {
    return unauthorized();
  }

  const supabase = await createClient();

  if (!supabase) {
    return serverError("Supabase is not configured.");
  }

  const parsed = await parseCalculateQuoteBody(request);

  if (!parsed.ok) {
    return badRequest(parsed.message);
  }

  const [
    materialResult,
    pricingConfigResult,
    vehicleTypesResult,
    jobSiteResult,
    markupRulesResult,
    unitConversions,
  ] = await Promise.all([
    supabase
      .from("materials")
      .select(
        "id, supplier_id, supplier_catalog_version_id, supplier_catalog_item_id, catalog_category, name, tier, unit, cost_per_unit, supplier_plants!inner(id, supplier_id, name, latitude, longitude)",
      )
      .eq("organization_id", user.organization_id)
      .eq("id", parsed.value.material_id)
      .eq("is_active", true)
      .eq("supplier_plants.is_active", true)
      .single<PlantSelectionMaterial>(),
    supabase
      .from("pricing_config")
      .select(
        "tier_r1_min, tier_r1_max, tier_r2_min, tier_r2_max, tier_r3_min, tier_r3_max, tier_r4_min, tier_r4_max, truck_floor_rate, truck_standard_rate, truck_target_rate, truck_premium_rate, truck_stretch_rate, default_truck_rate, material_minimum, trucking_minimum, fuel_surcharge_per_load, environmental_fee_per_load, cc_surcharge_pct, overhead_per_ton",
      )
      .eq("organization_id", user.organization_id)
      .single<PricingConfig>(),
    supabase
      .from("vehicle_types")
      .select("id, name, capacity_tons, capacity_cy")
      .eq("organization_id", user.organization_id)
      .eq("is_active", true)
      .order("capacity_tons", { ascending: false })
      .returns<VehicleCapacity[]>(),
    parsed.value.job_site_id
      ? supabase
          .from("job_sites")
          .select("id, name, city, county, state, address, latitude, longitude")
          .eq("organization_id", user.organization_id)
          .eq("id", parsed.value.job_site_id)
          .eq("is_active", true)
          .single<JobSiteRecord>()
      : Promise.resolve({ data: null }),
    supabase
      .from("supplier_markup_rules")
      .select(
        "id, supplier_id, scope, category, catalog_item_id, markup_type, markup_value, margin_floor_pct, priority, effective_from, effective_to",
      )
      .eq("organization_id", user.organization_id)
      .eq("is_active", true)
      .returns<CatalogMarkupRule[]>(),
    getQuoteUnitConversions({
      supabase,
      organizationId: user.organization_id,
    }),
  ]);

  if (!materialResult.data || !pricingConfigResult.data) {
    return badRequest("Material, tax, or pricing configuration is missing.");
  }

  if (parsed.value.job_site_id && !jobSiteResult.data) {
    return badRequest("Selected job site was not found.");
  }

  const mapboxIntegration = await getMapboxIntegration({
    supabase,
    organizationId: user.organization_id,
  });
  const mapboxAccessToken =
    mapboxIntegration?.isEnabled && mapboxIntegration.publicAccessToken
      ? mapboxIntegration.publicAccessToken
      : null;
  const jobSiteCoordinates = await resolveJobSiteCoordinates({
    jobSite: jobSiteResult.data ?? null,
    explicitLatitude: parsed.value.site_latitude ?? null,
    explicitLongitude: parsed.value.site_longitude ?? null,
    fallbackCity: parsed.value.site_city,
    fallbackCounty: parsed.value.site_county,
    fallbackState: parsed.value.site_state,
    mapboxAccessToken,
  });
  const taxRate = await resolveSalesTaxRate({
    supabase,
    organizationId: user.organization_id,
    taxRateId: parsed.value.tax_rate_id ?? "",
    city: jobSiteResult.data?.city ?? parsed.value.site_city,
    county: jobSiteResult.data?.county ?? parsed.value.site_county,
    state: jobSiteResult.data?.state ?? parsed.value.site_state,
  });

  if (!taxRate) {
    return badRequest("No sales tax rate was found for the delivery city.");
  }

  try {
    const recommendation = await selectBestPlantForQuote({
      supabase,
      organizationId: user.organization_id,
      requestedMaterial: materialResult.data,
      jobSite: jobSiteCoordinates,
      taxRate: Number(taxRate.rate),
      quantity: parsed.value.quantity,
      pricingConfig: normalizePricingConfig(pricingConfigResult.data),
      vehicleTypes: normalizeVehicleTypes(vehicleTypesResult.data ?? []),
      unitConversions,
      useRequestedPlant: parsed.value.use_selected_plant,
      materialUnitPriceOverride:
        parsed.value.material_unit_price_override ?? null,
      truckRateOverride:
        user.role === "admin" ? (parsed.value.truck_rate_override ?? null) : null,
      materialMinimumOverride:
        parsed.value.material_minimum_override ?? null,
      truckingMinimumOverride:
        parsed.value.trucking_minimum_override ?? null,
      paymentTerms: parsed.value.payment_terms,
      manualRouteDistanceMiles:
        parsed.value.manual_route_distance_miles ?? null,
      manualDeadheadDistanceMiles:
        parsed.value.manual_deadhead_distance_miles ?? null,
      catalogMarkupRules: normalizeCatalogMarkupRules(
        markupRulesResult.data ?? [],
      ),
      mapboxAccessToken,
    });
    const calculation = recommendation.calculation;

    return apiOk({
      calculation: {
        requested_material_id: materialResult.data.id,
        selected_material_id: recommendation.material.id,
        selected_supplier_id: recommendation.material.supplier_id,
        selected_supplier_name: recommendation.supplierName,
        material_name: recommendation.material.name,
        material_tier: recommendation.material.tier,
        unit: recommendation.material.unit,
        quantity: parsed.value.quantity,
        tax_rate: {
          id: taxRate.id,
          city: taxRate.city,
          county: taxRate.county,
          state: taxRate.state,
          rate: Number(taxRate.rate),
        },
        vehicle_type_id: calculation.vehicleTypeId,
        vehicle_name: calculation.vehicleName,
        quote_quantity_basis: calculation.quoteQuantityBasis,
        quote_quantity_factor: calculation.quoteQuantityFactor,
        truck_capacity_quantity: calculation.truckCapacityQuantity,
        load_count: calculation.loadCount,
        trucking_rate_key: calculation.truckingRateKey,
        trucking_hourly_rate: calculation.truckingHourlyRate,
        unit_cost: Number(recommendation.material.cost_per_unit),
        markup_per_unit: calculation.markupPerUnit,
        markup_pct: calculation.markupPct,
        markup_source: calculation.markupSource,
        markup_rule_id: calculation.markupRuleId,
        price_override: parsed.value.material_unit_price_override !== undefined &&
          parsed.value.material_unit_price_override !== null,
        material_minimum_override:
          parsed.value.material_minimum_override ?? null,
        trucking_minimum_override:
          parsed.value.trucking_minimum_override ?? null,
        minimum_override:
          parsed.value.material_minimum_override !== undefined &&
            parsed.value.material_minimum_override !== null ||
          parsed.value.trucking_minimum_override !== undefined &&
            parsed.value.trucking_minimum_override !== null,
        material_unit_price: calculation.materialUnitPrice,
        material_subtotal: calculation.materialSubtotal,
        gross_margin_pct: calculation.grossMarginPct,
        margin_floor_pct: calculation.marginFloorPct,
        margin_floor_warning: calculation.marginFloorWarning,
        trucking_rate_per_unit: calculation.truckingRatePerUnit,
        trucking_subtotal: calculation.truckingSubtotal,
        fees_subtotal: calculation.feesSubtotal,
        tax_total: calculation.taxTotal,
        total: calculation.total,
        route_distance: recommendation.routeDistance,
        deadhead_distance: recommendation.deadheadDistance,
        plant_selection_reason: recommendation.selectionReason,
        job_site_id: parsed.value.job_site_id || null,
      },
    });
  } catch {
    return serverError("Could not calculate quote.");
  }
}

async function parseCalculateQuoteBody(
  request: Request,
): Promise<
  | { ok: true; value: z.infer<typeof calculateQuoteSchema> }
  | { ok: false; message: string }
> {
  let payload: unknown;

  try {
    payload = await request.json();
  } catch {
    return { ok: false, message: "Request body must be valid JSON." };
  }

  const result = calculateQuoteSchema.safeParse(payload);

  if (!result.success) {
    return {
      ok: false,
      message: result.error.issues.map((issue) => issue.message).join(" "),
    };
  }

  return { ok: true, value: result.data };
}

async function resolveSalesTaxRate({
  supabase,
  organizationId,
  taxRateId,
  city,
  county,
  state,
}: {
  supabase: Awaited<ReturnType<typeof createClient>>;
  organizationId: string;
  taxRateId: string;
  city: string;
  county: string;
  state: string;
}): Promise<TaxRateRecord | null> {
  if (!supabase) {
    return null;
  }

  if (taxRateId) {
    const { data } = await supabase
      .from("sales_tax_rates")
      .select("id, city, county, state, rate")
      .eq("organization_id", organizationId)
      .eq("id", taxRateId)
      .single<TaxRateRecord>();

    return data ?? null;
  }

  const exact = await findSalesTaxRate({
    supabase,
    organizationId,
    city,
    county,
    state,
    includeCounty: true,
  });

  return (
    exact ??
    (await findSalesTaxRate({
      supabase,
      organizationId,
      city,
      county,
      state,
      includeCounty: false,
    }))
  );
}

async function findSalesTaxRate({
  supabase,
  organizationId,
  city,
  county,
  state,
  includeCounty,
}: {
  supabase: NonNullable<Awaited<ReturnType<typeof createClient>>>;
  organizationId: string;
  city: string;
  county: string;
  state: string;
  includeCounty: boolean;
}): Promise<TaxRateRecord | null> {
  if (!city || !state || (includeCounty && !county)) {
    return null;
  }

  let query = supabase
    .from("sales_tax_rates")
    .select("id, city, county, state, rate")
    .eq("organization_id", organizationId)
    .ilike("city", city)
    .ilike("state", state)
    .order("effective_date", { ascending: false })
    .limit(1);

  if (includeCounty) {
    query = query.ilike("county", county);
  }

  const { data } = await query.maybeSingle<TaxRateRecord>();

  return data ?? null;
}

async function resolveJobSiteCoordinates({
  jobSite,
  explicitLatitude,
  explicitLongitude,
  fallbackCity,
  fallbackCounty,
  fallbackState,
  mapboxAccessToken,
}: {
  jobSite: JobSiteRecord | null;
  explicitLatitude: number | null;
  explicitLongitude: number | null;
  fallbackCity: string;
  fallbackCounty: string;
  fallbackState: string;
  mapboxAccessToken: string | null;
}): Promise<{ latitude: number | null; longitude: number | null }> {
  if (explicitLatitude !== null && explicitLongitude !== null) {
    return {
      latitude: roundCoordinate(explicitLatitude),
      longitude: roundCoordinate(explicitLongitude),
    };
  }

  const storedCoordinates = {
    latitude: nullableNumber(jobSite?.latitude ?? null),
    longitude: nullableNumber(jobSite?.longitude ?? null),
  };

  if (
    storedCoordinates.latitude !== null &&
    storedCoordinates.longitude !== null
  ) {
    return storedCoordinates;
  }

  const geocoded = await geocodeJobSiteAddress({
    line1: addressLine(jobSite?.address ?? {}),
    city: jobSite?.city ?? fallbackCity,
    county: jobSite?.county ?? fallbackCounty,
    state: jobSite?.state ?? fallbackState,
    apiKey: mapboxAccessToken,
  });

  return geocoded ?? storedCoordinates;
}

function nullableNumber(value: number | null): number | null {
  return value === null ? null : Number(value);
}

function roundCoordinate(value: number): number {
  return Math.round((value + Number.EPSILON) * 10000000) / 10000000;
}

function addressLine(address: Record<string, unknown>): string | null {
  const line1 = address.line1;

  return typeof line1 === "string" && line1.trim() ? line1.trim() : null;
}
