import type { AppUser } from "@/lib/auth/current-user";
import {
  calculateQuoteDraft,
  type MaterialTier,
  type PricingConfig,
} from "@/lib/quotes/pricing";
import { createClient } from "@/lib/supabase/server";

export type QuoteCustomerOption = {
  id: string;
  name: string;
  contact_name: string | null;
};

export type QuoteJobSiteOption = {
  id: string;
  customer_id: string;
  name: string;
  city: string;
  county: string;
  state: string;
};

export type QuoteMaterialOption = {
  id: string;
  supplier_id: string;
  supplier_name: string;
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

export type NewQuoteContext = {
  quoteCreationEnabled: boolean;
  customers: QuoteCustomerOption[];
  jobSites: QuoteJobSiteOption[];
  materials: QuoteMaterialOption[];
  taxRates: QuoteTaxRateOption[];
  sampleCalculation: ReturnType<typeof calculateQuoteDraft> | null;
};

type MaterialRecord = Omit<QuoteMaterialOption, "supplier_name"> & {
  suppliers: { name: string } | { name: string }[] | null;
};

export async function getNewQuoteContext(
  user: AppUser,
): Promise<NewQuoteContext> {
  const supabase = await createClient();

  if (!supabase) {
    return emptyContext();
  }

  const [
    quoteCreationFlag,
    customersResult,
    jobSitesResult,
    materialsResult,
    taxRatesResult,
    pricingConfigResult,
  ] = await Promise.all([
    supabase
      .from("feature_flags")
      .select("is_enabled")
      .eq("organization_id", user.organization_id)
      .eq("feature_name", "quote_creation")
      .single<{ is_enabled: boolean }>(),
    supabase
      .from("customers")
      .select("id, name, contact_name")
      .eq("organization_id", user.organization_id)
      .eq("is_active", true)
      .order("name", { ascending: true })
      .returns<QuoteCustomerOption[]>(),
    supabase
      .from("job_sites")
      .select("id, customer_id, name, city, county, state")
      .eq("organization_id", user.organization_id)
      .eq("is_active", true)
      .order("name", { ascending: true })
      .returns<QuoteJobSiteOption[]>(),
    supabase
      .from("materials")
      .select("id, supplier_id, name, tier, unit, cost_per_unit, suppliers(name)")
      .eq("organization_id", user.organization_id)
      .eq("is_active", true)
      .order("name", { ascending: true })
      .returns<MaterialRecord[]>(),
    supabase
      .from("sales_tax_rates")
      .select("id, city, county, state, rate")
      .eq("organization_id", user.organization_id)
      .order("city", { ascending: true })
      .returns<QuoteTaxRateOption[]>(),
    supabase
      .from("pricing_config")
      .select(
        "tier_r1_min, tier_r1_max, tier_r2_min, tier_r2_max, tier_r3_min, tier_r3_max, tier_r4_min, tier_r4_max, truck_floor_rate, truck_standard_rate, truck_target_rate, truck_premium_rate, truck_stretch_rate, default_truck_rate, fuel_surcharge_per_load, environmental_fee_per_load, overhead_per_ton",
      )
      .eq("organization_id", user.organization_id)
      .single<PricingConfig>(),
  ]);

  const firstMaterial = materialsResult.data?.[0];
  const firstTaxRate = taxRatesResult.data?.[0];
  const sampleCalculation =
    firstMaterial && firstTaxRate && pricingConfigResult.data
      ? calculateQuoteDraft({
          costPerUnit: Number(firstMaterial.cost_per_unit),
          quantity: 10,
          tier: firstMaterial.tier,
          unit: firstMaterial.unit,
          taxRate: Number(firstTaxRate.rate),
          pricingConfig: normalizePricingConfig(pricingConfigResult.data),
        })
      : null;

  return {
    quoteCreationEnabled: quoteCreationFlag.data?.is_enabled ?? false,
    customers: customersResult.data ?? [],
    jobSites: jobSitesResult.data ?? [],
    materials:
      materialsResult.data?.map((material) => {
        const supplier = Array.isArray(material.suppliers)
          ? material.suppliers[0]
          : material.suppliers;

        return {
          id: material.id,
          supplier_id: material.supplier_id,
          supplier_name: supplier?.name ?? "Unknown supplier",
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
    fuel_surcharge_per_load: Number(config.fuel_surcharge_per_load),
    environmental_fee_per_load: Number(config.environmental_fee_per_load),
    overhead_per_ton: Number(config.overhead_per_ton),
  };
}

function emptyContext(): NewQuoteContext {
  return {
    quoteCreationEnabled: false,
    customers: [],
    jobSites: [],
    materials: [],
    taxRates: [],
    sampleCalculation: null,
  };
}
