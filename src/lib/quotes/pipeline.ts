import type { CustomerType } from "@/lib/admin/customer-types";
import { normalizeProjectStatusOptions } from "@/lib/quotes/new-quote";
import type { QuoteProjectStatusOption } from "@/lib/quotes/pricing";
import { createClient } from "@/lib/supabase/server";

export async function getQuotePipelineConfiguration(
  organizationId: string,
): Promise<{
  customerTypes: CustomerType[];
  projectStatusOptions: QuoteProjectStatusOption[];
}> {
  const supabase = await createClient();

  if (!supabase) {
    return {
      customerTypes: [],
      projectStatusOptions: normalizeProjectStatusOptions(null),
    };
  }

  const [customerTypesResult, pricingConfigResult] = await Promise.all([
    supabase
      .from("customer_types")
      .select("id, name, code, is_active")
      .eq("organization_id", organizationId)
      .eq("is_active", true)
      .order("name")
      .returns<CustomerType[]>(),
    supabase
      .from("pricing_config")
      .select("project_status_options")
      .eq("organization_id", organizationId)
      .maybeSingle<{ project_status_options: unknown }>(),
  ]);

  return {
    customerTypes: customerTypesResult.data ?? [],
    projectStatusOptions: normalizeProjectStatusOptions(
      pricingConfigResult.data?.project_status_options,
    ),
  };
}
