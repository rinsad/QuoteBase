import { createClient } from "@/lib/supabase/server";

export type AdminSupplierLocation = {
  id: string;
  name: string;
  parent_company: string | null;
  address: Record<string, unknown>;
  latitude: number | null;
  longitude: number | null;
  hours: string | null;
  primary_contact_name: string | null;
  primary_contact_phone: string | null;
  notes: string | null;
  is_active: boolean;
  updated_at: string;
};

type SupplierRecord = Omit<AdminSupplierLocation, "latitude" | "longitude"> & {
  latitude: number | null;
  longitude: number | null;
};

export async function getAdminSuppliers(
  organizationId: string,
): Promise<AdminSupplierLocation[]> {
  const supabase = await createClient();

  if (!supabase) {
    return [];
  }

  const { data } = await supabase
    .from("suppliers")
    .select(
      "id, name, parent_company, address, latitude, longitude, hours, primary_contact_name, primary_contact_phone, notes, is_active, updated_at",
    )
    .eq("organization_id", organizationId)
    .order("name", { ascending: true })
    .returns<SupplierRecord[]>();

  return (
    data?.map((supplier) => ({
      ...supplier,
      latitude: supplier.latitude === null ? null : Number(supplier.latitude),
      longitude:
        supplier.longitude === null ? null : Number(supplier.longitude),
    })) ?? []
  );
}
