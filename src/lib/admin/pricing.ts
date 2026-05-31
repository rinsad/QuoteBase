import type { PricingConfig } from "@/lib/quotes/pricing";
import { createClient } from "@/lib/supabase/server";

export type AdminPricingConfig = PricingConfig & {
  id: string;
  updated_at: string;
};

export async function getAdminPricingConfig(
  organizationId: string,
): Promise<AdminPricingConfig | null> {
  const supabase = await createClient();

  if (!supabase) {
    return null;
  }

  const { data } = await supabase
    .from("pricing_config")
    .select(
      "id, tier_r1_min, tier_r1_max, tier_r2_min, tier_r2_max, tier_r3_min, tier_r3_max, tier_r4_min, tier_r4_max, truck_floor_rate, truck_standard_rate, truck_target_rate, truck_premium_rate, truck_stretch_rate, default_truck_rate, material_minimum, trucking_minimum, fuel_surcharge_per_load, environmental_fee_per_load, cc_surcharge_pct, overhead_per_ton, updated_at",
    )
    .eq("organization_id", organizationId)
    .single<AdminPricingConfig>();

  if (!data) {
    return null;
  }

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
  };
}
