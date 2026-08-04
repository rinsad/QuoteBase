import { createHash, randomBytes } from "crypto";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { AppUser } from "@/lib/auth/current-user";
import { getBaseUrl } from "@/lib/env";
import { sendGmailQuoteEmail } from "@/lib/integrations/gmail";
import { createAdminClient } from "@/lib/supabase/admin";

export type CreditApplicationLink = {
  id: string;
  quote_id: string;
  customer_id: string;
  status: "sent" | "viewed" | "submitted" | "expired" | "cancelled";
  recipient_email: string | null;
  submitted_at: string | null;
  expires_at: string;
  url: string;
};

export type PublicCreditApplication = {
  id: string;
  quote_id: string;
  quote_number: string;
  status: CreditApplicationLink["status"];
  expires_at: string;
  customer: {
    name: string;
    contact_name: string | null;
    email: string | null;
    phone: string | null;
  };
  branding: {
    company_name: string;
  };
};

type CreditApplicationRecord = {
  id: string;
  quote_id: string;
  customer_id: string;
  public_token: string;
  status: CreditApplicationLink["status"];
  recipient_email: string | null;
  submitted_at: string | null;
  expires_at: string;
};

type PublicCreditApplicationRecord = {
  id: string;
  organization_id: string;
  quote_id: string;
  status: CreditApplicationLink["status"];
  expires_at: string;
  quotes:
    | { quote_number: string; status: string }
    | { quote_number: string; status: string }[]
    | null;
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
};

const CREDIT_APPLICATION_LIFETIME_DAYS = 30;

export async function ensureCreditApplicationLink({
  supabase,
  user,
  quoteId,
}: {
  supabase: SupabaseClient;
  user: AppUser;
  quoteId: string;
}): Promise<CreditApplicationLink | null> {
  const quote = await loadAcceptedQuote({ supabase, user, quoteId });

  if (!quote) {
    return null;
  }

  const existing = await loadCreditApplicationByQuote({
    supabase,
    organizationId: user.organization_id,
    quoteId,
  });

  if (existing) {
    const isReusable =
      existing.status !== "expired" &&
      existing.status !== "cancelled" &&
      new Date(existing.expires_at).getTime() > Date.now();

    if (isReusable) {
      return existing;
    }

    const refreshed = await refreshCreditApplicationLink({
      supabase,
      organizationId: user.organization_id,
      applicationId: existing.id,
    });

    return refreshed ?? existing;
  }

  const token = randomBytes(32).toString("base64url");
  const tokenHash = hashToken(token);
  const expiresAt = new Date();

  expiresAt.setUTCDate(expiresAt.getUTCDate() + CREDIT_APPLICATION_LIFETIME_DAYS);

  const { data } = await supabase
    .from("credit_applications")
    .insert({
      organization_id: user.organization_id,
      quote_id: quoteId,
      customer_id: quote.customer_id,
      created_by: user.id,
      public_token: token,
      public_token_hash: tokenHash,
      recipient_email: quote.customers?.email ?? null,
      sent_at: new Date().toISOString(),
      expires_at: expiresAt.toISOString(),
    })
    .select("id, quote_id, customer_id, public_token, status, recipient_email, submitted_at, expires_at")
    .single<CreditApplicationRecord>();

  return data
    ? {
        ...data,
        url: creditApplicationUrl(data.public_token),
      }
    : null;
}

async function refreshCreditApplicationLink({
  supabase,
  organizationId,
  applicationId,
}: {
  supabase: SupabaseClient;
  organizationId: string;
  applicationId: string;
}): Promise<CreditApplicationLink | null> {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date();

  expiresAt.setUTCDate(expiresAt.getUTCDate() + CREDIT_APPLICATION_LIFETIME_DAYS);

  const { data } = await supabase
    .from("credit_applications")
    .update({
      public_token: token,
      public_token_hash: hashToken(token),
      status: "sent",
      sent_at: new Date().toISOString(),
      viewed_at: null,
      submitted_at: null,
      expires_at: expiresAt.toISOString(),
    })
    .eq("organization_id", organizationId)
    .eq("id", applicationId)
    .select("id, quote_id, customer_id, public_token, status, recipient_email, submitted_at, expires_at")
    .single<CreditApplicationRecord>();

  return data
    ? {
        ...data,
        url: creditApplicationUrl(data.public_token),
      }
    : null;
}

