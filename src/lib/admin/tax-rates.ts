import { createClient } from "@/lib/supabase/server";

export type AdminTaxRate = {
  id: string;
  city: string;
  county: string;
  state: string;
  rate: number;
  effective_date: string;
};

export async function getAdminTaxRates(
  organizationId: string,
): Promise<AdminTaxRate[]> {
  const supabase = await createClient();

  if (!supabase) {
    return [];
  }

  const { data } = await supabase
    .from("sales_tax_rates")
    .select("id, city, county, state, rate, effective_date")
    .eq("organization_id", organizationId)
    .order("state", { ascending: true })
    .order("county", { ascending: true })
    .order("city", { ascending: true })
    .returns<AdminTaxRate[]>();

  return (
    data?.map((taxRate) => ({
      ...taxRate,
      rate: Number(taxRate.rate),
    })) ?? []
  );
}
