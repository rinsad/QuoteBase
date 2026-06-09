import { createClient } from "@/lib/supabase/server";

export type EstimatorPerformanceRow = {
  user_id: string;
  full_name: string;
  email: string;
  quote_count: number;
  approved_count: number;
  sent_count: number;
  accepted_count: number;
  rejected_count: number;
  total_value: number;
  average_value: number;
  approval_rate: number;
};

export type PricingTrendRow = {
  status: string;
  quote_count: number;
  total_value: number;
  average_value: number;
};

type QuoteReportRecord = {
  requested_by: string;
  status: string;
  total: number;
  users:
    | {
        full_name: string;
        email: string;
      }
    | {
        full_name: string;
        email: string;
      }[]
    | null;
};

export type AdminReportsSummary = {
  estimatorPerformance: EstimatorPerformanceRow[];
  pricingTrends: PricingTrendRow[];
};

export async function getAdminReportsSummary(
  organizationId: string,
): Promise<AdminReportsSummary> {
  const supabase = await createClient();

  if (!supabase) {
    return {
      estimatorPerformance: [],
      pricingTrends: [],
    };
  }

  const { data } = await supabase
    .from("quotes")
    .select("requested_by, status, total, users(full_name, email)")
    .eq("organization_id", organizationId)
    .eq("is_active", true)
    .order("created_at", { ascending: false })
    .limit(500)
    .returns<QuoteReportRecord[]>();

  const quotes = data ?? [];

  return {
    estimatorPerformance: buildEstimatorPerformance(quotes),
    pricingTrends: buildPricingTrends(quotes),
  };
}

function buildEstimatorPerformance(
  quotes: QuoteReportRecord[],
): EstimatorPerformanceRow[] {
  const rows = new Map<string, EstimatorPerformanceRow>();

  for (const quote of quotes) {
    const user = relationOne(quote.users);
    const existing =
      rows.get(quote.requested_by) ??
      ({
        user_id: quote.requested_by,
        full_name: user?.full_name ?? "Unknown user",
        email: user?.email ?? "",
        quote_count: 0,
        approved_count: 0,
        sent_count: 0,
        accepted_count: 0,
        rejected_count: 0,
        total_value: 0,
        average_value: 0,
        approval_rate: 0,
      } satisfies EstimatorPerformanceRow);

    existing.quote_count += 1;
    existing.total_value += Number(quote.total);

    if (quote.status === "approved") {
      existing.approved_count += 1;
    }

    if (quote.status === "sent" || quote.status === "viewed") {
      existing.sent_count += 1;
    }

    if (quote.status === "accepted") {
      existing.accepted_count += 1;
    }

    if (quote.status === "rejected" || quote.status === "declined") {
      existing.rejected_count += 1;
    }

    rows.set(quote.requested_by, existing);
  }

  return Array.from(rows.values())
    .map((row) => ({
      ...row,
      average_value: row.quote_count ? row.total_value / row.quote_count : 0,
      approval_rate: row.quote_count
        ? ((row.approved_count + row.sent_count + row.accepted_count) /
            row.quote_count) *
          100
        : 0,
    }))
    .sort((left, right) => right.total_value - left.total_value);
}

function buildPricingTrends(quotes: QuoteReportRecord[]): PricingTrendRow[] {
  const rows = new Map<string, PricingTrendRow>();

  for (const quote of quotes) {
    const existing =
      rows.get(quote.status) ??
      ({
        status: quote.status,
        quote_count: 0,
        total_value: 0,
        average_value: 0,
      } satisfies PricingTrendRow);

    existing.quote_count += 1;
    existing.total_value += Number(quote.total);
    rows.set(quote.status, existing);
  }

  return Array.from(rows.values())
    .map((row) => ({
      ...row,
      average_value: row.quote_count ? row.total_value / row.quote_count : 0,
    }))
    .sort((left, right) => right.total_value - left.total_value);
}

function relationOne<T>(value: T | T[] | null): T | null {
  return Array.isArray(value) ? (value[0] ?? null) : value;
}
