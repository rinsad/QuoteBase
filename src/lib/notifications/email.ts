import type { SupabaseClient } from "@supabase/supabase-js";

import {
  sendGmailQuoteEmail,
  type EmailAttachment,
} from "@/lib/integrations/gmail";

export type EmailDeliveryResult = {
  status: "sent" | "skipped" | "failed";
  provider: "gmail" | "none";
  messageId: string | null;
  reason: string | null;
};

type QuoteEmailInput = {
  supabase: SupabaseClient;
  organizationId: string;
  senderUserId: string;
  to: string;
  customerName: string;
  quoteNumber: string;
  quoteUrl: string;
  total: number;
  attachments?: EmailAttachment[];
};

type EmailBrandingRecord = {
  company_name: string;
};

export async function sendQuoteEmail({
  supabase,
  organizationId,
  senderUserId,
  to,
  customerName,
  quoteNumber,
  quoteUrl,
  total,
  attachments = [],
}: QuoteEmailInput): Promise<EmailDeliveryResult> {
  const companyName = await getEmailCompanyName({
    supabase,
    organizationId,
  });
  const text = createQuoteEmailText({
    companyName,
    customerName,
    quoteNumber,
    quoteUrl,
    total,
  });
  const gmailDelivery = await sendGmailQuoteEmail({
    supabase,
    organizationId,
    userId: senderUserId,
    to,
    subject: `${companyName} quote ${quoteNumber}`,
    text,
    attachments,
  });

  if (gmailDelivery.status !== "skipped") {
    return gmailDelivery;
  }

  return {
    status: "skipped",
    provider: "none",
    messageId: null,
    reason: "Gmail is not connected for your user account.",
  };
}

function createQuoteEmailText({
  companyName,
  customerName,
  quoteNumber,
  quoteUrl,
  total,
}: Pick<
  QuoteEmailInput,
  "customerName" | "quoteNumber" | "quoteUrl" | "total"
> & {
  companyName: string;
}): string {
  return [
    `Hello ${customerName},`,
    "",
    `${companyName} has prepared quote ${quoteNumber} for your review.`,
    `Total: ${formatCurrency(total)}`,
    "",
    `View and respond to the quote here: ${quoteUrl}`,
    "",
    "Thank you,",
    companyName,
  ].join("\n");
}

async function getEmailCompanyName({
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
    .maybeSingle<EmailBrandingRecord>();

  return data?.company_name ?? "QuoteBase";
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(value);
}
