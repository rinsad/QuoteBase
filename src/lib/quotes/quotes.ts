import type { AppUser } from "@/lib/auth/current-user";
import { getQuoteDocuments, type QuoteDocument } from "@/lib/quotes/documents";
import { createClient } from "@/lib/supabase/server";

export type QuoteStatus =
  | "draft"
  | "pending_approval"
  | "changes_requested"
  | "approved"
  | "rejected"
  | "sent"
  | "viewed"
  | "follow_up"
  | "won"
  | "lost"
  | "accepted"
  | "declined"
  | "expired";

export type QuoteListItem = {
  id: string;
  quote_number: string;
  status: QuoteStatus;
  parent_quote_id: string | null;
  revision_number: number;
  total: number;
  created_at: string;
  followup_date: string | null;
  customer_name: string;
  job_site_name: string;
  job_site_city: string;
  requested_by_name: string;
};

export type QuoteListSummary = {
  quotes: QuoteListItem[];
  counts: {
    total: number;
    drafts: number;
    pendingApproval: number;
    approved: number;
    sent: number;
    followUp: number;
    won: number;
    lost: number;
    winRate: number;
  };
  moneyKpis: {
    quotedValue: number;
    openValue: number;
    wonValue: number;
    lostValue: number;
    winRate: number;
    followUpsDue: number;
  };
  hotQuotes: DashboardQuoteInsight[];
  bigQuotes: DashboardQuoteInsight[];
};

export type DashboardQuoteInsight = QuoteListItem & {
  heatScore: number;
  eventCount: number;
  lastEventAt: string | null;
};

export type QuoteDetail = {
  id: string;
  quote_number: string;
  status: QuoteStatus;
  parent_quote_id: string | null;
  revision_number: number;
  material_subtotal: number;
  trucking_subtotal: number;
  fees_subtotal: number;
  tax_total: number;
  total: number;
  notes: string | null;
  created_at: string;
  customer: {
    name: string;
    contact_name: string | null;
    email: string | null;
    phone: string | null;
  };
  job_site: {
    name: string;
    city: string;
    county: string;
    state: string;
    address: Record<string, unknown>;
  };
  requested_by: {
    full_name: string;
    email: string;
  };
  tax_rate: {
    city: string;
    state: string;
    rate: number;
  } | null;
  items: QuoteDetailItem[];
  auditEntries: QuoteAuditEntry[];
  publicEvents: QuotePublicEvent[];
  documents: QuoteDocument[];
  revision_parent: QuoteRevisionLink | null;
  revision_children: QuoteRevisionLink[];
};

export type QuoteRevisionLink = {
  id: string;
  quote_number: string;
  status: QuoteStatus;
  revision_number: number;
  created_at: string;
};

export type QuoteDetailItem = {
  id: string;
  supplier_name: string;
  material_name: string;
  material_tier: string;
  quantity: number;
  unit: string;
  unit_cost: number;
  markup_per_unit: number;
  markup_pct: number;
  material_unit_price: number;
  material_subtotal: number;
  vehicle_name: string | null;
  load_count: number;
  trucking_rate_per_unit: number;
  trucking_subtotal: number;
  fees_subtotal: number;
  line_total: number;
};

export type QuoteAuditEntry = {
  id: string;
  action: string;
  created_at: string;
  user_name: string | null;
};

export type QuotePublicEvent = {
  id: string;
  event_type: string;
  created_at: string;
  request_ip: string | null;
  user_agent: string | null;
  metadata: Record<string, unknown>;
};

type QuoteListRecord = {
  id: string;
  quote_number: string;
  status: QuoteStatus;
  parent_quote_id: string | null;
  revision_number: number;
  total: number;
  created_at: string;
  followup_date: string | null;
  customers: { name: string } | { name: string }[] | null;
  job_sites:
    | { name: string; city: string; state: string }
    | { name: string; city: string; state: string }[]
    | null;
  users: { full_name: string } | { full_name: string }[] | null;
};

