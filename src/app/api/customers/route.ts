import { revalidatePath } from "next/cache";
import { z } from "zod";

import { getCurrentUser } from "@/lib/auth/current-user";
import { apiOk, badRequest, serverError, unauthorized } from "@/lib/api/responses";
import { parsePagination } from "@/lib/api/validation";
import { logAction } from "@/lib/audit/log-action";
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

type CreatedCustomerRecord = {
  id: string;
  name: string;
  contact_name: string | null;
  email: string | null;
  phone: string | null;
  is_active: boolean;
};

const createCustomerSchema = z.object({
  name: z.string().trim().min(1).max(160),
  contact_name: z.string().trim().max(160).optional().default(""),
  email: z.string().trim().email().optional().or(z.literal("")),
  phone: z.string().trim().max(40).optional().default(""),
});

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

export async function POST(request: Request) {
  const user = await getCurrentUser();

  if (!user) {
    return unauthorized();
  }

  const supabase = await createClient();

  if (!supabase) {
    return serverError("Supabase is not configured.");
  }

  const parsed = await parseCreateCustomerBody(request);

  if (!parsed.ok) {
    return badRequest(parsed.message);
  }

  const { data: customer, error } = await supabase
    .from("customers")
    .upsert(
      {
        organization_id: user.organization_id,
        name: parsed.value.name,
        contact_name: parsed.value.contact_name || null,
        email: parsed.value.email || null,
        phone: parsed.value.phone || null,
        is_active: true,
      },
      { onConflict: "organization_id,name" },
    )
    .select("id, name, contact_name, email, phone, is_active")
    .single<CreatedCustomerRecord>();

  if (error || !customer) {
    return serverError("Could not save customer.");
  }

  await logAction({
    user,
    action: "customer.saved",
    targetTable: "customers",
    targetId: customer.id,
    before: null,
    after: customer,
  });

  revalidatePath("/customers");

  return apiOk({ customer }, { status: 201 });
}

async function parseCreateCustomerBody(
  request: Request,
): Promise<
  | { ok: true; value: z.infer<typeof createCustomerSchema> }
  | { ok: false; message: string }
> {
  let payload: unknown;

  try {
    payload = await request.json();
  } catch {
    return { ok: false, message: "Request body must be valid JSON." };
  }

  const result = createCustomerSchema.safeParse(payload);

  if (!result.success) {
    return {
      ok: false,
      message: result.error.issues.map((issue) => issue.message).join(" "),
    };
  }

  return { ok: true, value: result.data };
}
