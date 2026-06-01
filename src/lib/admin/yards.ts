import { createClient } from "@/lib/supabase/server";

export type AdminYard = {
  id: string;
  name: string;
  address: Record<string, unknown>;
  latitude: number | null;
  longitude: number | null;
  is_active: boolean;
  updated_at: string;
};

type YardRecord = Omit<AdminYard, "latitude" | "longitude"> & {
  latitude: number | null;
  longitude: number | null;
};

export async function getAdminYards(
  organizationId: string,
): Promise<AdminYard[]> {
  const supabase = await createClient();

  if (!supabase) {
    return [];
  }

  const { data } = await supabase
    .from("yards")
    .select("id, name, address, latitude, longitude, is_active, updated_at")
    .eq("organization_id", organizationId)
    .order("name", { ascending: true })
    .returns<YardRecord[]>();

  return (
    data?.map((yard) => ({
      ...yard,
      latitude: yard.latitude === null ? null : Number(yard.latitude),
      longitude: yard.longitude === null ? null : Number(yard.longitude),
    })) ?? []
  );
}
