import { createHash, randomBytes } from "crypto";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { AppUser } from "@/lib/auth/current-user";
import { getBaseUrl } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";

export type QuotePublicLink = {
  id: string;
  quote_id: string;
  expires_at: string;
  last_viewed_at: string | null;
  url: string;
};

export type PublicQuote = {
  id: string;
  quote_number: string;
  status: string;
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
  items: PublicQuoteItem[];
  expires_at: string;
};

export type PublicQuoteResponseResult = {
  quoteId: string;
  quoteNumber: string;
  status: "accepted" | "declined";
};

export type PublicQuoteItem = {
  id: string;
  supplier_name: string;
  material_name: string;
  material_tier: string;
  quantity: number;
  unit: string;
  load_count: number;
  vehicle_name: string | null;
  line_total: number;
};

type QuoteLinkRecord = {
  id: string;
  quote_id: string;
  token_hash: string;
  expires_at: string;
  last_viewed_at: string | null;
};

type PublicQuoteRecord = {
  id: string;
  quote_number: string;
  status: string;
  material_subtotal: number;
  trucking_subtotal: number;
  fees_subtotal: number;
  tax_total: number;
  total: number;
  notes: string | null;
  created_at: string;
  organization_id: string;
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
  quote_items: PublicQuoteItemRecord[] | null;
};

type PublicQuoteResponseLink = {
  id: string;
  organization_id: string;
  quote_id: string;
  expires_at: string;
  revoked_at: string | null;
};

type PublicQuoteResponseRecord = {
  id: string;
  quote_number: string;
  status: string;
  notes: string | null;
  total: number;
};

type PublicQuoteItemRecord = {
  id: string;
  quantity: number;
  unit: string;
  load_count: number;
  line_total: number;
  suppliers: { name: string } | { name: string }[] | null;
  materials:
    | { name: string; tier: string }
    | { name: string; tier: string }[]
    | null;
  vehicle_types: { name: string } | { name: string }[] | null;
};

const PUBLIC_LINK_DAYS = 30;

export async function ensureQuotePublicLink({
  supabase,
  user,
  quoteId,
}: {
  supabase: SupabaseClient;
  user: AppUser;
  quoteId: string;
}): Promise<QuotePublicLink | null> {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + PUBLIC_LINK_DAYS);

  const { data } = await supabase
    .from("quote_public_links")
    .insert({
      organization_id: user.organization_id,
      quote_id: quoteId,
      token_hash: hashToken(token),
      expires_at: expiresAt.toISOString(),
      created_by: user.id,
    })
    .select("id, quote_id, token_hash, expires_at, last_viewed_at")
    .single<QuoteLinkRecord>();

  if (!data) {
    return null;
  }

  return formatLink(data, token);
}