type QuoteDetailRecord = {
  id: string;
  quote_number: string;
  status: QuoteStatus;
  parent_quote_id: string | null;
  revision_number: number;
  material_subtotal: number;
  trucking_subtotal: number;
  fees_subtotal: number;
  tax_total: number;
  total: number;
  notes: string | null;
  created_at: string;
  customers:
    | {
        name: string;
        contact_name: string | null;
        email: string | null;
        phone: string | null;
      }
    | {
        name: string;
        contact_name: string | null;
        email: string | null;
        phone: string | null;
      }[]
    | null;
  job_sites:
    | {
        name: string;
        city: string;
        county: string;
        state: string;
        address: Record<string, unknown>;
      }
    | {
        name: string;
        city: string;
        county: string;
        state: string;
        address: Record<string, unknown>;
      }[]
    | null;
  users:
    | { full_name: string; email: string }
    | { full_name: string; email: string }[]
    | null;
  sales_tax_rates:
    | { city: string; state: string; rate: number }
    | { city: string; state: string; rate: number }[]
    | null;
  quote_items: QuoteItemRecord[] | null;
};

type QuoteItemRecord = {
  id: string;
  quantity: number;
  unit: string;
  unit_cost: number;
  markup_per_unit: number | null;
  markup_pct: number;
  material_unit_price: number;
  material_subtotal: number;
  load_count: number;
  trucking_rate_per_unit: number;
  trucking_subtotal: number;
  fees_subtotal: number;
  line_total: number;
  suppliers: { name: string } | { name: string }[] | null;
  materials:
    | { name: string; tier: string }
    | { name: string; tier: string }[]
    | null;
  vehicle_types: { name: string } | { name: string }[] | null;
};

type AuditRecord = {
  id: string;
  action: string;
  created_at: string;
  users: { full_name: string } | { full_name: string }[] | null;
};

type QuotePublicEventRecord = QuotePublicEvent;

type QuoteRevisionLinkRecord = QuoteRevisionLink;

type DashboardEventRecord = {
  quote_id: string;
  event_type: string;
  created_at: string;
};

const OPEN_STATUSES: QuoteStatus[] = ["sent", "viewed", "follow_up"];
const WON_STATUSES: QuoteStatus[] = ["won", "accepted"];
const LOST_STATUSES: QuoteStatus[] = ["lost", "declined"];

export async function getQuoteList(
  user: AppUser,
): Promise<QuoteListSummary> {
  const supabase = await createClient();

  if (!supabase) {
    return emptyList();
  }

  const [
    quotesResult,
    totalCount,
    draftCount,
    pendingCount,
    approvedCount,
    sentCount,
    followUpCount,
    wonCount,
    lostCount,
  ] =
    await Promise.all([
      supabase
        .from("quotes")
        .select(
          "id, quote_number, status, parent_quote_id, revision_number, total, created_at, followup_date, customers(name), job_sites(name, city, state), users(full_name)",
        )
        .eq("organization_id", user.organization_id)
        .eq("is_active", true)
        .order("created_at", { ascending: false })
        .limit(50)
        .returns<QuoteListRecord[]>(),
      supabase
        .from("quotes")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", user.organization_id)
        .eq("is_active", true),
      supabase
        .from("quotes")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", user.organization_id)
        .eq("is_active", true)
        .eq("status", "draft"),
      supabase
        .from("quotes")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", user.organization_id)
        .eq("is_active", true)
        .eq("status", "pending_approval"),
      supabase
        .from("quotes")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", user.organization_id)
        .eq("is_active", true)
        .eq("status", "approved"),
      supabase
        .from("quotes")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", user.organization_id)
        .eq("is_active", true)
        .in("status", ["sent", "viewed"]),
      supabase
        .from("quotes")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", user.organization_id)
        .eq("is_active", true)
        .eq("status", "follow_up"),
      supabase
        .from("quotes")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", user.organization_id)
        .eq("is_active", true)
        .in("status", ["won", "accepted"]),
      supabase
        .from("quotes")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", user.organization_id)
        .eq("is_active", true)
        .in("status", ["lost", "declined"]),
    ]);

  const listQuotes =
    quotesResult.data?.map((quote) => mapQuoteListRecord(quote)) ?? [];
  const metricQuotes = await loadDashboardMetricQuotes(user);
  const metricQuoteIds = metricQuotes.map((quote) => quote.id);
  const eventRows = metricQuoteIds.length
    ? await loadDashboardEvents(user.organization_id, metricQuoteIds)
    : [];
  const insights = buildDashboardInsights(metricQuotes, eventRows);
  const won = wonCount.count ?? 0;
  const lost = lostCount.count ?? 0;
  const decided = won + lost;
  const moneyKpis = buildMoneyKpis(metricQuotes, won, lost);

  return {
    quotes: listQuotes,
    counts: {
      total: totalCount.count ?? 0,
      drafts: draftCount.count ?? 0,
      pendingApproval: pendingCount.count ?? 0,
      approved: approvedCount.count ?? 0,
      sent: sentCount.count ?? 0,
      followUp: followUpCount.count ?? 0,
      won,
      lost,
      winRate: decided ? (won / decided) * 100 : 0,
    },
    moneyKpis,
    hotQuotes: insights
      .filter((quote) => quote.heatScore > 0)
      .sort((left, right) => right.heatScore - left.heatScore || right.total - left.total)
      .slice(0, 5),
    bigQuotes: insights
      .filter((quote) => OPEN_STATUSES.includes(quote.status))
      .sort((left, right) => right.total - left.total)
      .slice(0, 5),
  };
}

