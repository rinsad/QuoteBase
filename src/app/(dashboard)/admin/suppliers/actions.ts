"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { logAction } from "@/lib/audit/log-action";
import { getCurrentUser } from "@/lib/auth/current-user";
import { createClient } from "@/lib/supabase/server";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function saveSupplier(formData: FormData) {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/login");
  }

  if (user.role !== "admin") {
    throw new Error("Only admins can manage suppliers.");
  }

  const supabase = await createClient();

  if (!supabase) {
    throw new Error("Supabase is not configured for this workspace.");
  }

  const supplierId = optionalUuid(formData, "supplier_id");
  const payload = {
    organization_id: user.organization_id,
    name: requiredText(formData, "name"),
    parent_company: null,
    address: {},
    latitude: null,
    longitude: null,
    hours: null,
    primary_contact_name: null,
    primary_contact_phone: null,
    notes: optionalText(formData, "notes"),
    is_active: formData.get("is_active") === "on",
  };

  const { data: before } = supplierId
    ? await supabase
        .from("suppliers")
        .select("*")
        .eq("organization_id", user.organization_id)
        .eq("id", supplierId)
        .maybeSingle<Record<string, unknown>>()
    : { data: null };

  const query = supplierId
    ? supabase
        .from("suppliers")
        .update(payload)
        .eq("organization_id", user.organization_id)
        .eq("id", supplierId)
    : supabase.from("suppliers").insert(payload);

  const { data: supplier, error } = await query
    .select(
      "id, name, notes, is_active",
    )
    .single<Record<string, unknown>>();

  if (error || !supplier) {
    throw new Error(error?.message ?? "Could not save supplier.");
  }

  await logAction({
    user,
    action: supplierId ? "supplier.updated" : "supplier.created",
    targetTable: "suppliers",
    targetId: typeof supplier.id === "string" ? supplier.id : undefined,
    before,
    after: supplier,
  });

  revalidatePath("/admin/suppliers");
  revalidatePath("/admin/plants");
  revalidatePath("/quotes/new");
  redirect("/admin/suppliers?saved=1");
}

function optionalUuid(formData: FormData, key: string): string | null {
  const value = formData.get(key);

  if (typeof value !== "string" || !value) {
    return null;
  }

  if (!UUID_PATTERN.test(value)) {
    throw new Error(`${key} is invalid.`);
  }

  return value;
}

function requiredText(formData: FormData, key: string): string {
  const value = formData.get(key);

  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${key} is required.`);
  }

  return value.trim();
}

function optionalText(formData: FormData, key: string): string | null {
  const value = formData.get(key);

  if (typeof value !== "string" || !value.trim()) {
    return null;
  }

  return value.trim();
}
