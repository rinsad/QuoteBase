import { randomUUID } from "crypto";

import type { AppUser } from "@/lib/auth/current-user";
import { logAction } from "@/lib/audit/log-action";
import { isFeatureEnabled } from "@/lib/features/flags";
import { pushCustomerToPipedrive } from "@/lib/integrations/pipedrive";
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
  type PricingConfig,
  type TruckRateKey,
  type VehicleCapacity,
} from "@/lib/quotes/pricing";
import type { createClient } from "@/lib/supabase/server";

type SupabaseClient = NonNullable<Awaited<ReturnType<typeof createClient>>>;

export type CreateQuoteDraftInput = {
  customerId: string;
  customerName: string;
  companyName: string;
  contactName: string;
  contactEmail: string;
  contactPhone: string;
  customerAddress: string;
  paymentTerms: string;
  jobSiteId: string;
  siteName: string;
  siteAddress: string;
  siteCity: string;
  siteCounty: string;
  siteState: string;
  siteLatitude: number | null;
  siteLongitude: number | null;
  materialId: string;
  taxRateId: string;
  quantity: number;
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

export type CreatedQuoteDraft = {
  id: string;
  quote_number: string;
};

type CustomerRecord = {
  id: string;
  name: string;
};

type ResolvedCustomer = {
  customer: CustomerRecord;
  isNew: boolean;
};

type JobSiteRecord = {
  id: string;
  customer_id: string;
  name: string;
  city: string;
  county: string;
  state: string;
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

  const [
    materialResult,
    pricingConfigResult,
    vehicleTypesResult,
    existingCustomerResult,
    existingJobSiteResult,
  ] = await Promise.all([
    supabase
      .from("materials")
      .select(
        "id, supplier_id, name, tier, unit, cost_per_unit, suppliers!inner(name, latitude, longitude)",
      )
      .eq("organization_id", user.organization_id)
      .eq("id", input.materialId)
      .eq("is_active", true)
      .eq("suppliers.is_active", true)
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
    input.customerId
      ? supabase
          .from("customers")
          .select("id, name")
          .eq("organization_id", user.organization_id)
          .eq("id", input.customerId)
          .eq("is_active", true)
          .single<CustomerRecord>()
      : Promise.resolve({ data: null }),
    input.jobSiteId
      ? supabase
          .from("job_sites")
          .select("id, customer_id, name, city, county, state, latitude, longitude")
          .eq("organization_id", user.organization_id)
          .eq("id", input.jobSiteId)
          .eq("is_active", true)
          .single<JobSiteRecord>()
      : Promise.resolve({ data: null }),
  ]);

  if (!materialResult.data || !pricingConfigResult.data) {
    throw new Error("Material, tax, or pricing configuration is missing.");
  }

  const resolvedCustomer = await resolveCustomer({
    supabase,
    organizationId: user.organization_id,
    existingCustomer: existingCustomerResult.data,
    customerName: input.customerName,
    companyName: input.companyName,
    contactName: input.contactName,
    contactEmail: input.contactEmail,
    contactPhone: input.contactPhone,
    customerAddress: input.customerAddress,
    paymentTerms: input.paymentTerms,
  });

  if (!resolvedCustomer) {
    throw new Error("Select an existing customer or enter a new customer name.");
  }
  const customer = resolvedCustomer.customer;

  const jobSite = await resolveJobSite({
    supabase,
    organizationId: user.organization_id,
    customerId: customer.id,
    existingJobSite: existingJobSiteResult.data,
    siteName: input.siteName,
    siteAddress: input.siteAddress,
    siteCity: input.siteCity,
    siteCounty: input.siteCounty,
    siteState: input.siteState,
    siteLatitude: input.siteLatitude,
    siteLongitude: input.siteLongitude,
  });

  if (!jobSite) {
    throw new Error("Select an existing job site or enter the new site details.");
  }

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
  const requestedMaterial = materialResult.data;
  const recommendation = await selectBestPlantForQuote({
    supabase,
    organizationId: user.organization_id,
    requestedMaterial,
    jobSite: {
      latitude: jobSite.latitude === null ? null : Number(jobSite.latitude),
      longitude: jobSite.longitude === null ? null : Number(jobSite.longitude),
    },
    taxRate: Number(taxRate.rate),
    quantity: input.quantity,
    pricingConfig,
  vehicleTypes,
  useRequestedPlant: input.useSelectedPlant,
  materialUnitPriceOverride: input.materialUnitPriceOverride,
  truckRateOverride: input.truckRateOverride,
  materialMinimumOverride: input.materialMinimumOverride,
    truckingMinimumOverride: input.truckingMinimumOverride,
    paymentTerms: input.paymentTerms,
    manualRouteDistanceMiles: input.manualRouteDistanceMiles,
    manualDeadheadDistanceMiles: input.manualDeadheadDistanceMiles,
  });
  const material = recommendation.material;
  const calculation = recommendation.calculation;
  const itemCalculation = calculateQuoteDraft({
    costPerUnit: Number(material.cost_per_unit),
    quantity: input.quantity,
    tier: material.tier,
    unit: material.unit,
    taxRate: Number(taxRate.rate),
    pricingConfig,
    vehicleTypes,
    routeDurationSeconds: recommendation.routeDistance?.durationSeconds ?? null,
    deadheadDurationSeconds: recommendation.deadheadDistance?.durationSeconds ?? null,
    materialUnitPriceOverride: input.materialUnitPriceOverride,
    truckRateOverride: input.truckRateOverride,
    materialMinimumOverride: input.materialMinimumOverride,
    truckingMinimumOverride: input.truckingMinimumOverride,
    paymentTerms: input.paymentTerms,
    applyCreditCardSurcharge: false,
  });
  const quoteNumber = createQuoteNumber();

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
      material_subtotal: calculation.materialSubtotal,
      trucking_subtotal: calculation.truckingSubtotal,
      fees_subtotal: calculation.feesSubtotal,
      tax_total: calculation.taxTotal,
      total: calculation.total,
      notes: input.notes || null,
      is_active: true,
    })
    .select("id, quote_number")
    .single<CreatedQuoteDraft>();

  if (quoteError || !quote) {
    throw new Error(quoteError?.message ?? "Could not create the quote draft.");
  }

  const { error: itemError } = await supabase.from("quote_items").insert({
    organization_id: user.organization_id,
    quote_id: quote.id,
    supplier_id: material.supplier_id,
    material_id: material.id,
    quantity: input.quantity,
    unit: material.unit,
    unit_cost: Number(material.cost_per_unit),
    markup_per_unit: itemCalculation.markupPerUnit,
    markup_pct: itemCalculation.markupPct,
    material_unit_price: itemCalculation.materialUnitPrice,
    material_subtotal: itemCalculation.materialSubtotal,
    vehicle_type_id: itemCalculation.vehicleTypeId,
    load_count: itemCalculation.loadCount,
    trucking_rate_per_unit: itemCalculation.truckingRatePerUnit,
    trucking_subtotal: itemCalculation.truckingSubtotal,
    fees_subtotal: itemCalculation.feesSubtotal,
    line_total: itemCalculation.total,
    is_active: true,
  });

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
      total: calculation.total,
    },
    metadata: {
      customer_id: customer.id,
      job_site_id: jobSite.id,
      material_id: material.id,
      requested_material_id: requestedMaterial.id,
      new_customer: resolvedCustomer.isNew,
      plant_override: input.useSelectedPlant,
      price_override: input.materialUnitPriceOverride !== null,
      material_unit_price_override: input.materialUnitPriceOverride,
      truck_rate_override: input.truckRateOverride,
      material_minimum_override: input.materialMinimumOverride,
      trucking_minimum_override: input.truckingMinimumOverride,
      minimum_override:
        input.materialMinimumOverride !== null ||
        input.truckingMinimumOverride !== null,
      competitor_price: competitiveIntelligenceEnabled
        ? input.competitorPrice
        : null,
      truck_rate_key: calculation.truckingRateKey,
      truck_hourly_rate: calculation.truckingHourlyRate,
      selected_supplier_id: material.supplier_id,
      selected_supplier_name: recommendation.supplierName,
      plant_selection_reason: recommendation.selectionReason,
      route_distance_miles:
        recommendation.routeDistance?.distanceMiles ?? null,
      route_duration_seconds:
        recommendation.routeDistance?.durationSeconds ?? null,
      route_distance_source: recommendation.routeDistance?.source ?? null,
      deadhead_distance_miles:
        recommendation.deadheadDistance?.distanceMiles ?? null,
      deadhead_distance_source:
        recommendation.deadheadDistance?.source ?? null,
      manual_route_distance_miles: input.manualRouteDistanceMiles,
      manual_deadhead_distance_miles: input.manualDeadheadDistanceMiles,
    },
  });

  if (resolvedCustomer.isNew) {
    await pushCustomerToPipedrive({
      supabase,
      user,
      customerId: customer.id,
    });
  }

  return quote;
}

