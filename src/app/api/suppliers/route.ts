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
  notes: string | null;
  is_active: boolean;
  updated_at: string;
  supplier_plants: Array<{ id: string; name: string }> | null;
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
      "id, name, notes, is_active, updated_at, supplier_plants(id, name)",
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
          plant_count: supplier.supplier_plants?.length ?? 0,
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
