import type { SupabaseClient } from "@supabase/supabase-js";

import type { AppUser } from "@/lib/auth/current-user";
import { getBaseUrl } from "@/lib/env";

type QuoteNotification = {
  id: string;
  quote_number: string;
  total: number;
};

type QuoteStatusNotificationInput = {
  supabase: SupabaseClient;
  user: AppUser;
  quote: QuoteNotification;
  action: string;
  from: string;
  to: string;
};

const SLACK_TIMEOUT_MS = 5000;

export async function notifySlackQuoteStatusChange({
  supabase,
  user,
  quote,
  action,
  from,
  to,
}: QuoteStatusNotificationInput): Promise<void> {
  const webhookUrl = process.env.SLACK_WEBHOOK_URL;

  if (!webhookUrl) {
    return;
  }

  const { data: flag } = await supabase
    .from("feature_flags")
    .select("is_enabled")
    .eq("organization_id", user.organization_id)
    .eq("feature_name", "slack_notifications")
    .single<{ is_enabled: boolean }>();

  if (!flag?.is_enabled) {
    return;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), SLACK_TIMEOUT_MS);

  try {
    await fetch(webhookUrl, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify(createQuotePayload({ user, quote, action, from, to })),
      signal: controller.signal,
    });
  } catch {
    return;
  } finally {
    clearTimeout(timeout);
  }
}

function createQuotePayload({
  user,
  quote,
  action,
  from,
  to,
}: Omit<QuoteStatusNotificationInput, "supabase">) {
  const quoteUrl = `${getBaseUrl()}/quotes/${quote.id}`;
  const total = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(Number(quote.total));
  const title = `Quote ${quote.quote_number} moved to ${formatStatus(to)}`;

  return {
    text: `${title} by ${user.full_name}`,
    blocks: [
      {
        type: "header",
        text: {
          type: "plain_text",
          text: title,
        },
      },
      {
        type: "section",
        fields: [
          {
            type: "mrkdwn",
            text: `*From:*\n${formatStatus(from)}`,
          },
          {
            type: "mrkdwn",
            text: `*Total:*\n${total}`,
          },
          {
            type: "mrkdwn",
            text: `*Actor:*\n${user.full_name}`,
          },
          {
            type: "mrkdwn",
            text: `*Action:*\n${action}`,
          },
        ],
      },
      {
        type: "actions",
        elements: [
          {
            type: "button",
            text: {
              type: "plain_text",
              text: "Open quote",
            },
            url: quoteUrl,
          },
        ],
      },
    ],
  };
}

function formatStatus(status: string): string {
  return status
    .split("_")
    .map((part) => part[0]?.toUpperCase() + part.slice(1))
    .join(" ");
}
