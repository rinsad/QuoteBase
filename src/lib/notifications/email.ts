export type EmailDeliveryResult = {
  status: "sent" | "skipped" | "failed";
  provider: "resend" | "none";
  messageId: string | null;
  reason: string | null;
};

type QuoteEmailInput = {
  to: string;
  customerName: string;
  quoteNumber: string;
  quoteUrl: string;
  total: number;
};

export async function sendQuoteEmail({
  to,
  customerName,
  quoteNumber,
  quoteUrl,
  total,
}: QuoteEmailInput): Promise<EmailDeliveryResult> {
  const resendApiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;

  if (!resendApiKey || !from) {
    return {
      status: "skipped",
      provider: "none",
      messageId: null,
      reason: "Email provider is not configured.",
    };
  }

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        authorization: `Bearer ${resendApiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        from,
        to,
        subject: `Western Materials quote ${quoteNumber}`,
        text: createQuoteEmailText({
          customerName,
          quoteNumber,
          quoteUrl,
          total,
        }),
      }),
      cache: "no-store",
    });

    if (!response.ok) {
      return {
        status: "failed",
        provider: "resend",
        messageId: null,
        reason: `Resend returned HTTP ${response.status}.`,
      };
    }

    const payload = (await response.json()) as unknown;
    const messageId =
      isRecord(payload) && typeof payload.id === "string" ? payload.id : null;

    return {
      status: "sent",
      provider: "resend",
      messageId,
      reason: null,
    };
  } catch {
    return {
      status: "failed",
      provider: "resend",
      messageId: null,
      reason: "Email provider request failed.",
    };
  }
}

function createQuoteEmailText({
  customerName,
  quoteNumber,
  quoteUrl,
  total,
}: Omit<QuoteEmailInput, "to">): string {
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
