import type { SupabaseClient } from "@supabase/supabase-js";

export const ALWAYS_ON_FEATURES = ["pricing_engine", "quote_creation"] as const;

export const A81_FEATURE_FLAGS = [
  "pricing_engine",
  "quote_creation",
  "approval_workflow",
  "quoter_integration",
  "pipedrive_sync",
  "slack_notifications",
  "google_maps_distance_api",
  "competitive_intelligence_input",
  "multi_pit_comparison",
  "auto_plant_selection",
] as const;

export type A81FeatureFlag = (typeof A81_FEATURE_FLAGS)[number];

export function isAlwaysOnFeature(featureName: string): boolean {
  return ALWAYS_ON_FEATURES.includes(
    featureName as (typeof ALWAYS_ON_FEATURES)[number],
  );
}

export async function isFeatureEnabled({
  supabase,
  organizationId,
  featureName,
  defaultValue = false,
}: {
  supabase: SupabaseClient;
  organizationId: string;
  featureName: A81FeatureFlag;
  defaultValue?: boolean;
}): Promise<boolean> {
  if (isAlwaysOnFeature(featureName)) {
    return true;
  }

  const { data } = await supabase
    .from("feature_flags")
    .select("is_enabled")
    .eq("organization_id", organizationId)
    .eq("feature_name", featureName)
    .maybeSingle<{ is_enabled: boolean }>();

  return data?.is_enabled ?? defaultValue;
}
