"use server";

import { randomUUID } from "crypto";
import { redirect } from "next/navigation";

import { getCurrentUser } from "@/lib/auth/current-user";
import { logAction } from "@/lib/audit/log-action";
import {
  type PricingConfig,
  type VehicleCapacity,
} from "@/lib/quotes/pricing";
import {
  selectBestPlantForQuote,
  type PlantSelectionMaterial,
} from "@/lib/quotes/plant-selection";
import {
  normalizePricingConfig,
  normalizeVehicleTypes,
} from "@/lib/quotes/new-quote";
import { createClient } from "@/lib/supabase/server";

export type CreateQuoteState = {
  message: string;
  status: "idle" | "error";
};

type CustomerRecord = {
  id: string;
  name: string;
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

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function createQuoteDraft(
  _previousState: CreateQuoteState,
  formData: FormData,
): Promise<CreateQuoteState> {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/login");
  }

  const supabase = await createClient();

  if (!supabase) {
    return {
      message: "Supabase is not configured for this workspace.",
      status: "error",
    };
  }

  const parsed = parseQuoteForm(formData);

  if (!parsed.ok) {
    return {
      message: parsed.message,
      status: "error",
    };
  }

  const { data: flag } = await supabase
    .from("feature_flags")
    .select("is_enabled")
    .eq("organization_id", user.organization_id)
    .eq("feature_name", "quote_creation")
    .single<{ is_enabled: boolean }>();

  if (!flag?.is_enabled) {
    return {
      message: "Quote creation is not enabled for this organization.",
      status: "error",
    };
  }

  const [
    materialResult,
    taxRateResult,
    pricingConfigResult,
    vehicleTypesResult,
    existingCustomerResult,
    existingJobSiteResult,
  ] = await Promise.all([
    supabase
      .from("materials")
      .select(
        "id, supplier_id, name, tier, unit, cost_per_unit, suppliers(name, latitude, longitude)",
      )
      .eq("organization_id", user.organization_id)
      .eq("id", parsed.materialId)
      .eq("is_active", true)
      .single<PlantSelectionMaterial>(),
    supabase
      .from("sales_tax_rates")
      .select("id, rate")
      .eq("organization_id", user.organization_id)
      .eq("id", parsed.taxRateId)
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
    parsed.customerId
      ? supabase
          .from("customers")
          .select("id, name")
          .eq("organization_id", user.organization_id)
          .eq("id", parsed.customerId)
          .eq("is_active", true)
          .single<CustomerRecord>()
      : Promise.resolve({ data: null, error: null }),
    parsed.jobSiteId
      ? supabase
          .from("job_sites")
          .select("id, customer_id, name, city, county, state, latitude, longitude")
          .eq("organization_id", user.organization_id)
          .eq("id", parsed.jobSiteId)
          .eq("is_active", true)
          .single<JobSiteRecord>()
      : Promise.resolve({ data: null, error: null }),
  ]);

  if (!materialResult.data || !taxRateResult.data || !pricingConfigResult.data) {
    return {
      message: "Material, tax, or pricing configuration is missing.",
      status: "error",
    };
  }

  const customer = await resolveCustomer({
    supabase,
    organizationId: user.organization_id,
    existingCustomer: existingCustomerResult.data,
    customerName: parsed.customerName,
    contactName: parsed.contactName,
    contactEmail: parsed.contactEmail,
    contactPhone: parsed.contactPhone,
  });

  if (!customer) {
    return {
      message: "Select an existing customer or enter a new customer name.",
      status: "error",
    };
  }

  const jobSite = await resolveJobSite({
    supabase,
    organizationId: user.organization_id,
    customerId: customer.id,
    existingJobSite: existingJobSiteResult.data,
    siteName: parsed.siteName,
    siteAddress: parsed.siteAddress,
    siteCity: parsed.siteCity,
    siteCounty: parsed.siteCounty,
    siteState: parsed.siteState,
    siteLatitude: parsed.siteLatitude,
    siteLongitude: parsed.siteLongitude,
  });

  if (!jobSite) {
    return {
      message: "Select an existing job site or enter the new site details.",
      status: "error",
    };
  }

  if (jobSite.customer_id !== customer.id) {
    return {
      message: "The selected job site does not belong to the selected customer.",
      status: "error",
    };
  }

  const pricingConfig = normalizePricingConfig(pricingConfigResult.data);
  const vehicleTypes = normalizeVehicleTypes(vehicleTypesResult.data ?? []);
  const requestedMaterial = materialResult.data;
  const taxRate = taxRateResult.data;
  const recommendation = await selectBestPlantForQuote({
    supabase,
    organizationId: user.organization_id,
    requestedMaterial,
    jobSite: {
      latitude: jobSite.latitude === null ? null : Number(jobSite.latitude),
      longitude: jobSite.longitude === null ? null : Number(jobSite.longitude),
    },
    taxRate: Number(taxRate.rate),
    quantity: parsed.quantity,
    pricingConfig,
    vehicleTypes,
  });
  const material = recommendation.material;
  const calculation = recommendation.calculation;
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
      notes: parsed.notes || null,
      is_active: true,
    })
    .select("id, quote_number")
    .single<{ id: string; quote_number: string }>();

  if (quoteError || !quote) {
    return {
      message: quoteError?.message ?? "Could not create the quote draft.",
      status: "error",
    };
  }

  const { error: itemError } = await supabase.from("quote_items").insert({
    organization_id: user.organization_id,
    quote_id: quote.id,
    supplier_id: material.supplier_id,
    material_id: material.id,
    quantity: parsed.quantity,
    unit: material.unit,
    unit_cost: Number(material.cost_per_unit),
    markup_pct: calculation.markupPct,
    material_unit_price: calculation.materialUnitPrice,
    material_subtotal: calculation.materialSubtotal,
    vehicle_type_id: calculation.vehicleTypeId,
    load_count: calculation.loadCount,
    trucking_rate_per_unit: calculation.truckingRatePerUnit,
    trucking_subtotal: calculation.truckingSubtotal,
    fees_subtotal: calculation.feesSubtotal,
    line_total: calculation.total,
    is_active: true,
  });

  if (itemError) {
    await supabase
      .from("quotes")
      .update({
        is_active: false,
        notes: appendDraftFailureNote(parsed.notes, itemError.message),
      })
      .eq("organization_id", user.organization_id)
      .eq("id", quote.id);

    return {
      message: itemError.message,
      status: "error",
    };
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
      selected_supplier_id: material.supplier_id,
      selected_supplier_name: recommendation.supplierName,
      plant_selection_reason: recommendation.selectionReason,
      route_distance_miles:
        recommendation.routeDistance?.distanceMiles ?? null,
      route_duration_seconds:
        recommendation.routeDistance?.durationSeconds ?? null,
      deadhead_distance_miles:
        recommendation.deadheadDistance?.distanceMiles ?? null,
    },
  });

  redirect(
    `/quotes/${quote.id}?created=${encodeURIComponent(quote.quote_number)}`,
  );
}

