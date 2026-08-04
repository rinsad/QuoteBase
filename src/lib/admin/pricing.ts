import type { PricingConfig } from "@/lib/quotes/pricing";
import { normalizeProjectStatusOptions } from "@/lib/quotes/new-quote";
import { createClient } from "@/lib/supabase/server";

export type AdminPricingConfig = PricingConfig & {
  id: string;
  updated_at: string;
};

const BASE_PRICING_SELECT =
  "id, tier_r1_min, tier_r1_max, tier_r2_min, tier_r2_max, tier_r3_min, tier_r3_max, tier_r4_min, tier_r4_max, truck_floor_rate, truck_standard_rate, truck_target_rate, truck_premium_rate, truck_stretch_rate, default_truck_rate, material_minimum, trucking_minimum, fuel_surcharge_per_load, environmental_fee_per_load, cc_surcharge_pct, overhead_per_ton, updated_at";

const EXTENDED_PRICING_SELECT = `${BASE_PRICING_SELECT}, big_quote_threshold, default_followup_max_attempts, jobs_starting_soon_days, follow_up_auto_send_enabled, follow_up_sms_enabled, project_status_options`;

export async function getAdminPricingConfig(
  organizationId: string,
): Promise<AdminPricingConfig | null> {
  const supabase = await createClient();

  if (!supabase) {
    return null;
  }

  const { data, error } = await supabase
    .from("pricing_config")
    .select(EXTENDED_PRICING_SELECT)
    .eq("organization_id", organizationId)
    .maybeSingle<AdminPricingConfig>();

  if (data) {
    return normalizePricingConfig(data);
  }

  if (error) {
    console.warn("Extended pricing config load failed; retrying base columns.", {
      organizationId,
      message: error.message,
    });
  }

  const { data: baseData } = await supabase
    .from("pricing_config")
    .select(BASE_PRICING_SELECT)
    .eq("organization_id", organizationId)
    .maybeSingle<AdminPricingConfig>();

  if (baseData) {
    return normalizePricingConfig(baseData);
  }

  const { data: created } = await supabase
    .from("pricing_config")
    .upsert({ organization_id: organizationId }, { onConflict: "organization_id" })
    .select(BASE_PRICING_SELECT)
    .single<AdminPricingConfig>();

  return created ? normalizePricingConfig(created) : null;
}

function normalizePricingConfig(data: AdminPricingConfig): AdminPricingConfig {
  return {
    ...data,
    tier_r1_min: Number(data.tier_r1_min),
    tier_r1_max: Number(data.tier_r1_max),
    tier_r2_min: Number(data.tier_r2_min),
    tier_r2_max: Number(data.tier_r2_max),
    tier_r3_min: Number(data.tier_r3_min),
    tier_r3_max: Number(data.tier_r3_max),
    tier_r4_min: Number(data.tier_r4_min),
    tier_r4_max: Number(data.tier_r4_max),
    truck_floor_rate: Number(data.truck_floor_rate),
    truck_standard_rate: Number(data.truck_standard_rate),
    truck_target_rate: Number(data.truck_target_rate),
    truck_premium_rate: Number(data.truck_premium_rate),
    truck_stretch_rate: Number(data.truck_stretch_rate),
    material_minimum:
      data.material_minimum === undefined ? undefined : Number(data.material_minimum),
    trucking_minimum:
      data.trucking_minimum === undefined ? undefined : Number(data.trucking_minimum),
    fuel_surcharge_per_load: Number(data.fuel_surcharge_per_load),
    environmental_fee_per_load: Number(data.environmental_fee_per_load),
    cc_surcharge_pct:
      data.cc_surcharge_pct === undefined ? undefined : Number(data.cc_surcharge_pct),
    overhead_per_ton: Number(data.overhead_per_ton),
    big_quote_threshold:
      data.big_quote_threshold === undefined
        ? undefined
        : Number(data.big_quote_threshold),
    default_followup_max_attempts:
      data.default_followup_max_attempts === undefined
        ? undefined
        : Number(data.default_followup_max_attempts),
    jobs_starting_soon_days:
      data.jobs_starting_soon_days === undefined
        ? undefined
        : Number(data.jobs_starting_soon_days),
    follow_up_auto_send_enabled: Boolean(data.follow_up_auto_send_enabled),
    follow_up_sms_enabled: Boolean(data.follow_up_sms_enabled),
    project_status_options: normalizeProjectStatusOptions(
      data.project_status_options,
    ),
  };
}
