import type { AppUser } from "@/lib/auth/current-user";
import type { CustomerType } from "@/lib/admin/customer-types";
import { CRM_PROVIDERS, type CrmProvider } from "@/lib/integrations/crm";
import { getQuoteUnitConversions } from "@/lib/admin/units";
import {
  calculateQuoteDraft,
  normalizeCatalogMarkupRules,
  resolveCatalogMarkupRule,
  type CatalogMarkupRule,
  type MaterialTier,
  type PricingConfig,
  type QuoteProjectStatusOption,
  type QuoteUnitConversion,
  type VehicleCapacity,
} from "@/lib/quotes/pricing";
import { createClient } from "@/lib/supabase/server";
import {
  normalizeTruckingProfile,
  type TruckingProfile,
} from "@/lib/quotes/trucking";

export type QuoteCustomerOption = {
  id: string;
  name: string;
  company_name: string | null;
  contact_name: string | null;
  phone: string | null;
  email: string | null;
  address: Record<string, unknown>;
  payment_terms: string | null;
  crm_provider: "quotebase" | "pipedrive" | "salesforce" | "hubspot" | "zoho";
  quote_history: QuoteCustomerQuoteHistory[];
};

export type QuoteCustomerQuoteHistory = {
  id: string;
  quote_number: string;
  status: string;
  total: number;
  created_at: string;
};

export type QuoteJobSiteOption = {
  id: string;
  customer_id: string;
  name: string;
  address: Record<string, unknown>;
  city: string;
  county: string;
  state: string;
  latitude: number | null;
  longitude: number | null;
};

export type QuoteMaterialOption = {
  id: string;
  supplier_id: string;
  parent_supplier_id: string | null;
  supplier_catalog_version_id: string | null;
  supplier_catalog_item_id: string | null;
  catalog_sku: string | null;
  catalog_category: string | null;
  catalog_markup_rule: CatalogMarkupRule | null;
  supplier_name: string;
  supplier_parent_company: string | null;
  supplier_latitude: number | null;
  supplier_longitude: number | null;
  name: string;
  tier: MaterialTier;
  unit: string;
  cost_per_unit: number;
  trucking_profile: TruckingProfile | null;
};

export type QuoteTaxRateOption = {
  id: string;
  city: string;
  county: string;
  state: string;
  rate: number;
};

export type QuoteVehicleOption = VehicleCapacity;

export type NewQuoteContext = {
  quoteCreationEnabled: boolean;
  competitiveIntelligenceEnabled: boolean;
  customers: QuoteCustomerOption[];
  jobSites: QuoteJobSiteOption[];
  materials: QuoteMaterialOption[];
  taxRates: QuoteTaxRateOption[];
  vehicleTypes: QuoteVehicleOption[];
  unitConversions: QuoteUnitConversion[];
  pricingConfig: PricingConfig | null;
  projectStatusOptions: QuoteProjectStatusOption[];
  customerTypes: CustomerType[];
  sampleCalculation: ReturnType<typeof calculateQuoteDraft> | null;
};

type MaterialRecord = Omit<
  QuoteMaterialOption,
  | "catalog_markup_rule"
  | "parent_supplier_id"
  | "supplier_name"
  | "supplier_parent_company"
  | "supplier_latitude"
  | "supplier_longitude"
  | "trucking_profile"
> & {
  supplier_plants:
    | {
        id: string;
        name: string;
        latitude: number | null;
        longitude: number | null;
        suppliers: { id: string; name: string } | { id: string; name: string }[] | null;
      }
    | {
        id: string;
        name: string;
        latitude: number | null;
        longitude: number | null;
        suppliers: { id: string; name: string } | { id: string; name: string }[] | null;
      }[]
    | null;
};

type QuoteHistoryRecord = QuoteCustomerQuoteHistory & {
  customer_id: string;
};