export async function sendCreditApplicationEmail({
  supabase,
  user,
  quoteId,
}: {
  supabase: SupabaseClient;
  user: AppUser;
  quoteId: string;
}): Promise<{
  status: "sent" | "skipped" | "failed";
  url: string | null;
  reason: string | null;
}> {
  const quote = await loadAcceptedQuote({ supabase, user, quoteId });

  if (!quote) {
    return {
      status: "failed",
      url: null,
      reason: "Credit applications are available after a quote is won.",
    };
  }

  const link = await ensureCreditApplicationLink({ supabase, user, quoteId });

  if (!link?.url) {
    return {
      status: "failed",
      url: null,
      reason: "Could not create the credit application link.",
    };
  }

  if (!quote.customers?.email) {
    return {
      status: "skipped",
      url: link.url,
      reason: "Customer does not have an email address.",
    };
  }

  const companyName = await getCompanyName({
    supabase,
    organizationId: user.organization_id,
  });
  const delivery = await sendGmailQuoteEmail({
    supabase,
    organizationId: user.organization_id,
    userId: user.id,
    to: quote.customers.email,
    subject: `${companyName} credit application`,
    text: [
      `Hello ${quote.customers.name},`,
      "",
      `Thank you for accepting quote ${quote.quote_number}.`,
      "Please complete and electronically sign the credit application using the secure link below.",
      "",
      link.url,
      "",
      "Thank you,",
      companyName,
    ].join("\n"),
    attachments: [],
  });

  return {
    status: delivery.status,
    url: link.url,
    reason: delivery.reason,
  };
}

export async function getCreditApplicationByToken(
  token: string,
): Promise<PublicCreditApplication | null> {
  const supabase = createAdminClient();

  if (!supabase) {
    return null;
  }

  const { data } = await supabase
    .from("credit_applications")
    .select(
      "id, organization_id, quote_id, status, expires_at, quotes(quote_number, status), customers(name, contact_name, email, phone)",
    )
    .eq("public_token_hash", hashToken(token))
    .maybeSingle<PublicCreditApplicationRecord>();

  if (!data) {
    return null;
  }

  const quote = relationOne(data.quotes);
  const customer = relationOne(data.customers);

  if (!quote || !customer) {
    return null;
  }

  if (new Date(data.expires_at).getTime() < Date.now()) {
    await supabase
      .from("credit_applications")
      .update({ status: "expired" })
      .eq("id", data.id)
      .neq("status", "submitted");

    return null;
  }

  if (data.status === "sent") {
    await supabase
      .from("credit_applications")
      .update({
        status: "viewed",
        viewed_at: new Date().toISOString(),
      })
      .eq("id", data.id);
  }

  return {
    id: data.id,
    quote_id: data.quote_id,
    quote_number: quote.quote_number,
    status: data.status,
    expires_at: data.expires_at,
    customer,
    branding: {
      company_name: await getCompanyName({
        supabase,
        organizationId: data.organization_id,
      }),
    },
  };
}