async function loadDashboardMetricQuotes(user: AppUser): Promise<QuoteListItem[]> {
  const supabase = await createClient();
  const pageSize = 1000;
  const maxRows = 5000;
  const quotes: QuoteListItem[] = [];

  if (!supabase) {
    return quotes;
  }

  for (let from = 0; from < maxRows; from += pageSize) {
    const { data, error } = await supabase
      .from("quotes")
      .select(
        "id, quote_number, status, parent_quote_id, revision_number, total, created_at, followup_date, customers(name), job_sites(name, city, state), users(full_name)",
      )
      .eq("organization_id", user.organization_id)
      .eq("is_active", true)
      .order("created_at", { ascending: false })
      .range(from, from + pageSize - 1)
      .returns<QuoteListRecord[]>();

    if (error || !data?.length) {
      break;
    }

    quotes.push(...data.map((quote) => mapQuoteListRecord(quote)));

    if (data.length < pageSize) {
      break;
    }
  }

  return quotes;
}

async function loadDashboardEvents(
  organizationId: string,
  quoteIds: string[],
): Promise<DashboardEventRecord[]> {
  const supabase = await createClient();

  if (!supabase) {
    return [];
  }

  const { data } = await supabase
    .from("quote_public_events")
    .select("quote_id, event_type, created_at")
    .eq("organization_id", organizationId)
    .in("quote_id", quoteIds)
    .order("created_at", { ascending: false })
    .limit(500)
    .returns<DashboardEventRecord[]>();

  return data ?? [];
}

function buildMoneyKpis(
  quotes: QuoteListItem[],
  wonCount: number,
  lostCount: number,
): QuoteListSummary["moneyKpis"] {
  const decided = wonCount + lostCount;

  return quotes.reduce(
    (kpis, quote) => ({
      quotedValue: kpis.quotedValue + quote.total,
      openValue: OPEN_STATUSES.includes(quote.status)
        ? kpis.openValue + quote.total
        : kpis.openValue,
      wonValue: WON_STATUSES.includes(quote.status)
        ? kpis.wonValue + quote.total
        : kpis.wonValue,
      lostValue: LOST_STATUSES.includes(quote.status)
        ? kpis.lostValue + quote.total
        : kpis.lostValue,
      winRate: decided ? (wonCount / decided) * 100 : 0,
      followUpsDue:
        isFollowUpDue(quote) ? kpis.followUpsDue + 1 : kpis.followUpsDue,
    }),
    {
      quotedValue: 0,
      openValue: 0,
      wonValue: 0,
      lostValue: 0,
      winRate: decided ? (wonCount / decided) * 100 : 0,
      followUpsDue: 0,
    },
  );
}

