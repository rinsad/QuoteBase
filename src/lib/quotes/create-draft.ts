import type { AppUser } from "@/lib/auth/current-user";
import { logAction } from "@/lib/audit/log-action";
import { isFeatureEnabled } from "@/lib/features/flags";
import { geocodeJobSiteAddress } from "@/lib/geo/geocode";
import { getGoogleMapsIntegration } from "@/lib/integrations/google-maps";
import {
  normalizePricingConfig,
  normalizeVehicleTypes,
} from "@/lib/quotes/new-quote";
import {
  selectBestPlantForQuote,
  type PlantSelectionMaterial,
} from "@/lib/quotes/plant-selection";
import {
  calculateQuoteDraft,
  normalizeCatalogMarkupRules,
  resolveCatalogMarkupRule,
  type CatalogMarkupRule,
  type PricingConfig,
  type TruckRateKey,
  type VehicleCapacity,
} from "@/lib/quotes/pricing";
import type { createClient } from "@/lib/supabase/server";

type SupabaseClient = NonNullable<Awaited<ReturnType<typeof createClient>>>;

export type CreateQuoteDraftInput = {
  customerId: string;
  jobSiteId: string;
  materialId: string;
  taxRateId: string;
  quantity: number;
  lineItems: CreateQuoteDraftLineInput[];
  notes: string;
  useSelectedPlant: boolean;
  materialUnitPriceOverride: number | null;
  truckRateOverride: TruckRateKey | null;
  materialMinimumOverride: number | null;
  truckingMinimumOverride: number | null;
  competitorPrice: number | null;
  manualRouteDistanceMiles: number | null;
  manualDeadheadDistanceMiles: number | null;
};

export type CreateQuoteDraftLineInput = {
  materialId: string;
  quantity: number;
  materialUnitPriceOverride: number | null;
};

export type CreatedQuoteDraft = {
  id: string;
  quote_number: string;
};

type CustomerRecord = {
  id: string;
  name: string;
  payment_terms: string | null;
};

type JobSiteRecord = {
  id: string;
  customer_id: string;
  name: string;
  city: string;
  county: string;
  state: string;
  address: Record<string, unknown>;
  latitude: number | null;
  longitude: number | null;
};

type TaxRateRecord = {
  id: string;
  rate: number;
};

