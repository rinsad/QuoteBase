import { createHash, randomBytes } from "crypto";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { AppUser } from "@/lib/auth/current-user";
import { getBaseUrl } from "@/lib/env";
import { getStripeCheckoutSession } from "@/lib/integrations/stripe";
import { isCodPaymentTerms } from "@/lib/quotes/pricing";
import { createAdminClient } from "@/lib/supabase/admin";

const PUBLIC_QUOTE_VISIBLE_STATUSES = [
  "approved",
  "sent",
  "viewed",
  "follow_up",
  "won",
  "lost",
  "accepted",
  "declined",
];

const PUBLIC_QUOTE_RESPONDABLE_STATUSES = [
  "approved",
  "sent",
  "viewed",
  "follow_up",
];

export type QuotePublicLink = {
  id: string;
  quote_id: string;
  expires_at: string;
  last_viewed_at: string | null;
  view_count: number;
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
  quote_date: string;
  quote_expires_at: string;
  customer: {
    name: string;
    contact_name: string | null;
    email: string | null;
    phone: string | null;
    payment_terms: string | null;
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
  branding: {
    company_name: string;
  };
};

export type PublicQuoteResponseResult = {
  quoteId: string;
  quoteNumber: string;
  status: "accepted" | "declined";
};

export type PublicRequestMetadata = {
  requestIp: string | null;
  userAgent: string | null;
  signerName?: string | null;
};

export type PublicQuoteAcceptanceResult =
  | PublicQuoteResponseResult
  | {
      quoteId: string;
      quoteNumber: string;
      status: "payment_required";
      paymentAttemptId: string;
    };

export type PublicQuotePaymentSession = {
  organizationId: string;
  quoteId: string;
  quoteNumber: string;
  provider: "authorizenet" | "stripe";
  customerEmail: string | null;
  amount: number;
  responseNote: string;
};

export type PublicQuotePaymentResponse = {
  responseCode?: unknown;
  transId?: unknown;
  authCode?: unknown;
  accountType?: unknown;
  accountNumber?: unknown;
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
  view_count: number;
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
  quote_date: string;
  expires_at: string;
  organization_id: string;
  customers:
    | {
        name: string;
        contact_name: string | null;
        email: string | null;
        phone: string | null;
        payment_terms: string | null;
      }
    | {
        name: string;
        contact_name: string | null;
        email: string | null;
        phone: string | null;
        payment_terms: string | null;
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

type PublicQuoteBrandingRecord = {
  company_name: string;
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

type PublicQuoteResponseWithCustomerRecord = PublicQuoteResponseRecord & {
  customers:
    | { email: string | null }
    | { email: string | null }[]
    | null;
};

type PublicQuoteAcceptanceRecord = PublicQuoteResponseRecord & {
  customers:
    | {
        email: string | null;
        payment_terms: string | null;
      }
    | {
        email: string | null;
        payment_terms: string | null;
      }[]
    | null;
};

type PublicQuotePaymentAttemptRecord = {
  id: string;
  organization_id: string;
  quote_id: string;
  public_link_id: string;
  provider: string;
  amount: number;
  status: string;
  response_note: string | null;
  provider_transaction_id: string | null;
  quotes:
    | {
        id: string;
        quote_number: string;
        status: string;
        notes: string | null;
        total: number;
        customers:
          | {
              email: string | null;
              payment_terms: string | null;
            }
          | {
              email: string | null;
              payment_terms: string | null;
            }[]
          | null;
      }
    | {
        id: string;
        quote_number: string;
        status: string;
        notes: string | null;
        total: number;
        customers:
          | {
              email: string | null;
              payment_terms: string | null;
            }
          | {
              email: string | null;
              payment_terms: string | null;
            }[]
          | null;
      }[]
    | null;
};

type PublicQuoteItemRecord = {
  id: string;
  quantity: number;
  unit: string;
  load_count: number;
  line_total: number;
  supplier_plants: { name: string } | { name: string }[] | null;
  materials:
    | { name: string; tier: string }
    | { name: string; tier: string }[]
    | null;
  vehicle_types: { name: string } | { name: string }[] | null;
};

const PUBLIC_LINK_DAYS = 30;
const PAYMENT_PROVIDER_PRIORITY = ["stripe", "authorizenet"] as const;

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
    .select("id, quote_id, token_hash, expires_at, last_viewed_at, view_count")
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
    .select("id, quote_id, token_hash, expires_at, last_viewed_at, view_count")
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
  requestMetadata: PublicRequestMetadata = {
    requestIp: null,
    userAgent: null,
  },
): Promise<PublicQuote | null> {
  const admin = createAdminClient();

  if (!admin || !token || token.length > 256) {
    return null;
  }

  const tokenHash = hashToken(token);
  const { data: link } = await admin
    .from("quote_public_links")
    .select(
      "id, organization_id, quote_id, expires_at, revoked_at, last_viewed_at, view_count",
    )
    .eq("token_hash", tokenHash)
    .maybeSingle<{
      id: string;
      organization_id: string;
      quote_id: string;
      expires_at: string;
      revoked_at: string | null;
      last_viewed_at: string | null;
      view_count: number;
    }>();

  if (!link || link.revoked_at || link.expires_at <= new Date().toISOString()) {
    return null;
  }

  const { data: quote } = await admin
    .from("quotes")
    .select(
      "id, quote_number, status, material_subtotal, trucking_subtotal, fees_subtotal, tax_total, total, notes, created_at, quote_date, expires_at, organization_id, customers(name, contact_name, email, phone, payment_terms), job_sites(name, city, county, state, address), users(full_name, email), quote_items(id, quantity, unit, load_count, line_total, supplier_plants(name), materials(name, tier), vehicle_types(name))",
    )
    .eq("organization_id", link.organization_id)
    .eq("id", link.quote_id)
    .eq("is_active", true)
    .in("status", PUBLIC_QUOTE_VISIBLE_STATUSES)
    .single<PublicQuoteRecord>();

  if (!quote) {
    return null;
  }

  await markPublicQuoteViewed(admin, link, quote.status, requestMetadata);
  const visibleStatus =
    quote.status === "sent" && !link.last_viewed_at ? "viewed" : quote.status;

  const customer = relationOne(quote.customers);
  const jobSite = relationOne(quote.job_sites);
  const requestedBy = relationOne(quote.users);
  const { data: branding } = await admin
    .from("quote_branding")
    .select("company_name")
    .eq("organization_id", quote.organization_id)
    .maybeSingle<PublicQuoteBrandingRecord>();

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
    quote_date: quote.quote_date,
    quote_expires_at: quote.expires_at,
    customer,
    job_site: jobSite,
    requested_by: requestedBy,
    expires_at: link.expires_at,
    branding: {
      company_name: branding?.company_name ?? "QuoteBase",
    },
    items:
      quote.quote_items?.map((item) => {
        const supplier = relationOne(item.supplier_plants);
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
  requestMetadata = {
    requestIp: null,
    userAgent: null,
  },
}: {
  token: string;
  response: "accepted" | "declined";
  note: string;
  requestMetadata?: PublicRequestMetadata;
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
    .select("id, quote_number, status, notes, total, customers(email)")
    .eq("organization_id", link.organization_id)
    .eq("id", link.quote_id)
    .eq("is_active", true)
    .single<PublicQuoteResponseWithCustomerRecord>();

  if (!quote || !PUBLIC_QUOTE_RESPONDABLE_STATUSES.includes(quote.status)) {
    return null;
  }

  const nextStatus = response === "accepted" ? "won" : "lost";

  const nextNote = appendCustomerResponseNote({
    existingNotes: quote.notes,
    response,
    note,
  });
  const { error } = await admin
    .from("quotes")
    .update({
      status: nextStatus,
      notes: nextNote,
      followup_date: null,
    })
    .eq("organization_id", link.organization_id)
    .eq("id", quote.id)
    .in("status", PUBLIC_QUOTE_RESPONDABLE_STATUSES)
    .eq("is_active", true);

  if (error) {
    return null;
  }

  await admin.from("audit_log").insert({
    organization_id: link.organization_id,
    user_id: null,
    action: response === "accepted" ? "quote.customer_won" : "quote.customer_lost",
    target_table: "quotes",
    target_id: quote.id,
    before_value: {
      status: quote.status,
      notes: quote.notes,
    },
    after_value: {
      status: nextStatus,
      notes: nextNote,
      total: Number(quote.total),
    },
    metadata: {
      public_link_id: link.id,
      response_note: note || null,
      signer_name: requestMetadata.signerName || null,
    },
  });
  await recordPublicResponseProof({
    admin,
    organizationId: link.organization_id,
    quoteId: quote.id,
    publicLinkId: link.id,
    response,
    note,
    signerName: requestMetadata.signerName ?? null,
    signerEmail: relationOne(quote.customers)?.email ?? null,
    requestMetadata,
  });

  return {
    quoteId: quote.id,
    quoteNumber: quote.quote_number,
    status: response,
  };
}

export async function startPublicQuoteAcceptance({
  token,
  note,
  requestMetadata = {
    requestIp: null,
    userAgent: null,
  },
}: {
  token: string;
  note: string;
  requestMetadata?: PublicRequestMetadata;
}): Promise<PublicQuoteAcceptanceResult | null> {
  const admin = createAdminClient();

  if (!admin || !token || token.length > 256) {
    return null;
  }

  const link = await getValidPublicLink(admin, token);

  if (!link) {
    return null;
  }

  const { data: quote } = await admin
    .from("quotes")
    .select("id, quote_number, status, notes, total, customers(email, payment_terms)")
    .eq("organization_id", link.organization_id)
    .eq("id", link.quote_id)
    .eq("is_active", true)
    .single<PublicQuoteAcceptanceRecord>();

  if (!quote || !PUBLIC_QUOTE_RESPONDABLE_STATUSES.includes(quote.status)) {
    return null;
  }

  const customer = relationOne(quote.customers);

  if (!isCodPaymentTerms(customer?.payment_terms)) {
    return respondToPublicQuote({
      token,
      response: "accepted",
      note,
      requestMetadata,
    });
  }

  const provider = await resolvePaymentProvider({
    supabase: admin,
    organizationId: link.organization_id,
  });

  if (!provider) {
    return null;
  }

  const { data: attempt, error } = await admin
    .from("quote_payment_attempts")
    .insert({
      organization_id: link.organization_id,
      quote_id: quote.id,
      public_link_id: link.id,
      provider,
      amount: Number(quote.total),
      currency: "USD",
      status: "created",
      response_note: note,
    })
    .select("id")
    .single<{ id: string }>();

  if (error || !attempt) {
    return null;
  }

  await admin.from("audit_log").insert({
    organization_id: link.organization_id,
    user_id: null,
    action: "quote.payment_attempt_created",
    target_table: "quote_payment_attempts",
    target_id: attempt.id,
    after_value: {
      status: "created",
      quote_id: quote.id,
      amount: Number(quote.total),
    },
    metadata: {
      public_link_id: link.id,
      provider,
      response_note: note || null,
      signer_name: requestMetadata.signerName || null,
    },
  });
  await recordPublicEvent({
    admin,
    organizationId: link.organization_id,
    quoteId: quote.id,
    publicLinkId: link.id,
    eventType: "payment_started",
    requestMetadata,
    metadata: {
      payment_attempt_id: attempt.id,
      provider,
      amount: Number(quote.total),
      signer_name: requestMetadata.signerName || null,
    },
  });

  return {
    quoteId: quote.id,
    quoteNumber: quote.quote_number,
    status: "payment_required",
    paymentAttemptId: attempt.id,
  };
}

export async function getPublicQuotePaymentSession({
  token,
  attemptId,
}: {
  token: string;
  attemptId: string;
}): Promise<PublicQuotePaymentSession | null> {
  const admin = createAdminClient();

  if (!admin || !token || token.length > 256 || !attemptId) {
    return null;
  }

  const link = await getValidPublicLink(admin, token);

  if (!link) {
    return null;
  }

  const attempt = await getPaymentAttemptForLink({
    admin,
    link,
    attemptId,
  });

  if (
    !attempt ||
    !["created", "tokenized"].includes(attempt.status) ||
    !["authorizenet", "stripe"].includes(attempt.provider)
  ) {
    return null;
  }

  const quote = relationOne(attempt.quotes);
  const customer = relationOne(quote?.customers ?? null);

  if (!quote || !PUBLIC_QUOTE_RESPONDABLE_STATUSES.includes(quote.status)) {
    return null;
  }

  if (!isCodPaymentTerms(customer?.payment_terms)) {
    return null;
  }

  return {
    organizationId: link.organization_id,
    quoteId: quote.id,
    quoteNumber: quote.quote_number,
    provider: attempt.provider as "authorizenet" | "stripe",
    customerEmail: customer?.email ?? null,
    amount: Number(attempt.amount),
    responseNote: attempt.response_note ?? "",
  };
}

export async function markPublicQuotePaymentTokenized({
  token,
  attemptId,
}: {
  token: string;
  attemptId: string;
}): Promise<boolean> {
  const admin = createAdminClient();

  if (!admin || !token || token.length > 256 || !attemptId) {
    return false;
  }

  const link = await getValidPublicLink(admin, token);

  if (!link) {
    return false;
  }

  const { error } = await admin
    .from("quote_payment_attempts")
    .update({
      status: "tokenized",
      hosted_token_created_at: new Date().toISOString(),
    })
    .eq("organization_id", link.organization_id)
    .eq("public_link_id", link.id)
    .eq("id", attemptId)
    .in("status", ["created", "tokenized"]);

  return !error;
}

export async function completePublicQuotePayment({
  token,
  attemptId,
  response,
  requestMetadata = {
    requestIp: null,
    userAgent: null,
  },
}: {
  token: string;
  attemptId: string;
  response: PublicQuotePaymentResponse;
  requestMetadata?: PublicRequestMetadata;
}): Promise<PublicQuoteResponseResult | null> {
  const admin = createAdminClient();

  if (!admin || !token || token.length > 256 || !attemptId) {
    return null;
  }

  const link = await getValidPublicLink(admin, token);

  if (!link) {
    return null;
  }

  const attempt = await getPaymentAttemptForLink({
    admin,
    link,
    attemptId,
  });

  if (
    !attempt ||
    attempt.provider !== "authorizenet" ||
    !["created", "tokenized", "failed", "paid"].includes(attempt.status)
  ) {
    return null;
  }

  const quote = relationOne(attempt.quotes);

  if (!quote) {
    return null;
  }

  if (quote.status === "won" && attempt.status === "paid") {
    return {
      quoteId: quote.id,
      quoteNumber: quote.quote_number,
      status: "accepted",
    };
  }

  if (!PUBLIC_QUOTE_RESPONDABLE_STATUSES.includes(quote.status)) {
    return null;
  }

  const responseCode = stringValue(response.responseCode);
  const transactionId = stringValue(response.transId);

  if (transactionId) {
    const { data: existingPaidAttempt } = await admin
      .from("quote_payment_attempts")
      .select("id, quote_id, quotes(id, quote_number, status)")
      .eq("organization_id", link.organization_id)
      .eq("provider", "authorizenet")
      .eq("provider_transaction_id", transactionId)
      .eq("status", "paid")
      .maybeSingle<{
        id: string;
        quote_id: string;
        quotes:
          | { id: string; quote_number: string; status: string }
          | { id: string; quote_number: string; status: string }[]
          | null;
      }>();
    const existingQuote = relationOne(existingPaidAttempt?.quotes ?? null);

    if (existingPaidAttempt && existingQuote?.status === "won") {
      return {
        quoteId: existingQuote.id,
        quoteNumber: existingQuote.quote_number,
        status: "accepted",
      };
    }
  }

  if (responseCode !== "1") {
    await admin
      .from("quote_payment_attempts")
      .update({
        status: "failed",
        provider_response_code: responseCode,
        raw_response: response,
      })
      .eq("organization_id", link.organization_id)
      .eq("id", attempt.id);

    await admin.from("audit_log").insert({
      organization_id: link.organization_id,
      user_id: null,
      action: "quote.payment_failed",
      target_table: "quote_payment_attempts",
      target_id: attempt.id,
      before_value: { status: attempt.status },
      after_value: { status: "failed", response_code: responseCode },
      metadata: {
        public_link_id: link.id,
        quote_id: quote.id,
      },
    });
    await recordPublicEvent({
      admin,
      organizationId: link.organization_id,
      quoteId: quote.id,
      publicLinkId: link.id,
      eventType: "payment_failed",
      requestMetadata,
      metadata: {
        payment_attempt_id: attempt.id,
        provider: "authorizenet",
        response_code: responseCode,
      },
    });

    return null;
  }

  const nextNote = appendCustomerResponseNote({
    existingNotes: quote.notes,
    response: "accepted",
    note: paymentAcceptanceNote(attempt.response_note, transactionId),
  });

  const { error: attemptError } = await admin
    .from("quote_payment_attempts")
    .update({
      status: "paid",
      provider_transaction_id: transactionId,
      provider_response_code: responseCode,
      provider_auth_code: stringValue(response.authCode),
      provider_account_type: stringValue(response.accountType),
      provider_account_number: stringValue(response.accountNumber),
      raw_response: response,
    })
    .eq("organization_id", link.organization_id)
    .eq("id", attempt.id);

  if (attemptError) {
    return null;
  }

  const { error: quoteError } = await admin
    .from("quotes")
    .update({
      status: "won",
      notes: nextNote,
    })
    .eq("organization_id", link.organization_id)
    .eq("id", quote.id)
    .in("status", PUBLIC_QUOTE_RESPONDABLE_STATUSES)
    .eq("is_active", true);

  if (quoteError) {
    return null;
  }

  await admin.from("audit_log").insert({
    organization_id: link.organization_id,
    user_id: null,
    action: "quote.customer_paid_and_won",
    target_table: "quotes",
    target_id: quote.id,
    before_value: {
      status: quote.status,
      notes: quote.notes,
    },
    after_value: {
      status: "won",
      notes: nextNote,
      total: Number(quote.total),
      payment_attempt_id: attempt.id,
      transaction_id: transactionId,
    },
    metadata: {
      public_link_id: link.id,
      payment_attempt_id: attempt.id,
      provider: "authorizenet",
    },
  });
  await recordPublicResponseProof({
    admin,
    organizationId: link.organization_id,
    quoteId: quote.id,
    publicLinkId: link.id,
    response: "accepted",
    note: attempt.response_note ?? "",
    signerName: null,
    signerEmail: relationOne(quote.customers)?.email ?? null,
    requestMetadata,
    paymentAttemptId: attempt.id,
    providerTransactionId: transactionId,
    metadata: {
      provider: "authorizenet",
    },
  });
  await recordPublicEvent({
    admin,
    organizationId: link.organization_id,
    quoteId: quote.id,
    publicLinkId: link.id,
    eventType: "payment_completed",
    requestMetadata,
    metadata: {
      payment_attempt_id: attempt.id,
      provider: "authorizenet",
      transaction_id: transactionId,
    },
  });

  return {
    quoteId: quote.id,
    quoteNumber: quote.quote_number,
    status: "accepted",
  };
}

export async function markPublicQuoteStripeCheckoutStarted({
  token,
  attemptId,
  sessionId,
}: {
  token: string;
  attemptId: string;
  sessionId: string;
}): Promise<boolean> {
  const admin = createAdminClient();

  if (!admin || !token || token.length > 256 || !attemptId || !sessionId) {
    return false;
  }

  const link = await getValidPublicLink(admin, token);

  if (!link) {
    return false;
  }

  const { error } = await admin
    .from("quote_payment_attempts")
    .update({
      status: "tokenized",
      hosted_token_created_at: new Date().toISOString(),
      provider_transaction_id: sessionId,
    })
    .eq("organization_id", link.organization_id)
    .eq("public_link_id", link.id)
    .eq("id", attemptId)
    .eq("provider", "stripe")
    .in("status", ["created", "tokenized"]);

  return !error;
}

export async function completePublicStripeQuotePayment({
  token,
  attemptId,
  sessionId,
  requestMetadata = {
    requestIp: null,
    userAgent: null,
  },
}: {
  token: string;
  attemptId: string;
  sessionId: string;
  requestMetadata?: PublicRequestMetadata;
}): Promise<PublicQuoteResponseResult | null> {
  const admin = createAdminClient();

  if (!admin || !token || token.length > 256 || !attemptId || !sessionId) {
    return null;
  }

  const link = await getValidPublicLink(admin, token);

  if (!link) {
    return null;
  }

  const attempt = await getPaymentAttemptForLink({
    admin,
    link,
    attemptId,
  });

  if (
    !attempt ||
    attempt.provider !== "stripe" ||
    !["created", "tokenized", "failed", "paid"].includes(attempt.status)
  ) {
    return null;
  }

  const quote = relationOne(attempt.quotes);

  if (!quote) {
    return null;
  }

  if (quote.status === "won" && attempt.status === "paid") {
    return {
      quoteId: quote.id,
      quoteNumber: quote.quote_number,
      status: "accepted",
    };
  }

  if (!PUBLIC_QUOTE_RESPONDABLE_STATUSES.includes(quote.status)) {
    return null;
  }

  const session = await getStripeCheckoutSession({
    supabase: admin,
    organizationId: link.organization_id,
    sessionId,
  });

  if (session.paymentStatus !== "paid") {
    await admin
      .from("quote_payment_attempts")
      .update({
        status: "failed",
        provider_response_code: session.paymentStatus,
        raw_response: session,
      })
      .eq("organization_id", link.organization_id)
      .eq("id", attempt.id);

    await admin.from("audit_log").insert({
      organization_id: link.organization_id,
      user_id: null,
      action: "quote.payment_failed",
      target_table: "quote_payment_attempts",
      target_id: attempt.id,
      before_value: { status: attempt.status },
      after_value: { status: "failed", response_code: session.paymentStatus },
      metadata: {
        public_link_id: link.id,
        quote_id: quote.id,
        provider: "stripe",
      },
    });
    await recordPublicEvent({
      admin,
      organizationId: link.organization_id,
      quoteId: quote.id,
      publicLinkId: link.id,
      eventType: "payment_failed",
      requestMetadata,
      metadata: {
        payment_attempt_id: attempt.id,
        provider: "stripe",
        checkout_session_id: session.id,
        payment_status: session.paymentStatus,
      },
    });

    return null;
  }

  const nextNote = appendCustomerResponseNote({
    existingNotes: quote.notes,
    response: "accepted",
    note: paymentAcceptanceNote(attempt.response_note, session.paymentIntentId),
  });

  const { error: attemptError } = await admin
    .from("quote_payment_attempts")
    .update({
      status: "paid",
      provider_transaction_id: session.id,
      provider_response_code: session.paymentStatus,
      provider_auth_code: session.paymentIntentId,
      raw_response: session,
    })
    .eq("organization_id", link.organization_id)
    .eq("id", attempt.id);

  if (attemptError) {
    return null;
  }

  const { error: quoteError } = await admin
    .from("quotes")
    .update({
      status: "won",
      notes: nextNote,
    })
    .eq("organization_id", link.organization_id)
    .eq("id", quote.id)
    .in("status", PUBLIC_QUOTE_RESPONDABLE_STATUSES)
    .eq("is_active", true);

  if (quoteError) {
    return null;
  }

  await admin.from("audit_log").insert({
    organization_id: link.organization_id,
    user_id: null,
    action: "quote.customer_paid_and_won",
    target_table: "quotes",
    target_id: quote.id,
    before_value: {
      status: quote.status,
      notes: quote.notes,
    },
    after_value: {
      status: "won",
      notes: nextNote,
      total: Number(quote.total),
      payment_attempt_id: attempt.id,
      transaction_id: session.paymentIntentId,
    },
    metadata: {
      public_link_id: link.id,
      payment_attempt_id: attempt.id,
      provider: "stripe",
      checkout_session_id: session.id,
    },
  });
  await recordPublicResponseProof({
    admin,
    organizationId: link.organization_id,
    quoteId: quote.id,
    publicLinkId: link.id,
    response: "accepted",
    note: attempt.response_note ?? "",
    signerName: null,
    signerEmail: relationOne(quote.customers)?.email ?? null,
    requestMetadata,
    paymentAttemptId: attempt.id,
    providerTransactionId: session.paymentIntentId,
    metadata: {
      provider: "stripe",
      checkout_session_id: session.id,
    },
  });
  await recordPublicEvent({
    admin,
    organizationId: link.organization_id,
    quoteId: quote.id,
    publicLinkId: link.id,
    eventType: "payment_completed",
    requestMetadata,
    metadata: {
      payment_attempt_id: attempt.id,
      provider: "stripe",
      checkout_session_id: session.id,
      payment_intent_id: session.paymentIntentId,
    },
  });

  return {
    quoteId: quote.id,
    quoteNumber: quote.quote_number,
    status: "accepted",
  };
}

export async function completeStripeQuotePaymentAttempt({
  organizationId,
  attemptId,
  sessionId,
  paymentStatus,
  paymentIntentId,
  rawResponse,
  requestMetadata = {
    requestIp: null,
    userAgent: "stripe-webhook",
  },
}: {
  organizationId: string;
  attemptId: string;
  sessionId: string;
  paymentStatus: string | null;
  paymentIntentId: string | null;
  rawResponse: Record<string, unknown>;
  requestMetadata?: PublicRequestMetadata;
}): Promise<PublicQuoteResponseResult | null> {
  const admin = createAdminClient();

  if (!admin || !organizationId || !attemptId || !sessionId) {
    return null;
  }

  const { data: attempt } = await admin
    .from("quote_payment_attempts")
    .select(
      "id, organization_id, quote_id, public_link_id, provider, amount, status, response_note, provider_transaction_id, quotes(id, quote_number, status, notes, total, customers(email, payment_terms))",
    )
    .eq("organization_id", organizationId)
    .eq("id", attemptId)
    .eq("provider", "stripe")
    .maybeSingle<PublicQuotePaymentAttemptRecord>();

  if (!attempt || !["created", "tokenized", "failed", "paid"].includes(attempt.status)) {
    return null;
  }

  const quote = relationOne(attempt.quotes);

  if (!quote) {
    return null;
  }

  if (quote.status === "won" && attempt.status === "paid") {
    return {
      quoteId: quote.id,
      quoteNumber: quote.quote_number,
      status: "accepted",
    };
  }

  if (!PUBLIC_QUOTE_RESPONDABLE_STATUSES.includes(quote.status)) {
    return null;
  }

  if (paymentStatus !== "paid") {
    await admin
      .from("quote_payment_attempts")
      .update({
        status: "failed",
        provider_response_code: paymentStatus,
        raw_response: rawResponse,
      })
      .eq("organization_id", organizationId)
      .eq("id", attempt.id);

    await admin.from("audit_log").insert({
      organization_id: organizationId,
      user_id: null,
      action: "quote.payment_failed",
      target_table: "quote_payment_attempts",
      target_id: attempt.id,
      before_value: { status: attempt.status },
      after_value: { status: "failed", response_code: paymentStatus },
      metadata: {
        public_link_id: attempt.public_link_id,
        quote_id: quote.id,
        provider: "stripe",
        checkout_session_id: sessionId,
      },
    });

    return null;
  }

  const nextNote = appendCustomerResponseNote({
    existingNotes: quote.notes,
    response: "accepted",
    note: paymentAcceptanceNote(attempt.response_note, paymentIntentId),
  });

  const { error: attemptError } = await admin
    .from("quote_payment_attempts")
    .update({
      status: "paid",
      provider_transaction_id: sessionId,
      provider_response_code: paymentStatus,
      provider_auth_code: paymentIntentId,
      raw_response: rawResponse,
    })
    .eq("organization_id", organizationId)
    .eq("id", attempt.id);

  if (attemptError) {
    return null;
  }

  const { error: quoteError } = await admin
    .from("quotes")
    .update({
      status: "won",
      notes: nextNote,
    })
    .eq("organization_id", organizationId)
    .eq("id", quote.id)
    .in("status", PUBLIC_QUOTE_RESPONDABLE_STATUSES)
    .eq("is_active", true);

  if (quoteError) {
    return null;
  }

  await admin.from("audit_log").insert({
    organization_id: organizationId,
    user_id: null,
    action: "quote.customer_paid_and_won",
    target_table: "quotes",
    target_id: quote.id,
    before_value: {
      status: quote.status,
      notes: quote.notes,
    },
    after_value: {
      status: "won",
      notes: nextNote,
      total: Number(quote.total),
      payment_attempt_id: attempt.id,
      transaction_id: paymentIntentId,
    },
    metadata: {
      public_link_id: attempt.public_link_id,
      payment_attempt_id: attempt.id,
      provider: "stripe",
      checkout_session_id: sessionId,
      source: "stripe_webhook",
    },
  });
  await recordPublicResponseProof({
    admin,
    organizationId,
    quoteId: quote.id,
    publicLinkId: attempt.public_link_id,
    response: "accepted",
    note: attempt.response_note ?? "",
    signerName: null,
    signerEmail: relationOne(quote.customers)?.email ?? null,
    requestMetadata,
    paymentAttemptId: attempt.id,
    providerTransactionId: paymentIntentId,
    metadata: {
      provider: "stripe",
      checkout_session_id: sessionId,
      source: "stripe_webhook",
    },
  });
  await recordPublicEvent({
    admin,
    organizationId,
    quoteId: quote.id,
    publicLinkId: attempt.public_link_id,
    eventType: "payment_completed",
    requestMetadata,
    metadata: {
      payment_attempt_id: attempt.id,
      provider: "stripe",
      checkout_session_id: sessionId,
      payment_intent_id: paymentIntentId,
      source: "stripe_webhook",
    },
  });

  return {
    quoteId: quote.id,
    quoteNumber: quote.quote_number,
    status: "accepted",
  };
}

async function markPublicQuoteViewed(
  admin: SupabaseClient,
  link: {
    id: string;
    organization_id: string;
    quote_id: string;
    last_viewed_at: string | null;
    view_count: number;
  },
  currentStatus: string,
  requestMetadata: PublicRequestMetadata,
): Promise<void> {
  const viewedAt = new Date().toISOString();
  const nextViewCount = Number(link.view_count ?? 0) + 1;
  const linkUpdate: {
    first_viewed_at?: string;
    last_viewed_at: string;
    view_count: number;
  } = {
    last_viewed_at: viewedAt,
    view_count: nextViewCount,
  };

  if (!link.last_viewed_at) {
    linkUpdate.first_viewed_at = viewedAt;
  }

  await admin
    .from("quote_public_links")
    .update(linkUpdate)
    .eq("id", link.id)
    .eq("organization_id", link.organization_id);

  await recordPublicEvent({
    admin,
    organizationId: link.organization_id,
    quoteId: link.quote_id,
    publicLinkId: link.id,
    eventType: "viewed",
    requestMetadata,
    metadata: {
      first_view: !link.last_viewed_at,
      view_count: nextViewCount,
    },
  });

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
      request_ip: requestMetadata.requestIp,
      user_agent: requestMetadata.userAgent,
    },
  });
}

async function recordPublicResponseProof({
  admin,
  organizationId,
  quoteId,
  publicLinkId,
  response,
  note,
  signerName,
  signerEmail,
  requestMetadata,
  paymentAttemptId = null,
  providerTransactionId = null,
  metadata = {},
}: {
  admin: SupabaseClient;
  organizationId: string;
  quoteId: string;
  publicLinkId: string;
  response: "accepted" | "declined";
  note: string;
  signerName: string | null;
  signerEmail: string | null;
  requestMetadata: PublicRequestMetadata;
  paymentAttemptId?: string | null;
  providerTransactionId?: string | null;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  await admin.from("quote_response_proofs").insert({
    organization_id: organizationId,
    quote_id: quoteId,
    public_link_id: publicLinkId,
    payment_attempt_id: paymentAttemptId,
    response,
    signer_name: signerName || null,
    signer_email: signerEmail,
    response_note: note || null,
    accepted_terms: response === "accepted",
    request_ip: requestMetadata.requestIp,
    user_agent: requestMetadata.userAgent,
    provider_transaction_id: providerTransactionId,
    metadata,
  });

  await recordPublicEvent({
    admin,
    organizationId,
    quoteId,
    publicLinkId,
    eventType: response,
    requestMetadata,
    metadata: {
      ...metadata,
      payment_attempt_id: paymentAttemptId,
      provider_transaction_id: providerTransactionId,
      signer_name: signerName || null,
    },
  });
}

async function recordPublicEvent({
  admin,
  organizationId,
  quoteId,
  publicLinkId,
  eventType,
  requestMetadata,
  metadata = {},
}: {
  admin: SupabaseClient;
  organizationId: string;
  quoteId: string;
  publicLinkId: string;
  eventType:
    | "viewed"
    | "accepted"
    | "declined"
    | "payment_started"
    | "payment_tokenized"
    | "payment_failed"
    | "payment_completed";
  requestMetadata: PublicRequestMetadata;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  await admin.from("quote_public_events").insert({
    organization_id: organizationId,
    quote_id: quoteId,
    public_link_id: publicLinkId,
    event_type: eventType,
    request_ip: requestMetadata.requestIp,
    user_agent: requestMetadata.userAgent,
    metadata,
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
    view_count: Number(link.view_count ?? 0),
    url: rawToken ? `${getBaseUrl()}/q/${rawToken}` : "",
  };
}

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function relationOne<T>(value: T | T[] | null): T | null {
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

async function getValidPublicLink(
  admin: SupabaseClient,
  token: string,
): Promise<PublicQuoteResponseLink | null> {
  const { data: link } = await admin
    .from("quote_public_links")
    .select("id, organization_id, quote_id, expires_at, revoked_at")
    .eq("token_hash", hashToken(token))
    .maybeSingle<PublicQuoteResponseLink>();

  if (!link || link.revoked_at || link.expires_at <= new Date().toISOString()) {
    return null;
  }

  return link;
}

async function getPaymentAttemptForLink({
  admin,
  link,
  attemptId,
}: {
  admin: SupabaseClient;
  link: PublicQuoteResponseLink;
  attemptId: string;
}): Promise<PublicQuotePaymentAttemptRecord | null> {
  const { data } = await admin
    .from("quote_payment_attempts")
    .select(
      "id, organization_id, quote_id, public_link_id, provider, amount, status, response_note, provider_transaction_id, quotes(id, quote_number, status, notes, total, customers(email, payment_terms))",
    )
    .eq("organization_id", link.organization_id)
    .eq("public_link_id", link.id)
    .eq("quote_id", link.quote_id)
    .eq("id", attemptId)
    .maybeSingle<PublicQuotePaymentAttemptRecord>();

  return data ?? null;
}

function stringValue(value: unknown): string | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }

  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function paymentAcceptanceNote(
  customerNote: string | null,
  transactionId: string | null,
): string {
  const paymentText = transactionId
    ? `Card payment received. Transaction ${transactionId}.`
    : "Card payment received.";

  return customerNote ? `${customerNote}\n${paymentText}` : paymentText;
}

async function resolvePaymentProvider({
  supabase,
  organizationId,
}: {
  supabase: SupabaseClient;
  organizationId: string;
}): Promise<"authorizenet" | "stripe" | null> {
  const { data } = await supabase
    .from("organization_integrations")
    .select("provider, is_enabled, credentials_last4")
    .eq("organization_id", organizationId)
    .in("provider", [...PAYMENT_PROVIDER_PRIORITY])
    .returns<
      Array<{
        provider: "authorizenet" | "stripe";
        is_enabled: boolean;
        credentials_last4: Record<string, unknown> | null;
      }>
    >();

  for (const provider of PAYMENT_PROVIDER_PRIORITY) {
    const integration = data?.find((item) => item.provider === provider);

    if (!integration?.is_enabled) {
      continue;
    }

    if (provider === "stripe" && integration.credentials_last4?.secret_key) {
      return provider;
    }

    if (
      provider === "authorizenet" &&
      integration.credentials_last4?.api_login_id &&
      integration.credentials_last4?.transaction_key
    ) {
      return provider;
    }
  }

  return null;
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
