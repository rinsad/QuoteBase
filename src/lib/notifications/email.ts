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
  to: string;
  customerName: string;
  quoteNumber: string;
  quoteUrl: string;
  total: number;
  attachments?: EmailAttachment[];
};

export async function sendQuoteEmail({
  supabase,
  organizationId,
  to,
  customerName,
  quoteNumber,
  quoteUrl,
  total,
  attachments = [],
}: QuoteEmailInput): Promise<EmailDeliveryResult> {
  const text = createQuoteEmailText({
    customerName,
    quoteNumber,
    quoteUrl,
    total,
  });
  const gmailDelivery = await sendGmailQuoteEmail({
    supabase,
    organizationId,
    to,
    subject: `Western Materials quote ${quoteNumber}`,
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
    reason: "Gmail is not connected for this organization.",
  };
}

function createQuoteEmailText({
  customerName,
  quoteNumber,
  quoteUrl,
  total,
}: Pick<
  QuoteEmailInput,
  "customerName" | "quoteNumber" | "quoteUrl" | "total"
>): string {
  return [
    `Hello ${customerName},`,
    "",
    `Western Materials has prepared quote ${quoteNumber} for your review.`,
    `Total: ${formatCurrency(total)}`,
    "",
    `View and respond to the quote here: ${quoteUrl}`,
    "",
    "Thank you,",
    "Western Materials",
  ].join("\n");
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(value);
}
