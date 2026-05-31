import { createClient } from "@/lib/supabase/server";

export type AdminMaterialPrice = {
  id: string;
  supplier_id: string;
  supplier_name: string;
  name: string;
  tier: "R1" | "R2" | "R3" | "R4";
  unit: string;
  cost_per_unit: number;
  last_price_update: string | null;
  minimum_order_quantity: number | null;
  is_active: boolean;
};

export type MaterialPriceHistoryEntry = {
  id: string;
  material_id: string;
  old_price: number | null;
  new_price: number;
  changed_at: string;
  notes: string | null;
  changed_by: {
    full_name: string;
    email: string;
  } | null;
};

type MaterialRecord = Omit<AdminMaterialPrice, "supplier_name"> & {
  suppliers: { name: string } | { name: string }[] | null;
};

export async function getAdminMaterialPrices(
  organizationId: string,
): Promise<{
  materials: AdminMaterialPrice[];
  history: MaterialPriceHistoryEntry[];
}> {
  const supabase = await createClient();

  if (!supabase) {
    return { materials: [], history: [] };
  }

  const [materialsResult, historyResult] = await Promise.all([
    supabase
      .from("materials")
      .select(
        "id, supplier_id, name, tier, unit, cost_per_unit, last_price_update, minimum_order_quantity, is_active, suppliers(name)",
      )
      .eq("organization_id", organizationId)
      .eq("is_active", true)
      .order("name", { ascending: true })
      .returns<MaterialRecord[]>(),
    supabase
      .from("material_price_history")
      .select("id, material_id, old_price, new_price, changed_at, notes, users(full_name, email)")
      .eq("organization_id", organizationId)
      .order("changed_at", { ascending: false })
      .limit(12),
  ]);

  return {
    materials:
      materialsResult.data?.map((material) => {
        const supplier = Array.isArray(material.suppliers)
          ? material.suppliers[0]
          : material.suppliers;

        return {
          ...material,
          supplier_name: supplier?.name ?? "Unknown supplier",
          cost_per_unit: Number(material.cost_per_unit),
          minimum_order_quantity:
            material.minimum_order_quantity === null
              ? null
              : Number(material.minimum_order_quantity),
        };
      }) ?? [],
    history:
      historyResult.data?.map((entry) => ({
        id: entry.id,
        material_id: entry.material_id,
        old_price: entry.old_price === null ? null : Number(entry.old_price),
        new_price: Number(entry.new_price),
        changed_at: entry.changed_at,
        notes: entry.notes,
        changed_by: relationOne(entry.users),
      })) ?? [],
  };
}

function relationOne<T>(value: T | T[] | null): T | null {
  if (Array.isArray(value)) {
    return value[0] ?? null;
  }

  return value;
}
