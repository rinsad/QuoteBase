import type { AppUser } from "@/lib/auth/current-user";
import { createClient } from "@/lib/supabase/server";

export type CustomerSummary = {
  id: string;
  name: string;
  company_name: string | null;
  contact_name: string | null;
  email: string | null;
  phone: string | null;
  address: Record<string, unknown>;
  payment_terms: string | null;
  pricing_notes: string | null;
  default_plant_id: string | null;
  default_plant_name: string | null;
  pipedrive_person_id: string | null;
  pipedrive_synced_at: string | null;
  is_active: boolean;
  job_sites: JobSiteSummary[];
  quote_history: CustomerQuoteHistoryItem[];
};

export type CustomerQuoteHistoryItem = {
  id: string;
  customer_id: string;
  quote_number: string;
  status: string;
  total: number;
  created_at: string;
};

export type JobSiteSummary = {
  id: string;
  customer_id: string;
  name: string;
  city: string;
  county: string;
  state: string;
  address: Record<string, unknown>;
  latitude: number | null;
  longitude: number | null;
  is_active: boolean;
};

export type CustomerDeskSummary = {
  customers: CustomerSummary[];
  jobSites: JobSiteSummary[];
  plants: CustomerPlantOption[];
  counts: {
    customers: number;
    jobSites: number;
    activeCustomers: number;
    activeJobSites: number;
  };
};

export type CustomerPlantOption = {
  id: string;
  name: string;
};

type CustomerRecord = Omit<
  CustomerSummary,
  "job_sites" | "quote_history" | "default_plant_name"
> & {
  job_sites: JobSiteSummary[] | null;
  suppliers: { name: string } | { name: string }[] | null;
};

type QuoteHistoryRecord = CustomerQuoteHistoryItem;

export async function getCustomerDeskSummary(
  user: AppUser,
  search = "",
): Promise<CustomerDeskSummary> {
  const supabase = await createClient();

  if (!supabase) {
    return emptySummary();
  }

  const normalizedSearch = search.trim();
  const customerFilter = normalizedSearch
    ? `name.ilike.%${normalizedSearch}%,company_name.ilike.%${normalizedSearch}%,contact_name.ilike.%${normalizedSearch}%,email.ilike.%${normalizedSearch}%,phone.ilike.%${normalizedSearch}%`
    : "";
  const jobSiteFilter = normalizedSearch
    ? `name.ilike.%${normalizedSearch}%,city.ilike.%${normalizedSearch}%,county.ilike.%${normalizedSearch}%`
    : "";

  let customerQuery = supabase
    .from("customers")
    .select(
      "id, name, company_name, contact_name, email, phone, address, payment_terms, pricing_notes, default_plant_id, pipedrive_person_id, pipedrive_synced_at, is_active, suppliers(name), job_sites(id, customer_id, name, city, county, state, address, latitude, longitude, is_active)",
    )
    .eq("organization_id", user.organization_id)
    .order("name", { ascending: true });

  let jobSiteQuery = supabase
    .from("job_sites")
    .select(
      "id, customer_id, name, city, county, state, address, latitude, longitude, is_active",
    )
    .eq("organization_id", user.organization_id)
    .order("name", { ascending: true });

  if (customerFilter) {
    customerQuery = customerQuery.or(customerFilter);
  }

  if (jobSiteFilter) {
    jobSiteQuery = jobSiteQuery.or(jobSiteFilter);
  }

  const [customersResult, jobSitesResult] = await Promise.all([
    customerQuery.returns<CustomerRecord[]>(),
    jobSiteQuery.returns<JobSiteSummary[]>(),
  ]);
  const plantsResult = await supabase
    .from("suppliers")
    .select("id, name")
    .eq("organization_id", user.organization_id)
    .eq("is_active", true)
    .order("name", { ascending: true })
    .returns<CustomerPlantOption[]>();
  const quoteHistoryResult = await supabase
    .from("quotes")
    .select("id, customer_id, quote_number, status, total, created_at")
    .eq("organization_id", user.organization_id)
    .eq("is_active", true)
    .order("created_at", { ascending: false })
    .limit(100)
    .returns<QuoteHistoryRecord[]>();
  const quoteHistoryByCustomer = new Map<string, CustomerQuoteHistoryItem[]>();

  for (const quote of quoteHistoryResult.data ?? []) {
    const history = quoteHistoryByCustomer.get(quote.customer_id) ?? [];

    if (history.length < 5) {
      history.push({
        ...quote,
        total: Number(quote.total),
      });
    }

    quoteHistoryByCustomer.set(quote.customer_id, history);
  }

  const customers =
    customersResult.data?.map((customer) => {
      const supplier = Array.isArray(customer.suppliers)
        ? customer.suppliers[0]
        : customer.suppliers;

      return {
        ...customer,
        address: customer.address ?? {},
        default_plant_name: supplier?.name ?? null,
        job_sites: customer.job_sites ?? [],
        quote_history: quoteHistoryByCustomer.get(customer.id) ?? [],
      };
    }) ?? [];
  const jobSites = jobSitesResult.data ?? [];

  return {
    customers,
    jobSites,
    plants: plantsResult.data ?? [],
    counts: {
      customers: customers.length,
      jobSites: jobSites.length,
      activeCustomers: customers.filter((customer) => customer.is_active).length,
      activeJobSites: jobSites.filter((site) => site.is_active).length,
    },
  };
}

function emptySummary(): CustomerDeskSummary {
  return {
    customers: [],
    jobSites: [],
    plants: [],
    counts: {
      customers: 0,
      jobSites: 0,
      activeCustomers: 0,
      activeJobSites: 0,
    },
  };
}
