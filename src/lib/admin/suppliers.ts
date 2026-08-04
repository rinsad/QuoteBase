import { createClient } from "@/lib/supabase/server";

export type AdminSupplierLocation = {
  id: string;
  name: string;
  notes: string | null;
  is_active: boolean;
  updated_at: string;
  plant_count: number;
};

type SupplierRecord = Omit<
  AdminSupplierLocation,
  "plant_count"
> & {
  supplier_plants?: Array<{ id: string }> | null;
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
      "id, name, notes, is_active, updated_at, supplier_plants(id)",
    )
    .eq("organization_id", organizationId)
    .order("name", { ascending: true })
    .returns<SupplierRecord[]>();

  return (
    data?.map((supplier) => ({
      ...supplier,
      plant_count: Array.isArray(supplier.supplier_plants)
        ? supplier.supplier_plants.length
        : 0,
    })) ?? []
  );
}