async function resolveCustomer({
  supabase,
  organizationId,
  existingCustomer,
  customerName,
  companyName,
  contactName,
  contactEmail,
  contactPhone,
  customerAddress,
  paymentTerms,
}: {
  supabase: SupabaseClient;
  organizationId: string;
  existingCustomer: CustomerRecord | null;
  customerName: string;
  companyName: string;
  contactName: string;
  contactEmail: string;
  contactPhone: string;
  customerAddress: string;
  paymentTerms: string;
}): Promise<ResolvedCustomer | null> {
  if (existingCustomer) {
    return {
      customer: existingCustomer,
      isNew: false,
    };
  }

  if (!customerName) {
    return null;
  }

  const { data } = await supabase
    .from("customers")
    .upsert(
      {
        organization_id: organizationId,
        name: customerName,
        company_name: companyName || customerName,
        contact_name: contactName || null,
        email: contactEmail || null,
        phone: contactPhone || null,
        address: {
          line1: customerAddress || null,
        },
        payment_terms: paymentTerms || null,
        is_active: true,
      },
      { onConflict: "organization_id,name" },
    )
    .select("id, name")
    .single<CustomerRecord>();

  return data
    ? {
        customer: data,
        isNew: true,
      }
    : null;
}

async function resolveJobSite({
  supabase,
  organizationId,
  customerId,
  existingJobSite,
  siteName,
  siteAddress,
  siteCity,
  siteCounty,
  siteState,
  siteLatitude,
  siteLongitude,
}: {
  supabase: SupabaseClient;
  organizationId: string;
  customerId: string;
  existingJobSite: JobSiteRecord | null;
  siteName: string;
  siteAddress: string;
  siteCity: string;
  siteCounty: string;
  siteState: string;
  siteLatitude: number | null;
  siteLongitude: number | null;
}): Promise<JobSiteRecord | null> {
  if (existingJobSite) {
    return existingJobSite;
  }

  if (!siteName || !siteCity || !siteCounty) {
    return null;
  }

  const { data } = await supabase
    .from("job_sites")
    .upsert(
      {
        organization_id: organizationId,
        customer_id: customerId,
        name: siteName,
        address: {
          line1: siteAddress || siteName,
          city: siteCity,
          county: siteCounty,
          state: siteState,
        },
        city: siteCity,
        county: siteCounty,
        state: siteState,
        latitude: siteLatitude,
        longitude: siteLongitude,
        is_active: true,
      },
      { onConflict: "organization_id,customer_id,name" },
    )
    .select("id, customer_id, name, city, county, state, latitude, longitude")
    .single<JobSiteRecord>();

  return data ?? null;
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

function createQuoteNumber(): string {
  const timestamp = new Date().toISOString().replace(/\D/g, "").slice(0, 14);
  const suffix = randomUUID().slice(0, 8).toUpperCase();

  return `QB-${timestamp}-${suffix}`;
}

function appendDraftFailureNote(notes: string, errorMessage: string): string {
  const failureNote = `Draft item insert failed: ${errorMessage}`;

  return notes ? `${notes}\n\n${failureNote}` : failureNote;
}