export async function createQuoteDraftRecord({
  supabase,
  user,
  input,
}: {
  supabase: SupabaseClient;
  user: AppUser;
  input: CreateQuoteDraftInput;
}): Promise<CreatedQuoteDraft> {
  if (
    !(await isFeatureEnabled({
      supabase,
      organizationId: user.organization_id,
      featureName: "quote_creation",
      defaultValue: true,
    }))
  ) {
    throw new Error("Quote creation is not enabled for this organization.");
  }
  const competitiveIntelligenceEnabled = await isFeatureEnabled({
    supabase,
    organizationId: user.organization_id,
    featureName: "competitive_intelligence_input",
  });

  if (input.competitorPrice !== null && !competitiveIntelligenceEnabled) {
    throw new Error("Competitive intelligence input is not enabled.");
  }

  const requestedLines = input.lineItems.length
    ? input.lineItems
    : [
        {
          materialId: input.materialId,
          quantity: input.quantity,
          materialUnitPriceOverride: input.materialUnitPriceOverride,
        },
      ];

  const [
    materialsResult,
    pricingConfigResult,
    vehicleTypesResult,
    existingCustomerResult,
    existingJobSiteResult,
    markupRulesResult,
  ] = await Promise.all([
    supabase
      .from("materials")
      .select(
        "id, supplier_id, supplier_catalog_version_id, supplier_catalog_item_id, catalog_category, name, tier, unit, cost_per_unit, suppliers!inner(name, latitude, longitude)",
      )
      .eq("organization_id", user.organization_id)
      .in(
        "id",
        Array.from(new Set(requestedLines.map((line) => line.materialId))),
      )
      .eq("is_active", true)
      .eq("suppliers.is_active", true)
      .returns<PlantSelectionMaterial[]>(),
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
    input.customerId
      ? supabase
          .from("customers")
          .select("id, name, payment_terms")
          .eq("organization_id", user.organization_id)
          .eq("id", input.customerId)
          .eq("is_active", true)
          .single<CustomerRecord>()
      : Promise.resolve({ data: null }),
    input.jobSiteId
      ? supabase
          .from("job_sites")
          .select(
            "id, customer_id, name, city, county, state, address, latitude, longitude",
          )
          .eq("organization_id", user.organization_id)
          .eq("id", input.jobSiteId)
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
  ]);

  if (!materialsResult.data?.length || !pricingConfigResult.data) {
    throw new Error("Material, tax, or pricing configuration is missing.");
  }

  if (!existingCustomerResult.data) {
    throw new Error("Select an existing customer before creating a quote.");
  }
  const customer = existingCustomerResult.data;
  const paymentTerms = customer.payment_terms ?? "COD";

  if (!existingJobSiteResult.data) {
    throw new Error("Select an existing job site before creating a quote.");
  }
  const jobSite = existingJobSiteResult.data;

  if (jobSite.customer_id !== customer.id) {
    throw new Error("The selected job site does not belong to the selected customer.");
  }

  const taxRate = await resolveSalesTaxRate({
    supabase,
    organizationId: user.organization_id,
    taxRateId: input.taxRateId,
    city: jobSite.city,
    county: jobSite.county,
    state: jobSite.state,
  });

  if (!taxRate) {
    throw new Error("No sales tax rate was found for the delivery city.");
  }

  const pricingConfig = normalizePricingConfig(pricingConfigResult.data);
  const vehicleTypes = normalizeVehicleTypes(vehicleTypesResult.data ?? []);
  const catalogMarkupRules = normalizeCatalogMarkupRules(
    markupRulesResult.data ?? [],
  );
  const googleMapsIntegration = await getGoogleMapsIntegration({
    supabase,
    organizationId: user.organization_id,
  });
  const googleMapsApiKey =
    googleMapsIntegration?.isEnabled && googleMapsIntegration.apiKey
      ? googleMapsIntegration.apiKey
      : null;
  const materialById = new Map(
    materialsResult.data.map((material) => [material.id, material]),
  );
  const jobSiteCoordinates = await resolveJobSiteCoordinates({
    supabase,
    user,
    jobSite,
    googleMapsApiKey,
  });
  const pricedLines = await Promise.all(
    requestedLines.map(async (line) => {
      const requestedMaterial = materialById.get(line.materialId);

      if (!requestedMaterial) {
        throw new Error("One of the selected materials is no longer available.");
      }

      const recommendation = await selectBestPlantForQuote({
        supabase,
        organizationId: user.organization_id,
        requestedMaterial,
        jobSite: jobSiteCoordinates,
        taxRate: Number(taxRate.rate),
        quantity: line.quantity,
        pricingConfig,
        vehicleTypes,
        useRequestedPlant: input.useSelectedPlant,
        materialUnitPriceOverride: line.materialUnitPriceOverride,
        truckRateOverride: input.truckRateOverride,
        materialMinimumOverride: input.materialMinimumOverride,
        truckingMinimumOverride: input.truckingMinimumOverride,
        paymentTerms,
        manualRouteDistanceMiles: input.manualRouteDistanceMiles,
        manualDeadheadDistanceMiles: input.manualDeadheadDistanceMiles,
        catalogMarkupRules,
        googleMapsApiKey,
      });
      const material = recommendation.material;
      const catalogMarkupRule = resolveCatalogMarkupRule(
        material,
        catalogMarkupRules,
      );
      const calculation = calculateQuoteDraft({
        costPerUnit: Number(material.cost_per_unit),
        quantity: line.quantity,
        tier: material.tier,
        unit: material.unit,
        taxRate: Number(taxRate.rate),
        pricingConfig,
        vehicleTypes,
        routeDurationSeconds:
          recommendation.routeDistance?.durationSeconds ?? null,
        deadheadDurationSeconds:
          recommendation.deadheadDistance?.durationSeconds ?? null,
        materialUnitPriceOverride: line.materialUnitPriceOverride,
        truckRateOverride: input.truckRateOverride,
        materialMinimumOverride: input.materialMinimumOverride,
        truckingMinimumOverride: input.truckingMinimumOverride,
        paymentTerms,
        applyCreditCardSurcharge: false,
        catalogMarkupRule,
      });

      return {
        input: line,
        requestedMaterial,
        recommendation,
        material,
        calculation,
        catalogMarkupRule,
      };
    }),
  );
  const totals = pricedLines.reduce(
    (sum, line) => ({
      materialSubtotal: sum.materialSubtotal + line.calculation.materialSubtotal,
      truckingSubtotal: sum.truckingSubtotal + line.calculation.truckingSubtotal,
      feesSubtotal: sum.feesSubtotal + line.calculation.feesSubtotal,
      taxTotal: sum.taxTotal + line.calculation.taxTotal,
      total: sum.total + line.calculation.total,
    }),
    {
      materialSubtotal: 0,
      truckingSubtotal: 0,
      feesSubtotal: 0,
      taxTotal: 0,
      total: 0,
    },
  );
  const quoteNumber = await createQuoteNumber({
    supabase,
    organizationId: user.organization_id,
  });

  const { data: quote, error: quoteError } = await supabase
    .from("quotes")
    .insert({
      organization_id: user.organization_id,
      quote_number: quoteNumber,
      customer_id: customer.id,
      job_site_id: jobSite.id,
      requested_by: user.id,
      tax_rate_id: taxRate.id,
      status: "draft",
      material_subtotal: roundMoney(totals.materialSubtotal),
      trucking_subtotal: roundMoney(totals.truckingSubtotal),
      fees_subtotal: roundMoney(totals.feesSubtotal),
      tax_total: roundMoney(totals.taxTotal),
      total: roundMoney(totals.total),
      notes: input.notes || null,
      is_active: true,
    })
    .select("id, quote_number")
    .single<CreatedQuoteDraft>();

  if (quoteError || !quote) {
    throw new Error(quoteError?.message ?? "Could not create the quote draft.");
  }

  const { error: itemError } = await supabase.from("quote_items").insert(
    pricedLines.map((line) => ({
      organization_id: user.organization_id,
      quote_id: quote.id,
      supplier_id: line.material.supplier_id,
      material_id: line.material.id,
      supplier_catalog_version_id: line.material.supplier_catalog_version_id,
      supplier_catalog_item_id: line.material.supplier_catalog_item_id,
      quantity: line.input.quantity,
      unit: line.material.unit,
      unit_cost: Number(line.material.cost_per_unit),
      markup_per_unit: line.calculation.markupPerUnit,
      markup_pct: line.calculation.markupPct,
      material_unit_price: line.calculation.materialUnitPrice,
      material_subtotal: line.calculation.materialSubtotal,
      vehicle_type_id: line.calculation.vehicleTypeId,
      load_count: line.calculation.loadCount,
      trucking_rate_per_unit: line.calculation.truckingRatePerUnit,
      trucking_subtotal: line.calculation.truckingSubtotal,
      fees_subtotal: line.calculation.feesSubtotal,
      line_total: line.calculation.total,
      is_active: true,
    })),
  );

  if (itemError) {
    await supabase
      .from("quotes")
      .update({
        is_active: false,
        notes: appendDraftFailureNote(input.notes, itemError.message),
      })
      .eq("organization_id", user.organization_id)
      .eq("id", quote.id);

    throw new Error(itemError.message);
  }

  await logAction({
    user,
    action: "quote.draft_created",
    targetTable: "quotes",
    targetId: quote.id,
    before: null,
    after: {
      quote_number: quote.quote_number,
      status: "draft",
      total: roundMoney(totals.total),
    },
    metadata: {
      customer_id: customer.id,
      job_site_id: jobSite.id,
      line_count: pricedLines.length,
      line_items: pricedLines.map((line) => ({
        material_id: line.material.id,
        requested_material_id: line.requestedMaterial.id,
        supplier_catalog_version_id: line.material.supplier_catalog_version_id,
        supplier_catalog_item_id: line.material.supplier_catalog_item_id,
        catalog_markup_rule_id: line.catalogMarkupRule?.id ?? null,
        catalog_markup_source: line.calculation.markupSource,
        quantity: line.input.quantity,
        material_unit_price: line.calculation.materialUnitPrice,
        total: line.calculation.total,
        gross_margin_pct: line.calculation.grossMarginPct,
        margin_floor_warning: line.calculation.marginFloorWarning,
        selected_supplier_id: line.material.supplier_id,
        selected_supplier_name: line.recommendation.supplierName,
        plant_selection_reason: line.recommendation.selectionReason,
        route_distance_miles:
          line.recommendation.routeDistance?.distanceMiles ?? null,
        route_distance_source:
          line.recommendation.routeDistance?.source ?? null,
        deadhead_distance_miles:
          line.recommendation.deadheadDistance?.distanceMiles ?? null,
        deadhead_distance_source:
          line.recommendation.deadheadDistance?.source ?? null,
      })),
      new_customer: false,
      plant_override: input.useSelectedPlant,
      price_override: pricedLines.some(
        (line) => line.input.materialUnitPriceOverride !== null,
      ),
      truck_rate_override: input.truckRateOverride,
      material_minimum_override: input.materialMinimumOverride,
      trucking_minimum_override: input.truckingMinimumOverride,
      minimum_override:
        input.materialMinimumOverride !== null ||
        input.truckingMinimumOverride !== null,
      competitor_price: competitiveIntelligenceEnabled
        ? input.competitorPrice
        : null,
      manual_route_distance_miles: input.manualRouteDistanceMiles,
      manual_deadhead_distance_miles: input.manualDeadheadDistanceMiles,
    },
  });

  return quote;
}

