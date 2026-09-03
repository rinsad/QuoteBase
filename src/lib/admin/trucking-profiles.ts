import { normalizeTruckingProfile, type TruckingProfile } from "@/lib/quotes/trucking";
import { createClient } from "@/lib/supabase/server";

export type AdminTruckingProfile = TruckingProfile & {
  isActive: boolean;
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
      "id, name, average_speed_mph, hourly_rate, round_trip_factor, time_adjustment_bands, is_active",
    )
    .eq("organization_id", organizationId)
    .order("name");

  return {
    profiles: (data ?? []).map((record) => ({
      ...normalizeTruckingProfile(record),
      isActive: Boolean(record.is_active),
    })),
  };
}