type TruckingProfileRecord = {
  id: string;
  name: string;
  average_speed_mph: number;
  hourly_rate: number;
  round_trip_factor: number;
  time_adjustment_bands: unknown;
};

type TruckingProfileAssignmentRecord = {
  trucking_profile_id: string;
  supplier_id: string | null;
  plant_id: string | null;
};

const BASE_PRICING_SELECT =
  "tier_r1_min, tier_r1_max, tier_r2_min, tier_r2_max, tier_r3_min, tier_r3_max, tier_r4_min, tier_r4_max, truck_floor_rate, truck_standard_rate, truck_target_rate, truck_premium_rate, truck_stretch_rate, default_truck_rate, material_minimum, trucking_minimum, fuel_surcharge_per_load, environmental_fee_per_load, cc_surcharge_pct, overhead_per_ton";

const DEFAULT_PROJECT_STATUS_OPTIONS: QuoteProjectStatusOption[] = [
  { value: "bid", label: "Bid" },
  { value: "existing_job", label: "Existing job" },
];

const EXTENDED_PRICING_SELECT = `${BASE_PRICING_SELECT}, big_quote_threshold, default_followup_max_attempts, jobs_starting_soon_days, follow_up_auto_send_enabled, follow_up_sms_enabled, project_status_options, quote_recommendation_count`;