async function resolveJobSiteCoordinates({
  supabase,
  user,
  jobSite,
  googleMapsApiKey,
}: {
  supabase: SupabaseClient;
  user: AppUser;
  jobSite: JobSiteRecord;
  googleMapsApiKey: string | null;
}): Promise<{ latitude: number | null; longitude: number | null }> {
  const storedCoordinates = {
    latitude: jobSite.latitude === null ? null : Number(jobSite.latitude),
    longitude: jobSite.longitude === null ? null : Number(jobSite.longitude),
  };

  if (
    storedCoordinates.latitude !== null &&
    storedCoordinates.longitude !== null
  ) {
    return storedCoordinates;
  }

  const geocoded = await geocodeJobSiteAddress({
    line1: addressLine(jobSite.address),
    city: jobSite.city,
    county: jobSite.county,
    state: jobSite.state,
    apiKey: googleMapsApiKey,
  });

  if (!geocoded) {
    return storedCoordinates;
  }

  const { error } = await supabase
    .from("job_sites")
    .update({
      latitude: geocoded.latitude,
      longitude: geocoded.longitude,
    })
    .eq("organization_id", user.organization_id)
    .eq("id", jobSite.id);

  if (!error) {
    await logAction({
      user,
      action: "job_site.geocoded",
      targetTable: "job_sites",
      targetId: jobSite.id,
      before: storedCoordinates,
      after: geocoded,
    });
  }

  return geocoded;
}

