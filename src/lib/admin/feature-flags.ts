import { createClient } from "@/lib/supabase/server";

export type AdminFeatureFlag = {
  id: string;
  feature_name: string;
  is_enabled: boolean;
  config: unknown;
  updated_at: string;
  updated_by: {
    full_name: string;
    email: string;
  } | null;
};

type FeatureFlagRecord = Omit<AdminFeatureFlag, "updated_by"> & {
  users: { full_name: string; email: string } | { full_name: string; email: string }[] | null;
};

export async function getAdminFeatureFlags(
  organizationId: string,
): Promise<AdminFeatureFlag[]> {
  const supabase = await createClient();

  if (!supabase) {
    return [];
  }

  const { data } = await supabase
    .from("feature_flags")
    .select("id, feature_name, is_enabled, config, updated_at, users(full_name, email)")
    .eq("organization_id", organizationId)
    .order("feature_name", { ascending: true })
    .returns<FeatureFlagRecord[]>();

  return (
    data?.map((flag) => ({
      id: flag.id,
      feature_name: flag.feature_name,
      is_enabled: flag.is_enabled,
      config: flag.config,
      updated_at: flag.updated_at,
      updated_by: relationOne(flag.users),
    })) ?? []
  );
}

function relationOne<T>(value: T | T[] | null): T | null {
  if (Array.isArray(value)) {
    return value[0] ?? null;
  }

  return value;
}
