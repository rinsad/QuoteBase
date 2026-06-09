import type { AppUser } from "@/lib/auth/current-user";
import { createClient } from "@/lib/supabase/server";

export type ApprovalQueueItem = {
  id: string;
  quote_number: string;
  total: number;
  created_at: string;
  submitted_at: string;
  customer_name: string;
  job_site_name: string;
  estimator_name: string;
  margin_pct: number | null;
  flags: ApprovalQueueFlag[];
};

export type ApprovalQueueFlag = "low_margin" | "manual_override" | "new_customer";

type ApprovalQueueRecord = {
  id: string;
  quote_number: string;
  total: number;
  created_at: string;
  customers: { name: string } | { name: string }[] | null;
  job_sites: { name: string } | { name: string }[] | null;
  users: { full_name: string } | { full_name: string }[] | null;
  quote_items: QuoteItemRecord[] | null;
};

type QuoteItemRecord = {
  quantity: number;
  unit_cost: number;
  material_subtotal: number;
};

type DraftAuditRecord = {
  target_id: string | null;
  action: string;
  created_at: string;
  metadata: Record<string, unknown> | null;
};

const LOW_MARGIN_THRESHOLD_PCT = 15;

export async function getApprovalQueue(
  user: AppUser,
): Promise<ApprovalQueueItem[]> {
  const supabase = await createClient();

  if (!supabase) {
    return [];
  }

  const { data } = await supabase
    .from("quotes")
    .select(
      "id, quote_number, total, created_at, customers(name), job_sites(name), users(full_name), quote_items(quantity, unit_cost, material_subtotal)",
    )
    .eq("organization_id", user.organization_id)
    .eq("is_active", true)
    .eq("status", "pending_approval")
    .order("created_at", { ascending: true })
    .limit(100)
    .returns<ApprovalQueueRecord[]>();
  const quoteIds = data?.map((quote) => quote.id) ?? [];
  const { data: auditRows } = quoteIds.length
    ? await supabase
        .from("audit_log")
        .select("target_id, action, metadata, created_at")
        .eq("organization_id", user.organization_id)
        .eq("target_table", "quotes")
        .in("action", ["quote.draft_created", "quote.submitted_for_approval"])
        .in("target_id", quoteIds)
        .returns<DraftAuditRecord[]>()
    : { data: [] };
  const metadataByQuoteId = new Map<string, Record<string, unknown> | null>();
  const submittedAtByQuoteId = new Map<string, string>();

  for (const row of auditRows ?? []) {
    if (!row.target_id) {
      continue;
    }

    if (row.action === "quote.draft_created") {
      metadataByQuoteId.set(row.target_id, row.metadata);
    }

    if (row.action === "quote.submitted_for_approval") {
      const existing = submittedAtByQuoteId.get(row.target_id);

      if (!existing || row.created_at > existing) {
        submittedAtByQuoteId.set(row.target_id, row.created_at);
      }
    }
  }

  return (
    data
      ?.map((quote) => {
        const marginPct = calculateMarginPct(quote.quote_items ?? []);
        const metadata = metadataByQuoteId.get(quote.id) ?? null;
        const submittedAt = submittedAtByQuoteId.get(quote.id) ?? quote.created_at;

        return {
          id: quote.id,
          quote_number: quote.quote_number,
          total: Number(quote.total),
          created_at: quote.created_at,
          submitted_at: submittedAt,
          customer_name: relationOne(quote.customers)?.name ?? "Unknown customer",
          job_site_name: relationOne(quote.job_sites)?.name ?? "Unknown site",
          estimator_name: relationOne(quote.users)?.full_name ?? "Unknown user",
          margin_pct: marginPct,
          flags: buildFlags({ marginPct, metadata }),
        };
      })
      .sort((left, right) => left.submitted_at.localeCompare(right.submitted_at)) ??
    []
  );
}

function calculateMarginPct(items: QuoteItemRecord[]): number | null {
  const totals = items.reduce(
    (sum, item) => ({
      buyCost: sum.buyCost + Number(item.unit_cost) * Number(item.quantity),
      materialSubtotal: sum.materialSubtotal + Number(item.material_subtotal),
    }),
    { buyCost: 0, materialSubtotal: 0 },
  );

  if (totals.materialSubtotal <= 0) {
    return null;
  }

  return ((totals.materialSubtotal - totals.buyCost) / totals.materialSubtotal) * 100;
}

function buildFlags({
  marginPct,
  metadata,
}: {
  marginPct: number | null;
  metadata: Record<string, unknown> | null;
}): ApprovalQueueFlag[] {
  return [
    marginPct !== null && marginPct < LOW_MARGIN_THRESHOLD_PCT
      ? "low_margin"
      : null,
    metadata?.plant_override === true ||
    metadata?.price_override === true ||
    metadata?.minimum_override === true ||
    typeof metadata?.truck_rate_override === "string"
      ? "manual_override"
      : null,
    metadata?.new_customer === true ? "new_customer" : null,
  ].filter((flag): flag is ApprovalQueueFlag => Boolean(flag));
}

function relationOne<T>(value: T | T[] | null): T | null {
  return Array.isArray(value) ? (value[0] ?? null) : value;
}
