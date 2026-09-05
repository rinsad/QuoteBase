import { normalizeTruckingProfile, type TruckingProfile } from "@/lib/quotes/trucking";
import { createClient } from "@/lib/supabase/server";

export type AdminTruckingProfile = TruckingProfile & {
  isActive: boolean;
  isDefault: boolean;
};

export async function getAdminTruckingProfiles(
  organizationId: string,
): Promise<{ profiles: AdminTruckingProfile[] }> {
  const supabase = await createClient();

  if (!supabase) {
    return { profiles: [] };
  }

  const { data } = await supabase
    .from("trucking_profiles")
    .select(
      "id, name, average_speed_mph, hourly_rate, round_trip_factor, loading_unloading_hours, truck_capacity, is_active, is_default",
    )
    .eq("organization_id", organizationId)
    .order("name");

  return {
    profiles: (data ?? []).map((record) => ({
      ...normalizeTruckingProfile(record),
      isActive: Boolean(record.is_active),
      isDefault: Boolean(record.is_default),
    })),
  };
}