async function resolveSalesTaxRate({
  supabase,
  organizationId,
  taxRateId,
  city,
  county,
  state,
}: {
  supabase: SupabaseClient;
  organizationId: string;
  taxRateId: string;
  city: string;
  county: string;
  state: string;
}): Promise<TaxRateRecord | null> {
  if (taxRateId) {
    const { data } = await supabase
      .from("sales_tax_rates")
      .select("id, rate")
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
  supabase: SupabaseClient;
  organizationId: string;
  city: string;
  county: string;
  state: string;
  includeCounty: boolean;
}): Promise<TaxRateRecord | null> {
  let query = supabase
    .from("sales_tax_rates")
    .select("id, rate")
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

async function createQuoteNumber({
  supabase,
  organizationId,
}: {
  supabase: SupabaseClient;
  organizationId: string;
}): Promise<string> {
  const { data } = await supabase
    .from("quotes")
    .select("quote_number")
    .eq("organization_id", organizationId)
    .like("quote_number", "Q-%")
    .order("created_at", { ascending: false })
    .limit(100)
    .returns<Array<{ quote_number: string }>>();
  const nextNumber =
    Math.max(
      1000,
      ...(data ?? []).map((quote) => {
        const match = /^Q-(\d+)$/.exec(quote.quote_number);

        return match ? Number(match[1]) : 0;
      }),
    ) + 1;

  return `Q-${nextNumber}`;
}

function appendDraftFailureNote(notes: string, errorMessage: string): string {
  const failureNote = `Draft item insert failed: ${errorMessage}`;

  return notes ? `${notes}\n\n${failureNote}` : failureNote;
}

function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function addressLine(address: Record<string, unknown>): string | null {
  const line1 = address.line1;

  return typeof line1 === "string" && line1.trim() ? line1.trim() : null;
}
