import { revalidatePath } from "next/cache";
import { z } from "zod";

import { getCurrentUser } from "@/lib/auth/current-user";
import { apiOk, badRequest, serverError, unauthorized } from "@/lib/api/responses";
import { parsePagination } from "@/lib/api/validation";
import { logAction } from "@/lib/audit/log-action";
import {
  captureWebFormLead,
  leadInputSchema,
  resolveOrganizationIdFromLeadPayload,
} from "@/lib/customers/crm";
import { createClient } from "@/lib/supabase/server";

type CustomerApiRecord = {
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
  company_name: string | null;
  contact_name: string | null;
  email: string | null;
  phone: string | null;
  address: Record<string, unknown>;
  payment_terms: string | null;
  pricing_notes: string | null;
  default_plant_id: string | null;
  is_active: boolean;
};

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{12}$/i;

const createCustomerSchema = z.object({
  name: z.string().trim().min(1).max(160),
  company_name: z.string().trim().max(160).optional().default(""),
  contact_name: z.string().trim().max(160).optional().default(""),
  email: z.string().trim().email().optional().or(z.literal("")),
  phone: z.string().trim().max(40).optional().default(""),
  address: z.string().trim().max(240).optional().default(""),
  payment_terms: z.string().trim().max(80).optional().default(""),
  pricing_notes: z.string().trim().max(1000).optional().default(""),
  default_plant_id: z.string().regex(UUID_PATTERN).optional().or(z.literal("")),
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
      "id, name, company_name, contact_name, email, phone, address, payment_terms, pricing_notes, default_plant_id, is_active, job_sites(id, name, city, county, state, latitude, longitude, is_active)",
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
  const url = new URL(request.url);

  if (url.searchParams.get("source") === "web_form") {
    return captureWebFormLeadRequest(request);
  }

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
        company_name: parsed.value.company_name || parsed.value.name,
        contact_name: parsed.value.contact_name || null,
        email: parsed.value.email || null,
        phone: parsed.value.phone || null,
        address: {
          line1: parsed.value.address || null,
        },
        payment_terms: parsed.value.payment_terms || "COD",
        pricing_notes: parsed.value.pricing_notes || null,
        default_plant_id: parsed.value.default_plant_id || null,
        is_active: true,
      },
      { onConflict: "organization_id,name" },
    )
    .select("id, name, company_name, contact_name, email, phone, address, payment_terms, pricing_notes, default_plant_id, is_active")
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

async function captureWebFormLeadRequest(request: Request) {
  const configuredSecret = process.env.WEB_FORM_WEBHOOK_SECRET;
  const providedSecret =
    request.headers.get("x-quotebase-webhook-secret") ??
    bearerToken(request.headers.get("authorization"));

  if (!configuredSecret || providedSecret !== configuredSecret) {
    return unauthorized();
  }

  let payload: unknown;

  try {
    payload = await request.json();
  } catch {
    return badRequest("Request body must be valid JSON.");
  }

  if (!isRecord(payload)) {
    return badRequest("Request body must be an object.");
  }

  const organizationId = await resolveOrganizationIdFromLeadPayload(payload);

  if (!organizationId) {
    return badRequest("organization_id or organization_slug is required.");
  }

  const parsed = leadInputSchema.safeParse({
    company_name: payload.company_name ?? payload.company ?? payload.account,
    contact_name: payload.contact_name ?? payload.contact ?? payload.name,
    title: payload.title,
    email: payload.email,
    phone: payload.phone,
    domain: payload.domain ?? payload.website,
    deal_title: payload.deal_title ?? payload.deal ?? payload.opportunity,
    deal_value: payload.deal_value ?? payload.value ?? payload.amount,
    expected_close_date: payload.expected_close_date ?? payload.close_date,
    notes: payload.notes ?? payload.message,
    source_name: payload.source_name ?? payload.form_name ?? "Web form",
  });

  if (!parsed.success) {
    return badRequest(parsed.error.issues.map((issue) => issue.message).join(" "));
  }

  const result = await captureWebFormLead({
    organizationId,
    lead: parsed.data,
    rawPayload: payload,
  });

  if (!result) {
    return serverError("Could not capture lead.");
  }

  return apiOk({ lead: result }, { status: 201 });
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

function bearerToken(value: string | null): string | null {
  if (!value?.startsWith("Bearer ")) {
    return null;
  }

  return value.slice("Bearer ".length).trim();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
