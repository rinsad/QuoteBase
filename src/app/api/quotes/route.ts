import { getCurrentUser } from "@/lib/auth/current-user";
import { badRequest, apiOk, serverError, unauthorized } from "@/lib/api/responses";
import {
  parsePagination,
  parseQuoteStatus,
} from "@/lib/api/validation";
import { createClient } from "@/lib/supabase/server";
import type { QuoteStatus } from "@/lib/quotes/quotes";

type QuoteApiRecord = {
  id: string;
  quote_number: string;
  status: QuoteStatus;
  total: number;
  created_at: string;
  customers: { name: string } | { name: string }[] | null;
  job_sites:
    | { name: string; city: string; state: string }
    | { name: string; city: string; state: string }[]
    | null;
  users: { full_name: string; email: string } | { full_name: string; email: string }[] | null;
};

export async function GET(request: Request) {
  const user = await getCurrentUser();

  if (!user) {
    return unauthorized();
  }

  const supabase = await createClient();

  if (!supabase) {
    return serverError("Supabase is not configured.");
  }

  const url = new URL(request.url);
  const pagination = parsePagination(url.searchParams);

  if (!pagination.ok) {
    return badRequest(pagination.message);
  }

  const status = parseQuoteStatus(url.searchParams.get("status"));

  if (!status.ok) {
    return badRequest(status.message);
  }

  let query = supabase
    .from("quotes")
    .select(
      "id, quote_number, status, total, created_at, customers(name), job_sites(name, city, state), users(full_name, email)",
      { count: "exact" },
    )
    .eq("organization_id", user.organization_id)
    .eq("is_active", true)
    .order("created_at", { ascending: false });

  if (status.value) {
    query = query.eq("status", status.value);
  }

  const { data, error, count } = await query
    .range(pagination.value.from, pagination.value.to)
    .returns<QuoteApiRecord[]>();

  if (error) {
    return serverError("Could not load quotes.");
  }

  return apiOk(
    {
      quotes:
        data?.map((quote) => {
          const customer = relationOne(quote.customers);
          const jobSite = relationOne(quote.job_sites);
          const requestedBy = relationOne(quote.users);

          return {
            id: quote.id,
            quote_number: quote.quote_number,
            status: quote.status,
            total: Number(quote.total),
            created_at: quote.created_at,
            customer_name: customer?.name ?? null,
            job_site_name: jobSite?.name ?? null,
            job_site_city: [jobSite?.city, jobSite?.state].filter(Boolean).join(", "),
            requested_by_name: requestedBy?.full_name ?? null,
            requested_by_email: requestedBy?.email ?? null,
          };
        }) ?? [],
    },
    {
      meta: {
        page: pagination.value.page,
        limit: pagination.value.limit,
        total: count ?? 0,
        status: status.value,
      },
    },
  );
}

function relationOne<T>(value: T | T[] | null): T | null {
  return Array.isArray(value) ? (value[0] ?? null) : value;
}