export async function getNewQuoteContext(
  user: AppUser,
): Promise<NewQuoteContext> {
  const supabase = await createClient();

  if (!supabase) {
    return emptyContext();
  }

  const [
    competitiveIntelligenceFlag,
    customersResult,
    jobSitesResult,
    materialsResult,
    taxRatesResult,
    vehicleTypesResult,
    pricingConfigResult,
    quoteHistoryResult,
    markupRulesResult,
    unitConversions,
    customerTypesResult,
    crmIntegrationsResult,
    truckingProfilesResult,
    truckingAssignmentsResult,
  ] = await Promise.all([
    supabase
      .from("feature_flags")
      .select("is_enabled")
      .eq("organization_id", user.organization_id)
      .eq("feature_name", "competitive_intelligence_input")
      .single<{ is_enabled: boolean }>(),
    supabase
      .from("customers")
      .select("id, name, company_name, contact_name, phone, email, address, payment_terms, crm_provider")
      .eq("organization_id", user.organization_id)
      .eq("is_active", true)
      .order("name", { ascending: true })
      .returns<QuoteCustomerOption[]>(),
    supabase
      .from("job_sites")
      .select(
        "id, customer_id, name, address, city, county, state, latitude, longitude",
      )
      .eq("organization_id", user.organization_id)
      .eq("is_active", true)
      .order("name", { ascending: true })
      .returns<QuoteJobSiteOption[]>(),
    supabase
      .from("materials")
      .select(
        "id, supplier_id, supplier_catalog_version_id, supplier_catalog_item_id, catalog_sku, catalog_category, name, tier, unit, cost_per_unit, supplier_plants!inner(id, name, latitude, longitude, suppliers(id, name))",
      )
      .eq("organization_id", user.organization_id)
      .eq("is_active", true)
      .eq("supplier_plants.is_active", true)
      .order("name", { ascending: true })
      .returns<MaterialRecord[]>(),
    supabase
      .from("sales_tax_rates")
      .select("id, city, county, state, rate")
      .eq("organization_id", user.organization_id)
      .order("city", { ascending: true })
      .returns<QuoteTaxRateOption[]>(),
    supabase
      .from("vehicle_types")
      .select("id, name, capacity_tons, capacity_cy")
      .eq("organization_id", user.organization_id)
      .eq("is_active", true)
      .order("capacity_tons", { ascending: false })
      .returns<VehicleCapacity[]>(),
    getQuotePricingConfig(supabase, user.organization_id),
    supabase
      .from("quotes")
      .select("id, customer_id, quote_number, status, total, created_at")
      .eq("organization_id", user.organization_id)
      .eq("is_active", true)
      .order("created_at", { ascending: false })
      .limit(250)
      .returns<QuoteHistoryRecord[]>(),
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
    supabase
      .from("customer_types")
      .select("id, name, code, is_active")
      .eq("organization_id", user.organization_id)
      .eq("is_active", true)
      .order("name")
      .returns<CustomerType[]>(),
    supabase
      .from("organization_integrations")
      .select("provider")
      .eq("organization_id", user.organization_id)
      .eq("is_enabled", true)
      .in("provider", [...CRM_PROVIDERS])
      .returns<Array<{ provider: CrmProvider }>>(),
    supabase
      .from("trucking_profiles")
      .select("id, name, average_speed_mph, hourly_rate, round_trip_factor, time_adjustment_bands")
      .eq("organization_id", user.organization_id)
      .eq("is_active", true)
      .returns<TruckingProfileRecord[]>(),
    supabase
      .from("trucking_profile_assignments")
      .select("trucking_profile_id, supplier_id, plant_id")
      .eq("organization_id", user.organization_id)
      .eq("is_active", true)
      .returns<TruckingProfileAssignmentRecord[]>(),
  ]);
  const quoteHistoryByCustomer = new Map<string, QuoteCustomerQuoteHistory[]>();

  for (const quote of quoteHistoryResult.data ?? []) {
    const history = quoteHistoryByCustomer.get(quote.customer_id) ?? [];

    if (history.length < 5) {
      history.push({
        id: quote.id,
        quote_number: quote.quote_number,
        status: quote.status,
        total: Number(quote.total),
        created_at: quote.created_at,
      });
    }

    quoteHistoryByCustomer.set(quote.customer_id, history);
  }

  const pricingConfig = pricingConfigResult
    ? normalizePricingConfig(pricingConfigResult)
    : null;
  const markupRules = normalizeCatalogMarkupRules(markupRulesResult.data ?? []);
  const truckingProfiles = new Map(
    (truckingProfilesResult.data ?? []).map((profile) => [
      profile.id,
      normalizeTruckingProfile(profile),
    ]),
  );
  const firstMaterial = materialsResult.data?.[0];
  const firstTaxRate = taxRatesResult.data?.[0];
  const sampleCalculation =
    firstMaterial && firstTaxRate && pricingConfig
      ? calculateQuoteDraft({
          costPerUnit: Number(firstMaterial.cost_per_unit),
          quantity: 10,
          tier: firstMaterial.tier,
          unit: firstMaterial.unit,
          taxRate: Number(firstTaxRate.rate),
          pricingConfig,
          vehicleTypes: normalizeVehicleTypes(vehicleTypesResult.data ?? []),
          unitConversions,
          catalogMarkupRule: resolveCatalogMarkupRule(firstMaterial, markupRules),
        })
      : null;

  return {
    quoteCreationEnabled: true,
    competitiveIntelligenceEnabled:
      competitiveIntelligenceFlag.data?.is_enabled ?? false,
    customers:
      customersResult.data?.filter((customer) =>
        customer.crm_provider === "quotebase" ||
        (crmIntegrationsResult.data ?? []).some(
          (integration) => integration.provider === customer.crm_provider,
        ),
      ).map((customer) => ({
        ...customer,
        address: customer.address ?? {},
        quote_history: quoteHistoryByCustomer.get(customer.id) ?? [],
      })) ?? [],
    jobSites:
      jobSitesResult.data?.map((site) => ({
        ...site,
        latitude: site.latitude === null ? null : Number(site.latitude),
        longitude: site.longitude === null ? null : Number(site.longitude),
      })) ?? [],
    materials:
      materialsResult.data?.map((material) => {
        const plant = Array.isArray(material.supplier_plants)
          ? material.supplier_plants[0]
          : material.supplier_plants;
        const supplier = Array.isArray(plant?.suppliers)
          ? plant?.suppliers[0]
          : plant?.suppliers;

        return {
          id: material.id,
          supplier_id: material.supplier_id,
          parent_supplier_id: supplier?.id ?? null,
          supplier_catalog_version_id: material.supplier_catalog_version_id,
          supplier_catalog_item_id: material.supplier_catalog_item_id,
          catalog_sku: material.catalog_sku,
          catalog_category: material.catalog_category,
          catalog_markup_rule: resolveCatalogMarkupRule(material, markupRules),
          supplier_name: plant?.name ?? "Unknown plant",
          supplier_parent_company: supplier?.name ?? null,
          supplier_latitude:
            plant?.latitude === null || plant?.latitude === undefined
              ? null
              : Number(plant.latitude),
          supplier_longitude:
            plant?.longitude === null || plant?.longitude === undefined
              ? null
              : Number(plant.longitude),
          name: material.name,
          tier: material.tier,
          unit: material.unit,
          cost_per_unit: Number(material.cost_per_unit),
          trucking_profile: resolveMaterialTruckingProfile({
            plantId: plant?.id ?? material.supplier_id,
            supplierId: supplier?.id ?? null,
            profiles: truckingProfiles,
            assignments: truckingAssignmentsResult.data ?? [],
          }),
        };
      }) ?? [],
    taxRates:
      taxRatesResult.data?.map((taxRate) => ({
        ...taxRate,
        rate: Number(taxRate.rate),
      })) ?? [],
    vehicleTypes: normalizeVehicleTypes(vehicleTypesResult.data ?? []),
    unitConversions,
    pricingConfig,
    projectStatusOptions: normalizeProjectStatusOptions(
      pricingConfig?.project_status_options,
    ),
    customerTypes: customerTypesResult.data ?? [],
    sampleCalculation,
  };
}

