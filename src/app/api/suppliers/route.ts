import {
  apiOk,
  badRequest,
  serverError,
  unauthorized,
} from "@/lib/api/responses";
import { parsePagination } from "@/lib/api/validation";
import { getCurrentUser } from "@/lib/auth/current-user";
import { createClient } from "@/lib/supabase/server";

type SupplierApiRecord = {
  id: string;
  name: string;
  parent_company: string | null;
  address: Record<string, unknown>;
  latitude: number | null;
  longitude: number | null;
  hours: string | null;
  primary_contact_name: string | null;
  primary_contact_phone: string | null;
  notes: string | null;
  is_active: boolean;
  updated_at: string;
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
  const search = url.searchParams.get("search")?.trim() ?? "";

  let query = supabase
    .from("suppliers")
    .select(
      "id, name, parent_company, address, latitude, longitude, hours, primary_contact_name, primary_contact_phone, notes, is_active, updated_at",
      { count: "exact" },
    )
    .eq("organization_id", user.organization_id)
    .order("name", { ascending: true });

  if (activeOnly) {
    query = query.eq("is_active", true);
  }

  if (search) {
    query = query.ilike("name", `%${search}%`);
  }

  const { data, error, count } = await query
    .range(pagination.value.from, pagination.value.to)
    .returns<SupplierApiRecord[]>();

  if (error) {
    return serverError("Could not load suppliers.");
  }

  return apiOk(
    {
      suppliers:
        data?.map((supplier) => ({
          ...supplier,
          latitude:
            supplier.latitude === null ? null : Number(supplier.latitude),
          longitude:
            supplier.longitude === null ? null : Number(supplier.longitude),
        })) ?? [],
    },
    {
      meta: {
        page: pagination.value.page,
        limit: pagination.value.limit,
        total: count ?? 0,
        active: activeOnly,
        search: search || null,
      },
    },
  );
}
