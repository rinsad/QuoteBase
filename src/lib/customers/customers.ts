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
  locationOptions: {
    cities: string[];
    counties: string[];
    states: string[];
  };
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
      "id, name, company_name, contact_name, email, phone, address, payment_terms, pricing_notes, default_plant_id, pipedrive_person_id, pipedrive_synced_at, is_active, job_sites(id, customer_id, name, city, county, state, address, latitude, longitude, is_active)",
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
  const directCustomers = customersResult.data?.filter(isCustomerRecord) ?? [];
  const customerIdsFromMatchedJobSites = new Set(
    (jobSitesResult.data ?? [])
      .filter(isJobSiteSummary)
      .map((site) => site.customer_id),
  );
  const missingCustomerIds = [...customerIdsFromMatchedJobSites].filter(
    (customerId) =>
      !directCustomers.some((customer) => customer.id === customerId),
  );
  const jobSiteCustomerResult =
    normalizedSearch && missingCustomerIds.length
      ? await supabase
          .from("customers")
          .select(
            "id, name, company_name, contact_name, email, phone, address, payment_terms, pricing_notes, default_plant_id, pipedrive_person_id, pipedrive_synced_at, is_active, job_sites(id, customer_id, name, city, county, state, address, latitude, longitude, is_active)",
          )
          .eq("organization_id", user.organization_id)
          .in("id", missingCustomerIds)
          .returns<CustomerRecord[]>()
      : { data: [], error: null };
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
  const locationOptionsResult = await supabase
    .from("job_sites")
    .select("city, county, state")
    .eq("organization_id", user.organization_id)
    .eq("is_active", true)
    .returns<Array<{ city: string; county: string; state: string }>>();

  if (customersResult.error) {
    console.error("Could not load customers for customer desk.", customersResult.error);
  }

  if (jobSitesResult.error) {
    console.error("Could not load job sites for customer desk.", jobSitesResult.error);
  }

  if (jobSiteCustomerResult.error) {
    console.error(
      "Could not load customers for matched job sites.",
      jobSiteCustomerResult.error,
    );
  }

  if (plantsResult.error) {
    console.error("Could not load plants for customer desk.", plantsResult.error);
  }

  if (quoteHistoryResult.error) {
    console.error(
      "Could not load quote history for customer desk.",
      quoteHistoryResult.error,
    );
  }

  if (locationOptionsResult.error) {
    console.error(
      "Could not load job site location options.",
      locationOptionsResult.error,
    );
  }

  const quoteHistoryByCustomer = new Map<string, CustomerQuoteHistoryItem[]>();
  const plants = plantsResult.data?.filter(isPlantOption) ?? [];
  const plantNameById = new Map(
    plants.map((plant) => [plant.id, plant.name] as const),
  );

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

  const customerRecords = [
    ...directCustomers,
    ...((jobSiteCustomerResult.data ?? []).filter(isCustomerRecord)),
  ];
  const customers =
    customerRecords.map((customer) => {
      return {
        ...customer,
        address: objectRecord(customer.address),
        default_plant_name: customer.default_plant_id
          ? (plantNameById.get(customer.default_plant_id) ?? null)
          : null,
        job_sites: (customer.job_sites ?? []).filter(isJobSiteSummary).map(
          (site) => ({
            ...site,
            address: objectRecord(site.address),
          }),
        ),
        quote_history: quoteHistoryByCustomer.get(customer.id) ?? [],
      };
    });
  const jobSites =
    jobSitesResult.data?.filter(isJobSiteSummary).map((site) => ({
      ...site,
      address: objectRecord(site.address),
    })) ?? [];
  const locationRows = locationOptionsResult.data ?? [];

  return {
    customers,
    jobSites,
    plants,
    locationOptions: {
      cities: uniqueStrings(locationRows.map((site) => site.city)),
      counties: uniqueStrings(locationRows.map((site) => site.county)),
      states: uniqueStrings(locationRows.map((site) => site.state)),
    },
    counts: {
      customers: customers.length,
      jobSites: jobSites.length,
      activeCustomers: customers.filter((customer) => customer.is_active).length,
      activeJobSites: jobSites.filter((site) => site.is_active).length,
    },
  };
}

function isCustomerRecord(value: CustomerRecord | null): value is CustomerRecord {
  return Boolean(
    value &&
      typeof value.id === "string" &&
      typeof value.name === "string" &&
      typeof value.is_active === "boolean",
  );
}

function isJobSiteSummary(
  value: JobSiteSummary | null,
): value is JobSiteSummary {
  return Boolean(
    value &&
      typeof value.id === "string" &&
      typeof value.customer_id === "string" &&
      typeof value.name === "string" &&
      typeof value.city === "string" &&
      typeof value.county === "string" &&
      typeof value.state === "string" &&
      typeof value.is_active === "boolean",
  );
}

function isPlantOption(
  value: CustomerPlantOption | null,
): value is CustomerPlantOption {
  return Boolean(
    value && typeof value.id === "string" && typeof value.name === "string",
  );
}

function objectRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function uniqueStrings(values: Array<string | null | undefined>): string[] {
  return Array.from(
    new Set(
      values
        .map((value) => value?.trim() ?? "")
        .filter((value) => value.length > 0),
    ),
  ).sort((left, right) => left.localeCompare(right));
}

function emptySummary(): CustomerDeskSummary {
  return {
    customers: [],
    jobSites: [],
    plants: [],
    locationOptions: {
      cities: [],
      counties: [],
      states: [],
    },
    counts: {
      customers: 0,
      jobSites: 0,
      activeCustomers: 0,
      activeJobSites: 0,
    },
  };
}