function buildDashboardInsights(
  quotes: QuoteListItem[],
  events: DashboardEventRecord[],
): DashboardQuoteInsight[] {
  const engagementByQuote = new Map<
    string,
    { eventCount: number; heatScore: number; lastEventAt: string | null }
  >();
  const now = Date.now();

  for (const event of events) {
    const existing =
      engagementByQuote.get(event.quote_id) ??
      ({ eventCount: 0, heatScore: 0, lastEventAt: null } satisfies {
        eventCount: number;
        heatScore: number;
        lastEventAt: string | null;
      });
    const eventTime = new Date(event.created_at).getTime();
    const ageDays = Number.isFinite(eventTime)
      ? Math.max(0, (now - eventTime) / 86_400_000)
      : 30;
    const recencyMultiplier = ageDays <= 1 ? 3 : ageDays <= 7 ? 2 : 1;
    const eventWeight =
      event.event_type === "viewed"
        ? 8
        : event.event_type.startsWith("payment")
          ? 16
          : 12;

    existing.eventCount += 1;
    existing.heatScore += eventWeight * recencyMultiplier;
    existing.lastEventAt =
      !existing.lastEventAt || event.created_at > existing.lastEventAt
        ? event.created_at
        : existing.lastEventAt;
    engagementByQuote.set(event.quote_id, existing);
  }

  return quotes.map((quote) => {
    const engagement = engagementByQuote.get(quote.id);
    const valueBoost = Math.min(25, quote.total / 1000);

    return {
      ...quote,
      eventCount: engagement?.eventCount ?? 0,
      heatScore: Math.round((engagement?.heatScore ?? 0) + valueBoost),
      lastEventAt: engagement?.lastEventAt ?? null,
    };
  });
}

function mapQuoteListRecord(quote: QuoteListRecord): QuoteListItem {
  const customer = relationOne(quote.customers);
  const site = relationOne(quote.job_sites);
  const requestedBy = relationOne(quote.users);

  return {
    id: quote.id,
    quote_number: quote.quote_number,
    status: quote.status,
    parent_quote_id: quote.parent_quote_id,
    revision_number: Number(quote.revision_number),
    total: Number(quote.total),
    created_at: quote.created_at,
    followup_date: quote.followup_date,
    customer_name: customer?.name ?? "Unknown customer",
    job_site_name: site?.name ?? "Unknown site",
    job_site_city: [site?.city, site?.state].filter(Boolean).join(", "),
    requested_by_name: requestedBy?.full_name ?? "Unknown user",
  };
}

