import type { AppUser } from "@/lib/auth/current-user";
import { logAction } from "@/lib/audit/log-action";
import type { createClient } from "@/lib/supabase/server";

type SupabaseClient = NonNullable<Awaited<ReturnType<typeof createClient>>>;

export type MaterialPriceUpdateInput = {
  materialId: string;
  newPrice: number;
  priceDate: string;
  notes: string | null;
};

export type MaterialPriceUpdateResult = {
  id: string;
  name: string;
  old_price: number;
  new_price: number;
  last_price_update: string;
};

type MaterialPriceRecord = {
  id: string;
  organization_id: string;
  supplier_id: string;
  name: string;
  description: string | null;
  tier: "R1" | "R2" | "R3" | "R4";
  unit: string;
  cost_per_unit: number;
  last_price_update: string | null;
  minimum_order_quantity: number | null;
  special_notes: string | null;
  is_active: boolean;
};

export async function updateMaterialPrices({
  supabase,
  user,
  updates,
}: {
  supabase: SupabaseClient;
  user: AppUser;
  updates: MaterialPriceUpdateInput[];
}): Promise<MaterialPriceUpdateResult[]> {
  if (user.role !== "admin" && user.role !== "account_manager") {
    throw new Error("Only admins and account managers can update material prices.");
  }

  if (!updates.length) {
    throw new Error("At least one material price update is required.");
  }

  const uniqueMaterialIds = [...new Set(updates.map((update) => update.materialId))];

  if (uniqueMaterialIds.length !== updates.length) {
    throw new Error("Each material can only be updated once per request.");
  }

  const { data: beforeMaterials, error: beforeError } = await supabase
    .from("materials")
    .select(
      "id, organization_id, supplier_id, name, description, tier, unit, cost_per_unit, last_price_update, minimum_order_quantity, special_notes, is_active",
    )
    .eq("organization_id", user.organization_id)
    .eq("is_active", true)
    .in("id", uniqueMaterialIds)
    .returns<MaterialPriceRecord[]>();

  if (beforeError) {
    throw new Error(beforeError.message);
  }

  if ((beforeMaterials?.length ?? 0) !== uniqueMaterialIds.length) {
    throw new Error("One or more materials were not found.");
  }

  const beforeById = new Map(
    (beforeMaterials ?? []).map((material) => [material.id, material]),
  );
  const changedUpdates = updates.filter((update) => {
    const before = beforeById.get(update.materialId);

    return before && Number(before.cost_per_unit) !== update.newPrice;
  });

  if (!changedUpdates.length) {
    throw new Error("New price must be different from the current price.");
  }

  const upsertRows = changedUpdates.map((update) => {
    const before = beforeById.get(update.materialId);

    if (!before) {
      throw new Error("One or more materials were not found.");
    }

    return {
      id: before.id,
      organization_id: before.organization_id,
      supplier_id: before.supplier_id,
      name: before.name,
      description: before.description,
      tier: before.tier,
      unit: before.unit,
      cost_per_unit: update.newPrice,
      last_price_update: update.priceDate,
      minimum_order_quantity: before.minimum_order_quantity,
      special_notes: before.special_notes,
      is_active: before.is_active,
    };
  });

  const { data: afterMaterials, error: updateError } = await supabase
    .from("materials")
    .upsert(upsertRows, { onConflict: "id" })
    .select("id, name, cost_per_unit, last_price_update")
    .returns<
      Array<{
        id: string;
        name: string;
        cost_per_unit: number;
        last_price_update: string;
      }>
    >();

  if (updateError || !afterMaterials) {
    throw new Error(updateError?.message ?? "Could not update material prices.");
  }

  const historyRows = changedUpdates.map((update) => {
    const before = beforeById.get(update.materialId);

    if (!before) {
      throw new Error("One or more materials were not found.");
    }

    return {
      organization_id: user.organization_id,
      material_id: update.materialId,
      old_price: Number(before.cost_per_unit),
      new_price: update.newPrice,
      changed_by: user.id,
      notes: update.notes,
    };
  });

  const { error: historyError } = await supabase
    .from("material_price_history")
    .insert(historyRows);

  if (historyError) {
    await supabase
      .from("materials")
      .upsert(
        changedUpdates.map((update) => {
          const before = beforeById.get(update.materialId);

          if (!before) {
            throw new Error("One or more materials were not found.");
          }

          return before;
        }),
        { onConflict: "id" },
      );

    throw new Error(historyError.message);
  }

  const afterById = new Map(afterMaterials.map((material) => [material.id, material]));
  const results = changedUpdates.map((update) => {
    const before = beforeById.get(update.materialId);
    const after = afterById.get(update.materialId);

    if (!before || !after) {
      throw new Error("One or more material updates did not complete.");
    }

    return {
      id: after.id,
      name: after.name,
      old_price: Number(before.cost_per_unit),
      new_price: Number(after.cost_per_unit),
      last_price_update: after.last_price_update,
    };
  });

  await logAction({
    user,
    action:
      results.length === 1
        ? "material.price_updated"
        : "material.bulk_price_updated",
    targetTable: results.length === 1 ? "materials" : "material_price_history",
    targetId: results.length === 1 ? results[0].id : undefined,
    before: results.map((result) => ({
      material_id: result.id,
      price: result.old_price,
    })),
    after: results.map((result) => ({
      material_id: result.id,
      price: result.new_price,
      last_price_update: result.last_price_update,
    })),
  });

  return results;
}