function resolveMaterialTruckingProfile({
  plantId,
  supplierId,
  profiles,
  assignments,
}: {
  plantId: string;
  supplierId: string | null;
  profiles: Map<string, TruckingProfile>;
  assignments: TruckingProfileAssignmentRecord[];
}): TruckingProfile | null {
  const assignment =
    assignments.find((candidate) => candidate.plant_id === plantId) ??
    assignments.find(
      (candidate) => supplierId !== null && candidate.supplier_id === supplierId,
    ) ??
    assignments.find(
      (candidate) => candidate.plant_id === null && candidate.supplier_id === null,
    );

  return assignment ? profiles.get(assignment.trucking_profile_id) ?? null : null;
}

async function getQuotePricingConfig(
  supabase: NonNullable<Awaited<ReturnType<typeof createClient>>>,
  organizationId: string,
): Promise<PricingConfig | null> {
  const { data, error } = await supabase
    .from("pricing_config")
    .select(EXTENDED_PRICING_SELECT)
    .eq("organization_id", organizationId)
    .maybeSingle<PricingConfig>();

  if (data) {
    return data;
  }

  if (error) {
    console.warn("Extended quote pricing config load failed; retrying base columns.", {
      organizationId,
      message: error.message,
    });
  }

  const { data: baseData, error: baseError } = await supabase
    .from("pricing_config")
    .select(BASE_PRICING_SELECT)
    .eq("organization_id", organizationId)
    .maybeSingle<PricingConfig>();

  if (baseData) {
    return baseData;
  }

  if (baseError) {
    console.warn("Base quote pricing config load failed; creating default row.", {
      organizationId,
      message: baseError.message,
    });
  }

  const { data: created, error: createError } = await supabase
    .from("pricing_config")
    .upsert({ organization_id: organizationId }, { onConflict: "organization_id" })
    .select(BASE_PRICING_SELECT)
    .single<PricingConfig>();

  if (createError) {
    console.warn("Default quote pricing config creation failed.", {
      organizationId,
      message: createError.message,
    });
  }

  return created ?? null;
}

