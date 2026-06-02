import { getCurrentUser } from "@/lib/auth/current-user";
import { apiOk, badRequest, serverError, unauthorized } from "@/lib/api/responses";
import { parsePagination } from "@/lib/api/validation";
import { createClient } from "@/lib/supabase/server";

type CustomerApiRecord = {
  id: string;
  name: string;
  contact_name: string | null;
  email: string | null;
  phone: string | null;
  is_active: boolean;
  job_sites:
    | {
        id: string;
        name: string;
        city: string;
        county: string;
        state: string;
        latitude: number | null;
        longitude: number | null;
        is_active: boolean;
      }[]
    | null;
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

  const activeOnly = url.searchParams.get("active") !== "false";

  let query = supabase
    .from("customers")
    .select(
      "id, name, contact_name, email, phone, is_active, job_sites(id, name, city, county, state, latitude, longitude, is_active)",
      { count: "exact" },
    )
    .eq("organization_id", user.organization_id)
    .order("name", { ascending: true });

  if (activeOnly) {
    query = query.eq("is_active", true);
  }

  const { data, error, count } = await query
    .range(pagination.value.from, pagination.value.to)
    .returns<CustomerApiRecord[]>();

  if (error) {
    return serverError("Could not load customers.");
  }

  return apiOk(
    {
      customers:
        data?.map((customer) => ({
          ...customer,
          job_sites: customer.job_sites ?? [],
        })) ?? [],
    },
    {
      meta: {
        page: pagination.value.page,
        limit: pagination.value.limit,
        total: count ?? 0,
        active: activeOnly,
      },
    },
  );
}
