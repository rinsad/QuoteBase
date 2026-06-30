import { revalidatePath } from "next/cache";
import { z } from "zod";

import { getCurrentUser } from "@/lib/auth/current-user";
import { badRequest, apiOk, serverError, unauthorized } from "@/lib/api/responses";
import {
  parsePagination,
  parseQuoteStatus,
  UUID_PATTERN,
} from "@/lib/api/validation";
import { createQuoteDraftRecord } from "@/lib/quotes/create-draft";
import { createClient } from "@/lib/supabase/server";
import type { QuoteStatus } from "@/lib/quotes/quotes";

type QuoteApiRecord = {
  id: string;
  quote_number: string;
  status: QuoteStatus;
  total: number;
  created_at: string;
  customers: { name: string } | { name: string }[] | null;
  job_sites:
    | { name: string; city: string; state: string }
    | { name: string; city: string; state: string }[]
    | null;
  users: { full_name: string; email: string } | { full_name: string; email: string }[] | null;
};

const createQuoteSchema = z
  .object({
    customer_id: z.string().regex(UUID_PATTERN),
    job_site_id: z.string().regex(UUID_PATTERN),
    manual_route_distance_miles: z.coerce
      .number()
      .min(0)
      .max(10000)
      .nullable()
      .optional(),
    manual_deadhead_distance_miles: z.coerce
      .number()
      .min(0)
      .max(10000)
      .nullable()
      .optional(),
    material_id: z.string().regex(UUID_PATTERN),
    tax_rate_id: z.string().regex(UUID_PATTERN).optional().or(z.literal("")),
    quantity: z.coerce.number().positive().max(100000),
    notes: z.string().trim().max(4000).optional().default(""),
    use_selected_plant: z.boolean().optional().default(false),
    material_unit_price_override: z.coerce
      .number()
      .positive()
      .max(1000000)
      .nullable()
      .optional(),
    competitor_price: z.coerce
      .number()
      .positive()
      .max(1000000)
      .nullable()
      .optional(),
    truck_rate_override: z
      .enum(["floor", "standard", "target", "premium", "stretch"])
      .nullable()
      .optional(),
    material_minimum_override: z.coerce
      .number()
      .min(0)
      .max(1000000)
      .nullable()
      .optional(),
    trucking_minimum_override: z.coerce
      .number()
      .min(0)
      .max(1000000)
      .nullable()
      .optional(),
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

  const status = parseQuoteStatus(url.searchParams.get("status"));

  if (!status.ok) {
    return badRequest(status.message);
  }

  let query = supabase
    .from("quotes")
    .select(
      "id, quote_number, status, total, created_at, customers(name), job_sites(name, city, state), users(full_name, email)",
      { count: "exact" },
    )
    .eq("organization_id", user.organization_id)
    .eq("is_active", true)
    .order("created_at", { ascending: false });

  if (status.value) {
    query = query.eq("status", status.value);
  }

  const { data, error, count } = await query
    .range(pagination.value.from, pagination.value.to)
    .returns<QuoteApiRecord[]>();

  if (error) {
    return serverError("Could not load quotes.");
  }

  return apiOk(
    {
      quotes:
        data?.map((quote) => {
          const customer = relationOne(quote.customers);
          const jobSite = relationOne(quote.job_sites);
          const requestedBy = relationOne(quote.users);

          return {
            id: quote.id,
            quote_number: quote.quote_number,
            status: quote.status,
            total: Number(quote.total),
            created_at: quote.created_at,
            customer_name: customer?.name ?? null,
            job_site_name: jobSite?.name ?? null,
            job_site_city: [jobSite?.city, jobSite?.state].filter(Boolean).join(", "),
            requested_by_name: requestedBy?.full_name ?? null,
            requested_by_email: requestedBy?.email ?? null,
          };
        }) ?? [],
    },
    {
      meta: {
        page: pagination.value.page,
        limit: pagination.value.limit,
        total: count ?? 0,
        status: status.value,
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

  const parsed = await parseCreateQuoteBody(request);

  if (!parsed.ok) {
    return badRequest(parsed.message);
  }

  try {
    const quote = await createQuoteDraftRecord({
      supabase,
      user,
      input: {
        customerId: parsed.value.customer_id,
        jobSiteId: parsed.value.job_site_id,
        manualRouteDistanceMiles:
          parsed.value.manual_route_distance_miles ?? null,
        manualDeadheadDistanceMiles:
          parsed.value.manual_deadhead_distance_miles ?? null,
        materialId: parsed.value.material_id,
        taxRateId: parsed.value.tax_rate_id ?? "",
        quantity: parsed.value.quantity,
        lineItems: [],
        notes: parsed.value.notes,
        useSelectedPlant: parsed.value.use_selected_plant,
        materialUnitPriceOverride:
          parsed.value.material_unit_price_override ?? null,
        competitorPrice: parsed.value.competitor_price ?? null,
        truckRateOverride:
          user.role === "admin" ? (parsed.value.truck_rate_override ?? null) : null,
        materialMinimumOverride:
          parsed.value.material_minimum_override ?? null,
        truckingMinimumOverride:
          parsed.value.trucking_minimum_override ?? null,
      },
    });

    revalidatePath("/quotes");
    revalidatePath(`/quotes/${quote.id}`);

    return apiOk({ quote }, { status: 201 });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Could not create quote.";

    if (
      message.includes("required") ||
      message.includes("missing") ||
      message.includes("not enabled") ||
      message.includes("not belong")
    ) {
      return badRequest(message);
    }

    return serverError("Could not create quote.");
  }
}

async function parseCreateQuoteBody(
  request: Request,
): Promise<
  | { ok: true; value: z.infer<typeof createQuoteSchema> }
  | { ok: false; message: string }
> {
  let payload: unknown;

  try {
    payload = await request.json();
  } catch {
    return { ok: false, message: "Request body must be valid JSON." };
  }

  const result = createQuoteSchema.safeParse(payload);

  if (!result.success) {
    return {
      ok: false,
      message: result.error.issues.map((issue) => issue.message).join(" "),
    };
  }

  return { ok: true, value: result.data };
}

function relationOne<T>(value: T | T[] | null): T | null {
  return Array.isArray(value) ? (value[0] ?? null) : value;
}
