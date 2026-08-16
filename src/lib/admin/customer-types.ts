import { createClient } from "@/lib/supabase/server";

export type CustomerType = {
  id: string;
  name: string;
  code: string;
  is_active: boolean;
};

export async function getCustomerTypes(
  organizationId: string,
  activeOnly = false,
): Promise<CustomerType[]> {
  const supabase = await createClient();

  if (!supabase) return [];

  let query = supabase
    .from("customer_types")
    .select("id, name, code, is_active")
    .eq("organization_id", organizationId)
    .order("name");

  if (activeOnly) query = query.eq("is_active", true);

  const { data } = await query.returns<CustomerType[]>();
  return data ?? [];
}
