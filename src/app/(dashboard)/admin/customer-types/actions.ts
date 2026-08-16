"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { logAction } from "@/lib/audit/log-action";
import { getCurrentUser } from "@/lib/auth/current-user";
import { createClient } from "@/lib/supabase/server";

const customerTypeSchema = z.object({
  customer_type_id: z.string().uuid().optional().or(z.literal("")),
  name: z.string().trim().min(1, "Name is required.").max(80),
  is_active: z.boolean(),
});

export async function saveCustomerType(formData: FormData): Promise<void> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role !== "admin") throw new Error("Only admins can manage customer types.");

  const parsed = customerTypeSchema.safeParse({
    customer_type_id: formData.get("customer_type_id") ?? "",
    name: formData.get("name"),
    is_active: formData.get("is_active") === "on",
  });
  if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? "Invalid customer type.");

  const supabase = await createClient();
  if (!supabase) throw new Error("Supabase is not configured for this workspace.");

  const customerTypeId = parsed.data.customer_type_id || null;
  const { data: before } = customerTypeId
    ? await supabase.from("customer_types").select("id, name, code, is_active")
        .eq("organization_id", user.organization_id).eq("id", customerTypeId)
        .maybeSingle<Record<string, unknown>>()
    : { data: null };
  const payload = {
    organization_id: user.organization_id,
    name: parsed.data.name,
    is_active: parsed.data.is_active,
    ...(!customerTypeId ? { code: toCode(parsed.data.name) } : {}),
  };
  const query = customerTypeId
    ? supabase.from("customer_types").update(payload).eq("organization_id", user.organization_id).eq("id", customerTypeId)
    : supabase.from("customer_types").insert(payload);
  const { data: saved, error } = await query.select("id, name, code, is_active").single<Record<string, unknown>>();
  if (error || !saved) throw new Error(error?.message ?? "Could not save customer type.");

  await logAction({
    user,
    action: customerTypeId ? "customer_type.updated" : "customer_type.created",
    targetTable: "customer_types",
    targetId: typeof saved.id === "string" ? saved.id : undefined,
    before,
    after: saved,
  });
  revalidatePath("/admin/customer-types");
  revalidatePath("/quotes/new");
  redirect("/admin/customer-types?saved=1");
}

function toCode(name: string): string {
  const code = name.toLowerCase().trim().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  if (!code) throw new Error("Name must contain at least one letter or number.");
  return code;
}
