import { z } from "zod";

import {
  apiOk,
  badRequest,
  serverError,
  unauthorized,
} from "@/lib/api/responses";
import { UUID_PATTERN } from "@/lib/api/validation";
import { getCurrentUser } from "@/lib/auth/current-user";
import {
  normalizePricingConfig,
  normalizeVehicleTypes,
} from "@/lib/quotes/new-quote";
import {
  selectBestPlantForQuote,
  type PlantSelectionMaterial,
} from "@/lib/quotes/plant-selection";
import {
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
  latitude: number | null;
  longitude: number | null;
};

const calculateQuoteSchema = z
  .object({
    material_id: z.string().regex(UUID_PATTERN),
    tax_rate_id: z.string().regex(UUID_PATTERN),
    quantity: z.coerce.number().positive().max(100000),
    job_site_id: z.string().regex(UUID_PATTERN).optional().or(z.literal("")),
    site_latitude: z.coerce.number().min(-90).max(90).nullable().optional(),
    site_longitude: z.coerce.number().min(-180).max(180).nullable().optional(),
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
    taxRateResult,
    pricingConfigResult,
    vehicleTypesResult,
    jobSiteResult,
  ] = await Promise.all([
    supabase
      .from("materials")
      .select(
        "id, supplier_id, name, tier, unit, cost_per_unit, suppliers(name, latitude, longitude)",
      )
      .eq("organization_id", user.organization_id)
      .eq("id", parsed.value.material_id)
      .eq("is_active", true)
      .single<PlantSelectionMaterial>(),
    supabase
      .from("sales_tax_rates")
      .select("id, city, county, state, rate")
      .eq("organization_id", user.organization_id)
      .eq("id", parsed.value.tax_rate_id)
      .single<TaxRateRecord>(),
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
          .select("id, name, latitude, longitude")
          .eq("organization_id", user.organization_id)
          .eq("id", parsed.value.job_site_id)
          .eq("is_active", true)
          .single<JobSiteRecord>()
      : Promise.resolve({ data: null }),
  ]);

  if (!materialResult.data || !taxRateResult.data || !pricingConfigResult.data) {
    return badRequest("Material, tax, or pricing configuration is missing.");
  }

  if (parsed.value.job_site_id && !jobSiteResult.data) {
    return badRequest("Selected job site was not found.");
  }

  const jobSiteCoordinates = {
    latitude:
      parsed.value.site_latitude === undefined ||
      parsed.value.site_latitude === null
        ? nullableNumber(jobSiteResult.data?.latitude ?? null)
        : roundCoordinate(parsed.value.site_latitude),
    longitude:
      parsed.value.site_longitude === undefined ||
      parsed.value.site_longitude === null
        ? nullableNumber(jobSiteResult.data?.longitude ?? null)
        : roundCoordinate(parsed.value.site_longitude),
  };

  try {
    const recommendation = await selectBestPlantForQuote({
      supabase,
      organizationId: user.organization_id,
      requestedMaterial: materialResult.data,
      jobSite: jobSiteCoordinates,
      taxRate: Number(taxRateResult.data.rate),
      quantity: parsed.value.quantity,
      pricingConfig: normalizePricingConfig(pricingConfigResult.data),
      vehicleTypes: normalizeVehicleTypes(vehicleTypesResult.data ?? []),
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
          id: taxRateResult.data.id,
          city: taxRateResult.data.city,
          county: taxRateResult.data.county,
          state: taxRateResult.data.state,
          rate: Number(taxRateResult.data.rate),
        },
        vehicle_type_id: calculation.vehicleTypeId,
        vehicle_name: calculation.vehicleName,
        load_count: calculation.loadCount,
        unit_cost: Number(recommendation.material.cost_per_unit),
        markup_pct: calculation.markupPct,
        material_unit_price: calculation.materialUnitPrice,
        material_subtotal: calculation.materialSubtotal,
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

function nullableNumber(value: number | null): number | null {
  return value === null ? null : Number(value);
}

function roundCoordinate(value: number): number {
  return Math.round((value + Number.EPSILON) * 10000000) / 10000000;
}