export function normalizePricingConfig(config: PricingConfig): PricingConfig {
  return {
    tier_r1_min: Number(config.tier_r1_min),
    tier_r1_max: Number(config.tier_r1_max),
    tier_r2_min: Number(config.tier_r2_min),
    tier_r2_max: Number(config.tier_r2_max),
    tier_r3_min: Number(config.tier_r3_min),
    tier_r3_max: Number(config.tier_r3_max),
    tier_r4_min: Number(config.tier_r4_min),
    tier_r4_max: Number(config.tier_r4_max),
    truck_floor_rate: Number(config.truck_floor_rate),
    truck_standard_rate: Number(config.truck_standard_rate),
    truck_target_rate: Number(config.truck_target_rate),
    truck_premium_rate: Number(config.truck_premium_rate),
    truck_stretch_rate: Number(config.truck_stretch_rate),
    default_truck_rate: config.default_truck_rate,
    material_minimum:
      config.material_minimum === undefined
        ? undefined
        : Number(config.material_minimum),
    trucking_minimum:
      config.trucking_minimum === undefined
        ? undefined
        : Number(config.trucking_minimum),
    fuel_surcharge_per_load: Number(config.fuel_surcharge_per_load),
    environmental_fee_per_load: Number(config.environmental_fee_per_load),
    cc_surcharge_pct:
      config.cc_surcharge_pct === undefined
        ? undefined
        : Number(config.cc_surcharge_pct),
    overhead_per_ton: Number(config.overhead_per_ton),
    big_quote_threshold:
      config.big_quote_threshold === undefined
        ? undefined
        : Number(config.big_quote_threshold),
    default_followup_max_attempts:
      config.default_followup_max_attempts === undefined
        ? undefined
        : Number(config.default_followup_max_attempts),
    jobs_starting_soon_days:
      config.jobs_starting_soon_days === undefined
        ? undefined
        : Number(config.jobs_starting_soon_days),
    follow_up_auto_send_enabled: Boolean(config.follow_up_auto_send_enabled),
    follow_up_sms_enabled: Boolean(config.follow_up_sms_enabled),
    project_status_options: normalizeProjectStatusOptions(
      config.project_status_options,
    ),
    quote_recommendation_count:
      config.quote_recommendation_count === undefined
        ? 3
        : Number(config.quote_recommendation_count),
  };
}

function emptyContext(): NewQuoteContext {
  return {
    quoteCreationEnabled: false,
    competitiveIntelligenceEnabled: false,
    customers: [],
    jobSites: [],
    materials: [],
    taxRates: [],
    vehicleTypes: [],
    unitConversions: [],
    pricingConfig: null,
    projectStatusOptions: DEFAULT_PROJECT_STATUS_OPTIONS,
    customerTypes: [],
    sampleCalculation: null,
  };
}

export function normalizeProjectStatusOptions(
  value: unknown,
): QuoteProjectStatusOption[] {
  if (!Array.isArray(value)) {
    return DEFAULT_PROJECT_STATUS_OPTIONS;
  }

  const options = value
    .map((option) => {
      if (!option || typeof option !== "object" || Array.isArray(option)) {
        return null;
      }

      const record = option as Record<string, unknown>;
      const optionValue =
        typeof record.value === "string" ? record.value.trim() : "";
      const label =
        typeof record.label === "string" ? record.label.trim() : "";

      if (!optionValue || !label) {
        return null;
      }

      return { value: optionValue, label };
    })
    .filter((option): option is QuoteProjectStatusOption => Boolean(option));

  return options.length ? options : DEFAULT_PROJECT_STATUS_OPTIONS;
}

export function normalizeVehicleTypes(
  vehicleTypes: VehicleCapacity[],
): VehicleCapacity[] {
  return vehicleTypes.map((vehicle) => ({
    id: vehicle.id,
    name: vehicle.name,
    capacity_tons: Number(vehicle.capacity_tons),
    capacity_cy:
      vehicle.capacity_cy === null ? null : Number(vehicle.capacity_cy),
  }));
}