export async function getQuoteDetail(
  user: AppUser,
  quoteId: string,
): Promise<QuoteDetail | null> {
  const supabase = await createClient();

  if (!supabase) {
    return null;
  }

  const [quoteResult, auditResult, publicEventsResult, documents] = await Promise.all([
    supabase
      .from("quotes")
      .select(
        "id, quote_number, status, parent_quote_id, revision_number, material_subtotal, trucking_subtotal, fees_subtotal, tax_total, total, notes, created_at, customers(name, contact_name, email, phone), job_sites(name, city, county, state, address), users(full_name, email), sales_tax_rates(city, state, rate), quote_items(id, quantity, unit, unit_cost, markup_per_unit, markup_pct, material_unit_price, material_subtotal, load_count, trucking_rate_per_unit, trucking_subtotal, fees_subtotal, line_total, suppliers(name), materials(name, tier), vehicle_types(name))",
      )
      .eq("organization_id", user.organization_id)
      .eq("id", quoteId)
      .eq("is_active", true)
      .single<QuoteDetailRecord>(),
    supabase
      .from("audit_log")
      .select("id, action, created_at, users(full_name)")
      .eq("organization_id", user.organization_id)
      .eq("target_table", "quotes")
      .eq("target_id", quoteId)
      .order("created_at", { ascending: false })
      .limit(10)
      .returns<AuditRecord[]>(),
    supabase
      .from("quote_public_events")
      .select("id, event_type, created_at, request_ip, user_agent, metadata")
      .eq("organization_id", user.organization_id)
      .eq("quote_id", quoteId)
      .order("created_at", { ascending: false })
      .limit(10)
      .returns<QuotePublicEventRecord[]>(),
    getQuoteDocuments({
      supabase,
      organizationId: user.organization_id,
      quoteId,
    }),
  ]);

  if (!quoteResult.data) {
    return null;
  }

  const quote = quoteResult.data;
  const customer = relationOne(quote.customers);
  const site = relationOne(quote.job_sites);
  const requestedBy = relationOne(quote.users);
  const taxRate = relationOne(quote.sales_tax_rates);
  const rootQuoteId = quote.parent_quote_id ?? quote.id;

  if (!customer || !site || !requestedBy) {
    return null;
  }

  const [parentResult, childrenResult] = await Promise.all([
    quote.parent_quote_id
      ? supabase
          .from("quotes")
          .select("id, quote_number, status, revision_number, created_at")
          .eq("organization_id", user.organization_id)
          .eq("id", quote.parent_quote_id)
          .eq("is_active", true)
          .single<QuoteRevisionLinkRecord>()
      : Promise.resolve({ data: null }),
    supabase
      .from("quotes")
      .select("id, quote_number, status, revision_number, created_at")
      .eq("organization_id", user.organization_id)
      .eq("parent_quote_id", rootQuoteId)
      .eq("is_active", true)
      .order("revision_number", { ascending: true })
      .returns<QuoteRevisionLinkRecord[]>(),
  ]);

  return {
    id: quote.id,
    quote_number: quote.quote_number,
    status: quote.status,
    parent_quote_id: quote.parent_quote_id,
    revision_number: Number(quote.revision_number),
    material_subtotal: Number(quote.material_subtotal),
    trucking_subtotal: Number(quote.trucking_subtotal),
    fees_subtotal: Number(quote.fees_subtotal),
    tax_total: Number(quote.tax_total),
    total: Number(quote.total),
    notes: quote.notes,
    created_at: quote.created_at,
    customer,
    job_site: site,
    requested_by: requestedBy,
    tax_rate: taxRate
      ? {
          city: taxRate.city,
          state: taxRate.state,
          rate: Number(taxRate.rate),
        }
      : null,
    items:
      quote.quote_items?.map((item) => {
        const supplier = relationOne(item.suppliers);
        const material = relationOne(item.materials);
        const vehicleType = relationOne(item.vehicle_types);

        return {
          id: item.id,
          supplier_name: supplier?.name ?? "Unknown supplier",
          material_name: material?.name ?? "Unknown material",
          material_tier: material?.tier ?? "Unknown",
          quantity: Number(item.quantity),
          unit: item.unit,
          unit_cost: Number(item.unit_cost),
          markup_per_unit: Number(item.markup_per_unit ?? item.markup_pct),
          markup_pct: Number(item.markup_pct),
          material_unit_price: Number(item.material_unit_price),
          material_subtotal: Number(item.material_subtotal),
          vehicle_name: vehicleType?.name ?? null,
          load_count: Number(item.load_count),
          trucking_rate_per_unit: Number(item.trucking_rate_per_unit),
          trucking_subtotal: Number(item.trucking_subtotal),
          fees_subtotal: Number(item.fees_subtotal),
          line_total: Number(item.line_total),
        };
      }) ?? [],
    auditEntries:
      auditResult.data?.map((entry) => ({
        id: entry.id,
        action: entry.action,
        created_at: entry.created_at,
        user_name: relationOne(entry.users)?.full_name ?? null,
      })) ?? [],
    publicEvents:
      publicEventsResult.data?.map((event) => ({
        id: event.id,
        event_type: event.event_type,
        created_at: event.created_at,
        request_ip: event.request_ip,
        user_agent: event.user_agent,
        metadata:
          event.metadata &&
          typeof event.metadata === "object" &&
          !Array.isArray(event.metadata)
            ? event.metadata
            : {},
      })) ?? [],
    documents,
    revision_parent: parentResult.data
      ? {
          id: parentResult.data.id,
          quote_number: parentResult.data.quote_number,
          status: parentResult.data.status,
          revision_number: Number(parentResult.data.revision_number),
          created_at: parentResult.data.created_at,
        }
      : null,
    revision_children:
      childrenResult.data
        ?.filter((revision) => revision.id !== quote.id)
        .map((revision) => ({
          id: revision.id,
          quote_number: revision.quote_number,
          status: revision.status,
          revision_number: Number(revision.revision_number),
          created_at: revision.created_at,
        })) ?? [],
  };
}

function isFollowUpDue(quote: QuoteListItem): boolean {
  return (
    OPEN_STATUSES.includes(quote.status) &&
    Boolean(quote.followup_date) &&
    quote.followup_date! <= new Date().toISOString().slice(0, 10)
  );
}

function relationOne<T>(value: T | T[] | null): T | null {
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

function emptyList(): QuoteListSummary {
  return {
    quotes: [],
    counts: {
      total: 0,
      drafts: 0,
      pendingApproval: 0,
      approved: 0,
      sent: 0,
      followUp: 0,
      won: 0,
      lost: 0,
      winRate: 0,
    },
    moneyKpis: {
      quotedValue: 0,
      openValue: 0,
      wonValue: 0,
      lostValue: 0,
      winRate: 0,
      followUpsDue: 0,
    },
    hotQuotes: [],
    bigQuotes: [],
  };
}
