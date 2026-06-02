import { revalidatePath } from "next/cache";
import { z } from "zod";

import {
  apiOk,
  badRequest,
  notFound,
  serverError,
  unauthorized,
} from "@/lib/api/responses";
import { isUuid } from "@/lib/api/validation";
import { getCurrentUser } from "@/lib/auth/current-user";
import { logAction } from "@/lib/audit/log-action";
import { createClient } from "@/lib/supabase/server";

type CustomerDetailRecord = {
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

const updateCustomerSchema = z.object({
  name: z.string().trim().min(1).max(160).optional(),
  contact_name: z.string().trim().max(160).nullable().optional(),
  email: z.string().trim().email().nullable().optional().or(z.literal("")),
  phone: z.string().trim().max(40).nullable().optional(),
  is_active: z.boolean().optional(),
});

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();

  if (!user) {
    return unauthorized();
  }

  const { id } = await params;

  if (!isUuid(id)) {
    return badRequest("id must be a valid UUID.");
  }

  const supabase = await createClient();

  if (!supabase) {
    return serverError("Supabase is not configured.");
  }

  const { data: customer, error } = await supabase
    .from("customers")
    .select(
      "id, name, contact_name, email, phone, is_active, job_sites(id, name, city, county, state, latitude, longitude, is_active)",
    )
    .eq("organization_id", user.organization_id)
    .eq("id", id)
    .single<CustomerDetailRecord>();

  if (error || !customer) {
    return notFound("Customer not found.");
  }

  return apiOk({
    customer: {
      ...customer,
      job_sites: customer.job_sites ?? [],
    },
  });
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();

  if (!user) {
    return unauthorized();
  }

  const { id } = await params;

  if (!isUuid(id)) {
    return badRequest("id must be a valid UUID.");
  }

  const supabase = await createClient();

  if (!supabase) {
    return serverError("Supabase is not configured.");
  }

  const parsed = await parseUpdateCustomerBody(request);

  if (!parsed.ok) {
    return badRequest(parsed.message);
  }

  if (!Object.keys(parsed.value).length) {
    return badRequest("At least one customer field is required.");
  }

  const { data: currentCustomer } = await supabase
    .from("customers")
    .select("id, name, contact_name, email, phone, is_active")
    .eq("organization_id", user.organization_id)
    .eq("id", id)
    .single<Omit<CustomerDetailRecord, "job_sites">>();

  if (!currentCustomer) {
    return notFound("Customer not found.");
  }

  const updatePayload = {
    ...parsed.value,
    email: parsed.value.email === "" ? null : parsed.value.email,
  };

  const { data: updatedCustomer, error } = await supabase
    .from("customers")
    .update(updatePayload)
    .eq("organization_id", user.organization_id)
    .eq("id", id)
    .select("id, name, contact_name, email, phone, is_active")
    .single<Omit<CustomerDetailRecord, "job_sites">>();

  if (error || !updatedCustomer) {
    return serverError("Could not update customer.");
  }

  await logAction({
    user,
    action: "customer.updated",
    targetTable: "customers",
    targetId: updatedCustomer.id,
    before: currentCustomer,
    after: updatedCustomer,
  });

  revalidatePath("/customers");

  return apiOk({ customer: updatedCustomer });
}

async function parseUpdateCustomerBody(
  request: Request,
): Promise<
  | { ok: true; value: z.infer<typeof updateCustomerSchema> }
  | { ok: false; message: string }
> {
  let payload: unknown;

  try {
    payload = await request.json();
  } catch {
    return { ok: false, message: "Request body must be valid JSON." };
  }

  const result = updateCustomerSchema.safeParse(payload);

  if (!result.success) {
    return {
      ok: false,
      message: result.error.issues.map((issue) => issue.message).join(" "),
    };
  }

  return { ok: true, value: result.data };
}
