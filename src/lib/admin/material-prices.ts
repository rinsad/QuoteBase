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

export type MaterialPriceSummary = {
  activeMaterials: number;
  suppliers: number;
  materialFamilies: number;
  stalePrices: number;
};

type MaterialRecord = Omit<AdminMaterialPrice, "supplier_name"> & {
  suppliers: { name: string } | { name: string }[] | null;
};

export async function getAdminMaterialPrices(
  organizationId: string,
): Promise<{
  materials: AdminMaterialPrice[];
  history: MaterialPriceHistoryEntry[];
  summary: MaterialPriceSummary;
}> {
  const supabase = await createClient();

  if (!supabase) {
    return { materials: [], history: [], summary: emptySummary() };
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

  const materials =
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
      }) ?? [];

  return {
    materials,
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
    summary: summarizeMaterials(materials),
  };
}

function emptySummary(): MaterialPriceSummary {
  return {
    activeMaterials: 0,
    suppliers: 0,
    materialFamilies: 0,
    stalePrices: 0,
  };
}

function summarizeMaterials(
  materials: AdminMaterialPrice[],
): MaterialPriceSummary {
  const staleCutoff = new Date();
  staleCutoff.setDate(staleCutoff.getDate() - 30);

  return {
    activeMaterials: materials.length,
    suppliers: new Set(materials.map((material) => material.supplier_id)).size,
    materialFamilies: new Set(
      materials.map(
        (material) =>
          `${material.name.trim().toLowerCase()}|${material.tier}|${material.unit}`,
      ),
    ).size,
    stalePrices: materials.filter((material) => {
      if (!material.last_price_update) {
        return true;
      }

      return new Date(material.last_price_update) < staleCutoff;
    }).length,
  };
}

function relationOne<T>(value: T | T[] | null): T | null {
  if (Array.isArray(value)) {
    return value[0] ?? null;
  }

  return value;
}
