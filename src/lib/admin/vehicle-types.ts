import { createClient } from "@/lib/supabase/server";

export type AdminVehicleType = {
  id: string;
  name: string;
  capacity_tons: number;
  capacity_cy: number | null;
  is_active: boolean;
  updated_at: string;
};

export async function getAdminVehicleTypes(
  organizationId: string,
): Promise<AdminVehicleType[]> {
  const supabase = await createClient();

  if (!supabase) {
    return [];
  }

  const { data } = await supabase
    .from("vehicle_types")
    .select("id, name, capacity_tons, capacity_cy, is_active, updated_at")
    .eq("organization_id", organizationId)
    .order("capacity_tons", { ascending: false })
    .returns<AdminVehicleType[]>();

  return (
    data?.map((vehicle) => ({
      ...vehicle,
      capacity_tons: Number(vehicle.capacity_tons),
      capacity_cy:
        vehicle.capacity_cy === null ? null : Number(vehicle.capacity_cy),
    })) ?? []
  );
}
