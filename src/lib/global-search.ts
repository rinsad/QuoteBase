import type { AppUser } from "@/lib/auth/current-user";
import { createClient } from "@/lib/supabase/server";

export type GlobalSearchResult = {
  id: string;
  type: "quote" | "customer" | "job_site" | "audit";
  title: string;
  detail: string;
  href: string;
  createdAt?: string | null;
};

type QuoteSearchRecord = {
  id: string;
  quote_number: string;
  status: string;
  total: number;
  created_at: string;
  customers: { name: string } | { name: string }[] | null;
  job_sites:
    | { name: string; city: string; state: string }
    | { name: string; city: string; state: string }[]
    | null;
};

type CustomerSearchRecord = {
  id: string;
  name: string;
  company_name: string | null;
  contact_name: string | null;
  email: string | null;
  phone: string | null;
};

type JobSiteSearchRecord = {
  id: string;
  customer_id: string;
  name: string;
  city: string;
  county: string;
  state: string;
  customers: { name: string } | { name: string }[] | null;
};

type AuditSearchRecord = {
  id: string;
  action: string;
  target_table: string | null;
  target_id: string | null;
  created_at: string;
  users: { full_name: string } | { full_name: string }[] | null;
};

const MAX_QUERY_LENGTH = 80;
const RESULT_LIMIT = 8;

export async function searchWorkspace({
  user,
  query,
}: {
  user: AppUser;
  query: string;
}): Promise<Record<GlobalSearchResult["type"], GlobalSearchResult[]>> {
  const supabase = await createClient();
  const term = normalizeSearchQuery(query);

  if (!supabase || !term) {
    return emptyResults();
  }

  const pattern = `%${escapeLikePattern(term)}%`;
  const [quotesResult, customersResult, jobSitesResult, auditResult] =
    await Promise.all([
      supabase
        .from("quotes")
        .select(
          "id, quote_number, status, total, created_at, customers(name), job_sites(name, city, state)",
        )
        .eq("organization_id", user.organization_id)
        .eq("is_active", true)
        .or(`quote_number.ilike.${pattern},status.ilike.${pattern}`)
        .order("created_at", { ascending: false })
        .limit(RESULT_LIMIT)
        .returns<QuoteSearchRecord[]>(),
      supabase
        .from("customers")
        .select("id, name, company_name, contact_name, email, phone")
        .eq("organization_id", user.organization_id)
        .eq("is_active", true)
        .or(
          [
            `name.ilike.${pattern}`,
            `company_name.ilike.${pattern}`,
            `contact_name.ilike.${pattern}`,
            `email.ilike.${pattern}`,
            `phone.ilike.${pattern}`,
          ].join(","),
        )
        .order("name", { ascending: true })
        .limit(RESULT_LIMIT)
        .returns<CustomerSearchRecord[]>(),
      supabase
        .from("job_sites")
        .select("id, customer_id, name, city, county, state, customers(name)")
        .eq("organization_id", user.organization_id)
        .eq("is_active", true)
        .or(
          [
            `name.ilike.${pattern}`,
            `city.ilike.${pattern}`,
            `county.ilike.${pattern}`,
            `state.ilike.${pattern}`,
          ].join(","),
        )
        .order("name", { ascending: true })
        .limit(RESULT_LIMIT)
        .returns<JobSiteSearchRecord[]>(),
      searchAuditEvents({
        organizationId: user.organization_id,
        userId: user.id,
        isAdmin: user.role === "admin",
        pattern,
      }),
    ]);

  return {
    quote:
      quotesResult.data?.map((quote) => {
        const customer = relationOne(quote.customers);
        const site = relationOne(quote.job_sites);

        return {
          id: quote.id,
          type: "quote",
          title: quote.quote_number,
          detail: [
            formatStatus(quote.status),
            customer?.name,
            site
              ? [site.name, site.city, site.state].filter(Boolean).join(" - ")
              : null,
            formatCurrency(Number(quote.total)),
          ]
            .filter(Boolean)
            .join(" | "),
          href: `/quotes/${quote.id}`,
          createdAt: quote.created_at,
        };
      }) ?? [],
    customer:
      customersResult.data?.map((customer) => ({
        id: customer.id,
        type: "customer",
        title: customer.company_name ?? customer.name,
        detail:
          [customer.contact_name, customer.email, customer.phone]
            .filter(Boolean)
            .join(" | ") || "Customer record",
        href: `/customers?customer=${customer.id}`,
      })) ?? [],
    job_site:
      jobSitesResult.data?.map((site) => {
        const customer = relationOne(site.customers);

        return {
          id: site.id,
          type: "job_site",
          title: site.name,
          detail: [
            customer?.name,
            [site.city, site.county, site.state].filter(Boolean).join(", "),
          ]
            .filter(Boolean)
            .join(" | "),
          href: `/customers?customer=${site.customer_id}`,
        };
      }) ?? [],
    audit: auditResult.map((entry) => {
      const actor = relationOne(entry.users);

      return {
        id: entry.id,
        type: "audit",
        title: formatAction(entry.action),
        detail: [
          entry.target_table ?? "workspace",
          actor?.full_name ?? "System",
        ]
          .filter(Boolean)
          .join(" | "),
        href: user.role === "admin" ? "/admin/audit-log" : "/audit-log",
        createdAt: entry.created_at,
      };
    }),
  };
}

export function normalizeSearchQuery(query: string): string {
  return query.trim().replace(/\s+/g, " ").slice(0, MAX_QUERY_LENGTH);
}

async function searchAuditEvents({
  organizationId,
  userId,
  isAdmin,
  pattern,
}: {
  organizationId: string;
  userId: string;
  isAdmin: boolean;
  pattern: string;
}): Promise<AuditSearchRecord[]> {
  const supabase = await createClient();

  if (!supabase) {
    return [];
  }

  let query = supabase
    .from("audit_log")
    .select("id, action, target_table, target_id, created_at, users(full_name)")
    .eq("organization_id", organizationId)
    .or(`action.ilike.${pattern},target_table.ilike.${pattern}`)
    .order("created_at", { ascending: false })
    .limit(RESULT_LIMIT);

  if (!isAdmin) {
    query = query.eq("user_id", userId);
  }

  const { data } = await query.returns<AuditSearchRecord[]>();

  return data ?? [];
}

function emptyResults(): Record<GlobalSearchResult["type"], GlobalSearchResult[]> {
  return {
    quote: [],
    customer: [],
    job_site: [],
    audit: [],
  };
}

function escapeLikePattern(value: string): string {
  return value.replace(/[%,]/g, " ");
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
}

function formatStatus(status: string): string {
  return status
    .split("_")
    .map((part) => part[0]?.toUpperCase() + part.slice(1))
    .join(" ");
}

function formatAction(action: string): string {
  return action
    .split(".")
    .join(" ")
    .split("_")
    .map((part) => part[0]?.toUpperCase() + part.slice(1))
    .join(" ");
}

function relationOne<T>(value: T | T[] | null): T | null {
  return Array.isArray(value) ? (value[0] ?? null) : value;
}
