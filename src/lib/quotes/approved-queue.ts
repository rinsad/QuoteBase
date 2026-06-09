import type { AppUser } from "@/lib/auth/current-user";
import { createClient } from "@/lib/supabase/server";

export type ApprovedQuoteQueueItem = {
  id: string;
  quote_number: string;
  total: number;
  created_at: string;
  customer_name: string;
  job_site_name: string;
  job_site_city: string;
  estimator_name: string;
};

type ApprovedQuoteQueueRecord = {
  id: string;
  quote_number: string;
  total: number;
  created_at: string;
  customers: { name: string } | { name: string }[] | null;
  job_sites:
    | { name: string; city: string; state: string }
    | { name: string; city: string; state: string }[]
    | null;
  users: { full_name: string } | { full_name: string }[] | null;
};

export async function getApprovedQuoteQueue(
  user: AppUser,
): Promise<ApprovedQuoteQueueItem[]> {
  const supabase = await createClient();

  if (!supabase) {
    return [];
  }

  const { data } = await supabase
    .from("quotes")
    .select(
      "id, quote_number, total, created_at, customers(name), job_sites(name, city, state), users(full_name)",
    )
    .eq("organization_id", user.organization_id)
    .eq("is_active", true)
    .eq("status", "approved")
    .order("created_at", { ascending: true })
    .limit(100)
    .returns<ApprovedQuoteQueueRecord[]>();

  return (
    data?.map((quote) => {
      const site = relationOne(quote.job_sites);

      return {
        id: quote.id,
        quote_number: quote.quote_number,
        total: Number(quote.total),
        created_at: quote.created_at,
        customer_name: relationOne(quote.customers)?.name ?? "Unknown customer",
        job_site_name: site?.name ?? "Unknown site",
        job_site_city: [site?.city, site?.state].filter(Boolean).join(", "),
        estimator_name: relationOne(quote.users)?.full_name ?? "Unknown user",
      };
    }) ?? []
  );
}

function relationOne<T>(value: T | T[] | null): T | null {
  return Array.isArray(value) ? (value[0] ?? null) : value;
}