export async function getLatestQuotePublicLink({
  supabase,
  organizationId,
  quoteId,
}: {
  supabase: SupabaseClient;
  organizationId: string;
  quoteId: string;
}): Promise<QuotePublicLink | null> {
  const { data } = await supabase
    .from("quote_public_links")
    .select("id, quote_id, token_hash, expires_at, last_viewed_at")
    .eq("organization_id", organizationId)
    .eq("quote_id", quoteId)
    .is("revoked_at", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle<QuoteLinkRecord>();

  if (!data) {
    return null;
  }

  return formatLink(data, null);
}

export async function getPublicQuoteByToken(
  token: string,
): Promise<PublicQuote | null> {
  const admin = createAdminClient();

  if (!admin || !token || token.length > 256) {
    return null;
  }

  const tokenHash = hashToken(token);
  const { data: link } = await admin
    .from("quote_public_links")
    .select("id, organization_id, quote_id, expires_at, revoked_at, last_viewed_at")
    .eq("token_hash", tokenHash)
    .maybeSingle<{
      id: string;
      organization_id: string;
      quote_id: string;
      expires_at: string;
      revoked_at: string | null;
      last_viewed_at: string | null;
    }>();

  if (!link || link.revoked_at || link.expires_at <= new Date().toISOString()) {
    return null;
  }

  const { data: quote } = await admin
    .from("quotes")
    .select(
      "id, quote_number, status, material_subtotal, trucking_subtotal, fees_subtotal, tax_total, total, notes, created_at, organization_id, customers(name, contact_name, email, phone), job_sites(name, city, county, state, address), users(full_name, email), quote_items(id, quantity, unit, load_count, line_total, suppliers(name), materials(name, tier), vehicle_types(name))",
    )
    .eq("organization_id", link.organization_id)
    .eq("id", link.quote_id)
    .eq("is_active", true)
    .in("status", ["sent", "viewed", "accepted", "declined"])
    .single<PublicQuoteRecord>();

  if (!quote) {
    return null;
  }

  await markPublicQuoteViewed(admin, link, quote.status);
  const visibleStatus =
    quote.status === "sent" && !link.last_viewed_at ? "viewed" : quote.status;

  const customer = relationOne(quote.customers);
  const jobSite = relationOne(quote.job_sites);
  const requestedBy = relationOne(quote.users);

  if (!customer || !jobSite || !requestedBy) {
    return null;
  }

  return {
    id: quote.id,
    quote_number: quote.quote_number,
    status: visibleStatus,
    material_subtotal: Number(quote.material_subtotal),
    trucking_subtotal: Number(quote.trucking_subtotal),
    fees_subtotal: Number(quote.fees_subtotal),
    tax_total: Number(quote.tax_total),
    total: Number(quote.total),
    notes: quote.notes,
    created_at: quote.created_at,
    customer,
    job_site: jobSite,
    requested_by: requestedBy,
    expires_at: link.expires_at,
    items:
      quote.quote_items?.map((item) => {
        const supplier = relationOne(item.suppliers);
        const material = relationOne(item.materials);
        const vehicle = relationOne(item.vehicle_types);

        return {
          id: item.id,
          supplier_name: supplier?.name ?? "Unknown supplier",
          material_name: material?.name ?? "Unknown material",
          material_tier: material?.tier ?? "Unknown",
          quantity: Number(item.quantity),
          unit: item.unit,
          load_count: Number(item.load_count),
          vehicle_name: vehicle?.name ?? null,
          line_total: Number(item.line_total),
        };
      }) ?? [],
  };
}

export async function respondToPublicQuote({
  token,
  response,
  note,
}: {
  token: string;
  response: "accepted" | "declined";
  note: string;
}): Promise<PublicQuoteResponseResult | null> {
  const admin = createAdminClient();

  if (!admin || !token || token.length > 256) {
    return null;
  }

  const tokenHash = hashToken(token);
  const { data: link } = await admin
    .from("quote_public_links")
    .select("id, organization_id, quote_id, expires_at, revoked_at")
    .eq("token_hash", tokenHash)
    .maybeSingle<PublicQuoteResponseLink>();

  if (!link || link.revoked_at || link.expires_at <= new Date().toISOString()) {
    return null;
  }

  const { data: quote } = await admin
    .from("quotes")
    .select("id, quote_number, status, notes, total")
    .eq("organization_id", link.organization_id)
    .eq("id", link.quote_id)
    .eq("is_active", true)
    .single<PublicQuoteResponseRecord>();

  if (!quote || !["sent", "viewed"].includes(quote.status)) {
    return null;
  }

  const nextNote = appendCustomerResponseNote({
    existingNotes: quote.notes,
    response,
    note,
  });
  const { error } = await admin
    .from("quotes")
    .update({
      status: response,
      notes: nextNote,
    })
    .eq("organization_id", link.organization_id)
    .eq("id", quote.id)
    .in("status", ["sent", "viewed"])
    .eq("is_active", true);

  if (error) {
    return null;
  }

  await admin.from("audit_log").insert({
    organization_id: link.organization_id,
    user_id: null,
    action: response === "accepted" ? "quote.customer_accepted" : "quote.customer_declined",
    target_table: "quotes",
    target_id: quote.id,
    before_value: {
      status: quote.status,
      notes: quote.notes,
    },
    after_value: {
      status: response,
      notes: nextNote,
      total: Number(quote.total),
    },
    metadata: {
      public_link_id: link.id,
      response_note: note || null,
    },
  });

  return {
    quoteId: quote.id,
    quoteNumber: quote.quote_number,
    status: response,
  };
}

async function markPublicQuoteViewed(
  admin: SupabaseClient,
  link: {
    id: string;
    organization_id: string;
    quote_id: string;
    last_viewed_at: string | null;
  },
  currentStatus: string,
): Promise<void> {
  await admin
    .from("quote_public_links")
    .update({ last_viewed_at: new Date().toISOString() })
    .eq("id", link.id)
    .eq("organization_id", link.organization_id);

  if (link.last_viewed_at) {
    return;
  }

  const nextStatus = currentStatus === "sent" ? "viewed" : currentStatus;

  if (currentStatus === "sent") {
    await admin
      .from("quotes")
      .update({ status: "viewed" })
      .eq("organization_id", link.organization_id)
      .eq("id", link.quote_id)
      .eq("status", "sent")
      .eq("is_active", true);
  }

  await admin.from("audit_log").insert({
    organization_id: link.organization_id,
    user_id: null,
    action: "quote.customer_viewed",
    target_table: "quotes",
    target_id: link.quote_id,
    before_value: { status: currentStatus },
    after_value: { status: nextStatus },
    metadata: {
      public_link_id: link.id,
    },
  });
}

function formatLink(
  link: QuoteLinkRecord,
  rawToken: string | null,
): QuotePublicLink {
  return {
    id: link.id,
    quote_id: link.quote_id,
    expires_at: link.expires_at,
    last_viewed_at: link.last_viewed_at,
    url: rawToken ? `${getBaseUrl()}/q/${rawToken}` : "",
  };
}

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function relationOne<T>(value: T | T[] | null): T | null {
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

function appendCustomerResponseNote({
  existingNotes,
  response,
  note,
}: {
  existingNotes: string | null;
  response: "accepted" | "declined";
  note: string;
}): string {
  const timestamp = new Date().toISOString();
  const label = response === "accepted" ? "Customer accepted" : "Customer declined";
  const nextNote = note
    ? `[${timestamp}] ${label}: ${note}`
    : `[${timestamp}] ${label}.`;

  return existingNotes ? `${existingNotes}\n\n${nextNote}` : nextNote;
}