function parseQuoteForm(formData: FormData):
  | {
      ok: true;
      customerId: string;
      customerName: string;
      contactName: string;
      contactEmail: string;
      contactPhone: string;
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
    }
  | { ok: false; message: string } {
  const customerId = optionalUuid(formData, "customer_id");
  const jobSiteId = optionalUuid(formData, "job_site_id");
  const materialId = requiredUuid(formData, "material_id");
  const taxRateId = requiredUuid(formData, "tax_rate_id");
  const quantity = Number(getString(formData, "quantity"));

  if (!materialId || !taxRateId) {
    return { ok: false, message: "Select a material and tax rate." };
  }

  if (!Number.isFinite(quantity) || quantity <= 0 || quantity > 100000) {
    return { ok: false, message: "Quantity must be greater than zero." };
  }

  return {
    ok: true,
    customerId,
    customerName: getString(formData, "customer_name"),
    contactName: getString(formData, "contact_name"),
    contactEmail: getString(formData, "contact_email"),
    contactPhone: getString(formData, "contact_phone"),
    jobSiteId,
    siteName: getString(formData, "site_name"),
    siteAddress: getString(formData, "site_address"),
    siteCity: getString(formData, "site_city"),
    siteCounty: getString(formData, "site_county"),
    siteState: getString(formData, "site_state") || "CA",
    siteLatitude: optionalCoordinate(formData, "site_latitude", -90, 90),
    siteLongitude: optionalCoordinate(formData, "site_longitude", -180, 180),
    materialId,
    taxRateId,
    quantity,
    notes: getString(formData, "notes"),
  };
}

async function resolveCustomer({
  supabase,
  organizationId,
  existingCustomer,
  customerName,
  contactName,
  contactEmail,
  contactPhone,
}: {
  supabase: NonNullable<Awaited<ReturnType<typeof createClient>>>;
  organizationId: string;
  existingCustomer: CustomerRecord | null;
  customerName: string;
  contactName: string;
  contactEmail: string;
  contactPhone: string;
}): Promise<CustomerRecord | null> {
  if (existingCustomer) {
    return existingCustomer;
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
        contact_name: contactName || null,
        email: contactEmail || null,
        phone: contactPhone || null,
        is_active: true,
      },
      { onConflict: "organization_id,name" },
    )
    .select("id, name")
    .single<CustomerRecord>();

  return data ?? null;
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
  supabase: NonNullable<Awaited<ReturnType<typeof createClient>>>;
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

function getString(formData: FormData, key: string): string {
  const value = formData.get(key);

  return typeof value === "string" ? value.trim() : "";
}

function optionalUuid(formData: FormData, key: string): string {
  const value = getString(formData, key);

  return value && UUID_PATTERN.test(value) ? value : "";
}

function requiredUuid(formData: FormData, key: string): string {
  const value = getString(formData, key);

  return UUID_PATTERN.test(value) ? value : "";
}

function optionalCoordinate(
  formData: FormData,
  key: string,
  min: number,
  max: number,
): number | null {
  const value = getString(formData, key);

  if (!value) {
    return null;
  }

  const numberValue = Number(value);

  if (!Number.isFinite(numberValue) || numberValue < min || numberValue > max) {
    throw new Error(`${key} is out of range.`);
  }

  return Math.round((numberValue + Number.EPSILON) * 10000000) / 10000000;
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
