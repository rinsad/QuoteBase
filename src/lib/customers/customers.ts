import type { AppUser } from "@/lib/auth/current-user";
import { createClient } from "@/lib/supabase/server";

export type CustomerSummary = {
  id: string;
  name: string;
  contact_name: string | null;
  email: string | null;
  phone: string | null;
  is_active: boolean;
  job_sites: JobSiteSummary[];
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
  counts: {
    customers: number;
    jobSites: number;
    activeCustomers: number;
    activeJobSites: number;
  };
};

type CustomerRecord = CustomerSummary & {
  job_sites: JobSiteSummary[] | null;
};

export async function getCustomerDeskSummary(
  user: AppUser,
): Promise<CustomerDeskSummary> {
  const supabase = await createClient();

  if (!supabase) {
    return emptySummary();
  }

  const [customersResult, jobSitesResult] = await Promise.all([
    supabase
      .from("customers")
      .select(
        "id, name, contact_name, email, phone, is_active, job_sites(id, customer_id, name, city, county, state, address, latitude, longitude, is_active)",
      )
      .eq("organization_id", user.organization_id)
      .order("name", { ascending: true })
      .returns<CustomerRecord[]>(),
    supabase
      .from("job_sites")
      .select(
        "id, customer_id, name, city, county, state, address, latitude, longitude, is_active",
      )
      .eq("organization_id", user.organization_id)
      .order("name", { ascending: true })
      .returns<JobSiteSummary[]>(),
  ]);

  const customers =
    customersResult.data?.map((customer) => ({
      ...customer,
      job_sites: customer.job_sites ?? [],
    })) ?? [];
  const jobSites = jobSitesResult.data ?? [];

  return {
    customers,
    jobSites,
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
    counts: {
      customers: 0,
      jobSites: 0,
      activeCustomers: 0,
      activeJobSites: 0,
    },
  };
}