export async function submitCreditApplicationByToken({
  token,
  applicationData,
  signatureName,
  signatureTitle,
  requestIp,
  userAgent,
}: {
  token: string;
  applicationData: Record<string, unknown>;
  signatureName: string;
  signatureTitle: string;
  requestIp: string | null;
  userAgent: string | null;
}): Promise<{ ok: true } | { ok: false; message: string }> {
  const supabase = createAdminClient();

  if (!supabase) {
    return { ok: false, message: "Application service is not configured." };
  }

  const { data } = await supabase
    .from("credit_applications")
    .select("id, organization_id, quote_id, status, expires_at")
    .eq("public_token_hash", hashToken(token))
    .maybeSingle<{
      id: string;
      organization_id: string;
      quote_id: string;
      status: CreditApplicationLink["status"];
      expires_at: string;
    }>();

  if (!data) {
    return { ok: false, message: "Credit application link was not found." };
  }

  if (data.status === "submitted") {
    return { ok: false, message: "This credit application was already submitted." };
  }

  if (new Date(data.expires_at).getTime() < Date.now()) {
    await supabase
      .from("credit_applications")
      .update({ status: "expired" })
      .eq("id", data.id);

    return { ok: false, message: "This credit application link has expired." };
  }

  await supabase
    .from("credit_applications")
    .update({
      status: "submitted",
      application_data: applicationData,
      signature_name: signatureName,
      signature_title: signatureTitle,
      signature_ip: requestIp,
      signature_user_agent: userAgent,
      submitted_at: new Date().toISOString(),
    })
    .eq("id", data.id);

  await supabase.from("audit_log").insert({
    organization_id: data.organization_id,
    user_id: null,
    action: "credit_application.submitted",
    target_table: "credit_applications",
    target_id: data.id,
    before_value: {
      status: data.status,
    },
    after_value: {
      status: "submitted",
      quote_id: data.quote_id,
      signature_name: signatureName,
      signature_title: signatureTitle,
    },
    metadata: {
      request_ip: requestIp,
      user_agent: userAgent,
    },
  });

  return { ok: true };
}

async function loadAcceptedQuote({
  supabase,
  user,
  quoteId,
}: {
  supabase: SupabaseClient;
  user: AppUser;
  quoteId: string;
}): Promise<{
  id: string;
  quote_number: string;
  customer_id: string;
  customers: { name: string; email: string | null } | null;
} | null> {
  const { data } = await supabase
    .from("quotes")
    .select("id, quote_number, customer_id, customers(name, email)")
    .eq("organization_id", user.organization_id)
    .eq("id", quoteId)
    .eq("is_active", true)
    .in("status", ["won", "accepted"])
    .maybeSingle<{
      id: string;
      quote_number: string;
      customer_id: string;
      customers:
        | { name: string; email: string | null }
        | { name: string; email: string | null }[]
        | null;
    }>();

  if (!data) {
    return null;
  }

  return {
    id: data.id,
    quote_number: data.quote_number,
    customer_id: data.customer_id,
    customers: relationOne(data.customers),
  };
}

async function loadCreditApplicationByQuote({
  supabase,
  organizationId,
  quoteId,
}: {
  supabase: SupabaseClient;
  organizationId: string;
  quoteId: string;
}): Promise<CreditApplicationLink | null> {
  const { data } = await supabase
    .from("credit_applications")
    .select("id, quote_id, customer_id, public_token, status, recipient_email, submitted_at, expires_at")
    .eq("organization_id", organizationId)
    .eq("quote_id", quoteId)
    .maybeSingle<CreditApplicationRecord>();

  if (!data) {
    return null;
  }

  return {
    ...data,
    url: creditApplicationUrl(data.public_token),
  };
}

async function getCompanyName({
  supabase,
  organizationId,
}: {
  supabase: SupabaseClient;
  organizationId: string;
}): Promise<string> {
  const { data } = await supabase
    .from("quote_branding")
    .select("company_name")
    .eq("organization_id", organizationId)
    .maybeSingle<{ company_name: string }>();

  return data?.company_name ?? "QuoteBase";
}

function creditApplicationUrl(token: string): string {
  return `${getBaseUrl()}/ca/${token}`;
}

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function relationOne<T>(value: T | T[] | null): T | null {
  return Array.isArray(value) ? (value[0] ?? null) : value;
}
