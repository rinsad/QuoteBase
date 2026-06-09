"use server";

import { revalidatePath } from "next/cache";

import { logAction } from "@/lib/audit/log-action";
import { getCurrentUser } from "@/lib/auth/current-user";
import { createClient } from "@/lib/supabase/server";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function togglePlantActive(formData: FormData) {
  const user = await getCurrentUser();

  if (!user) {
    throw new Error("You must be signed in to update plants.");
  }

  if (user.role !== "admin" && user.role !== "account_manager") {
    throw new Error("Only admins and account managers can update plant status.");
  }

  const supabase = await createClient();

  if (!supabase) {
    throw new Error("Supabase is not configured for this workspace.");
  }

  const supplierId = requiredUuid(formData, "supplier_id");
  const isActive = formData.get("is_active") === "true";

  const { data: before, error: beforeError } = await supabase
    .from("suppliers")
    .select(
      "id, name, parent_company, address, latitude, longitude, is_active, updated_at",
    )
    .eq("organization_id", user.organization_id)
    .eq("id", supplierId)
    .maybeSingle<Record<string, unknown>>();

  if (beforeError || !before) {
    throw new Error(beforeError?.message ?? "Plant not found.");
  }

  const { data: after, error } = await supabase
    .from("suppliers")
    .update({ is_active: isActive })
    .eq("organization_id", user.organization_id)
    .eq("id", supplierId)
    .select(
      "id, name, parent_company, address, latitude, longitude, is_active, updated_at",
    )
    .single<Record<string, unknown>>();

  if (error || !after) {
    throw new Error(error?.message ?? "Could not update plant status.");
  }

  await logAction({
    user,
    action: isActive ? "supplier.activated" : "supplier.deactivated",
    targetTable: "suppliers",
    targetId: supplierId,
    before,
    after,
    metadata: {
      historical_data_preserved: true,
    },
  });

  revalidatePath("/admin/plants");
  revalidatePath("/admin/suppliers");
  revalidatePath("/quotes/new");
}

function requiredUuid(formData: FormData, key: string): string {
  const value = formData.get(key);

  if (typeof value !== "string" || !UUID_PATTERN.test(value)) {
    throw new Error(`${key} is invalid.`);
  }

  return value;
}
