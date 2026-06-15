import type { AppUser } from "@/lib/auth/current-user";
import {
  calculateQuoteDraft,
  type MaterialTier,
  type PricingConfig,
  type VehicleCapacity,
} from "@/lib/quotes/pricing";
import { createClient } from "@/lib/supabase/server";

export type QuoteCustomerOption = {
  id: string;
  name: string;
  company_name: string | null;
  contact_name: string | null;
  phone: string | null;
  email: string | null;
  address: Record<string, unknown>;
  payment_terms: string | null;
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
  supplier_name: string;
  supplier_latitude: number | null;
  supplier_longitude: number | null;
  name: string;
  tier: MaterialTier;
  unit: string;
  cost_per_unit: number;
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
  pricingConfig: PricingConfig | null;
  sampleCalculation: ReturnType<typeof calculateQuoteDraft> | null;
};

type MaterialRecord = Omit<
  QuoteMaterialOption,
  "supplier_name" | "supplier_latitude" | "supplier_longitude"
> & {
  suppliers:
    | { name: string; latitude: number | null; longitude: number | null }
    | { name: string; latitude: number | null; longitude: number | null }[]
    | null;
};

type QuoteHistoryRecord = QuoteCustomerQuoteHistory & {
  customer_id: string;
};

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
  ] = await Promise.all([
    supabase
      .from("feature_flags")
      .select("is_enabled")
      .eq("organization_id", user.organization_id)
      .eq("feature_name", "competitive_intelligence_input")
      .single<{ is_enabled: boolean }>(),
    supabase
      .from("customers")
      .select("id, name, company_name, contact_name, phone, email, address, payment_terms")
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
        "id, supplier_id, name, tier, unit, cost_per_unit, suppliers!inner(name, latitude, longitude)",
      )
      .eq("organization_id", user.organization_id)
      .eq("is_active", true)
      .eq("suppliers.is_active", true)
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
    supabase
      .from("pricing_config")
      .select(
        "tier_r1_min, tier_r1_max, tier_r2_min, tier_r2_max, tier_r3_min, tier_r3_max, tier_r4_min, tier_r4_max, truck_floor_rate, truck_standard_rate, truck_target_rate, truck_premium_rate, truck_stretch_rate, default_truck_rate, material_minimum, trucking_minimum, fuel_surcharge_per_load, environmental_fee_per_load, cc_surcharge_pct, overhead_per_ton",
      )
      .eq("organization_id", user.organization_id)
      .single<PricingConfig>(),
    supabase
      .from("quotes")
      .select("id, customer_id, quote_number, status, total, created_at")
      .eq("organization_id", user.organization_id)
      .eq("is_active", true)
      .order("created_at", { ascending: false })
      .limit(250)
      .returns<QuoteHistoryRecord[]>(),
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

  const pricingConfig = pricingConfigResult.data
    ? normalizePricingConfig(pricingConfigResult.data)
    : null;
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
        })
      : null;

  return {
    quoteCreationEnabled: true,
    competitiveIntelligenceEnabled:
      competitiveIntelligenceFlag.data?.is_enabled ?? false,
    customers:
      customersResult.data?.map((customer) => ({
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
        const supplier = Array.isArray(material.suppliers)
          ? material.suppliers[0]
          : material.suppliers;

        return {
          id: material.id,
          supplier_id: material.supplier_id,
          supplier_name: supplier?.name ?? "Unknown supplier",
          supplier_latitude:
            supplier?.latitude === null || supplier?.latitude === undefined
              ? null
              : Number(supplier.latitude),
          supplier_longitude:
            supplier?.longitude === null || supplier?.longitude === undefined
              ? null
              : Number(supplier.longitude),
          name: material.name,
          tier: material.tier,
          unit: material.unit,
          cost_per_unit: Number(material.cost_per_unit),
        };
      }) ?? [],
    taxRates:
      taxRatesResult.data?.map((taxRate) => ({
        ...taxRate,
        rate: Number(taxRate.rate),
      })) ?? [],
    vehicleTypes: normalizeVehicleTypes(vehicleTypesResult.data ?? []),
    pricingConfig,
    sampleCalculation,
  };
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
    pricingConfig: null,
    sampleCalculation: null,
  };
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
