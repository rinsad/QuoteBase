import type { SupabaseClient } from "@supabase/supabase-js";

import type { AppUser } from "@/lib/auth/current-user";
import { getBaseUrl } from "@/lib/env";
import { getSlackIntegration } from "@/lib/integrations/slack";

type QuoteNotification = {
  id: string;
  quote_number: string;
  total: number;
  requested_by: string;
};

type QuoteStatusNotificationInput = {
  supabase: SupabaseClient;
  user: AppUser;
  quote: QuoteNotification;
  action: string;
  from: string;
  to: string;
  note?: string;
};

export type SlackNotificationResult = {
  warning: string | null;
};

type QuoteApprovalContext = {
  customerName: string;
  jobSite: string;
  materialSubtotal: number;
  truckingSubtotal: number;
  feesSubtotal: number;
  taxTotal: number;
  materials: QuoteApprovalMaterial[];
  plantSelectionReason: string | null;
  routeDistanceMiles: number | null;
};

type QuoteApprovalMaterial = {
  label: string;
  name: string;
  tier: string;
  supplierName: string;
  quantity: number;
  unit: string;
  unitCost: number;
  sellPrice: number;
  materialSubtotal: number;
  truckingSubtotal: number;
  feesSubtotal: number;
  lineTotal: number;
  loadCount: number;
  grossMarginPct: number | null;
};

type QuoteApprovalRecord = {
  customers: { name: string } | { name: string }[] | null;
  job_sites:
    | { name: string; city: string; state: string }
    | { name: string; city: string; state: string }[]
    | null;
  quote_items: QuoteApprovalItemRecord[] | null;
  material_subtotal: number;
  trucking_subtotal: number;
  fees_subtotal: number;
  tax_total: number;
};

type QuoteApprovalItemRecord = {
  quantity: number;
  unit: string;
  unit_cost: number;
  material_unit_price: number;
  material_subtotal: number;
  trucking_subtotal: number;
  fees_subtotal: number;
  line_total: number;
  load_count: number;
  supplier_plants: { name: string } | { name: string }[] | null;
  materials:
    | { name: string; tier: string }
    | { name: string; tier: string }[]
    | null;
};

type DraftAuditRecord = {
  metadata: Record<string, unknown> | null;
};

type EstimatorRecord = {
  full_name: string;
  email: string;
};

type SlackLookupResponse = {
  ok?: boolean;
  user?: {
    id?: string;
  };
};

type SlackConversationResponse = {
  ok?: boolean;
  channel?: {
    id?: string;
  };
};

const SLACK_TIMEOUT_MS = 5000;
const SLACK_API_BASE_URL = "https://slack.com/api";
const DM_STATUSES = new Set(["approved", "changes_requested", "rejected"]);

export async function notifySlackQuoteStatusChange({
  supabase,
  user,
  quote,
  action,
  from,
  to,
  note,
}: QuoteStatusNotificationInput): Promise<SlackNotificationResult> {
  try {
    return await notifySlackQuoteStatusChangeInternal({
      supabase,
      user,
      quote,
      action,
      from,
      to,
      note,
    });
  } catch (error) {
    console.error("Slack quote status notification failed.", error);

    return {
      warning:
        "Quote was updated, but Slack could not be notified. Check the Slack integration settings.",
    };
  }
}

async function notifySlackQuoteStatusChangeInternal({
  supabase,
  user,
  quote,
  action,
  from,
  to,
  note,
}: QuoteStatusNotificationInput): Promise<SlackNotificationResult> {
  const integration = await getSlackIntegration({
    supabase,
    organizationId: user.organization_id,
  });

  if (integration?.isEnabled && integration.credentialsInvalid) {
    return {
      warning:
        "Quote was updated, but saved Slack credentials cannot be read with the current encryption key. Re-enter the Slack webhook URL and signing secret in integration settings.",
    };
  }

  if (!integration?.isEnabled) {
    return { warning: null };
  }

  const { data: flag } = await supabase
    .from("feature_flags")
    .select("is_enabled")
    .eq("organization_id", user.organization_id)
    .eq("feature_name", "slack_notifications")
    .single<{ is_enabled: boolean }>();

  if (!flag?.is_enabled) {
    return { warning: null };
  }

  const approvalContext =
    to === "pending_approval"
      ? await getQuoteApprovalContext({
          supabase,
          organizationId: user.organization_id,
          quoteId: quote.id,
        })
      : null;
  if (integration.webhookUrl) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), SLACK_TIMEOUT_MS);

    try {
      await fetch(integration.webhookUrl, {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify(
          createQuotePayload({
            user,
            quote,
            action,
            from,
            to,
            note,
            approvalContext,
          }),
        ),
        signal: controller.signal,
      });
    } catch {
      // Keep the DM path available even if the channel webhook is unavailable.
    } finally {
      clearTimeout(timeout);
    }
  }

  if (integration.botToken && DM_STATUSES.has(to)) {
    await notifyEstimatorByDirectMessage({
      supabase,
      organizationId: user.organization_id,
      botToken: integration.botToken,
      quote,
      actorName: user.full_name,
      to,
      note,
    });
  }

  return { warning: null };
}

function createQuotePayload({
  user,
  quote,
  action,
  from,
  to,
  note,
  approvalContext,
}: Omit<QuoteStatusNotificationInput, "supabase"> & {
  approvalContext: QuoteApprovalContext | null;
}) {
  const quoteUrl = `${getBaseUrl()}/quotes/${quote.id}`;
  const total = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(Number(quote.total));
  const title = `Quote ${quote.quote_number} moved to ${formatStatus(to)}`;

  const actions =
    to === "pending_approval"
      ? [
          {
            type: "button",
            text: {
              type: "plain_text",
              text: "Accept",
            },
            style: "primary",
            action_id: "quote_approve",
            value: quote.id,
          },
          {
            type: "button",
            text: {
              type: "plain_text",
              text: "Reject",
            },
            style: "danger",
            action_id: "quote_reject",
            value: quote.id,
            confirm: {
              title: {
                type: "plain_text",
                text: "Reject quote?",
              },
              text: {
                type: "mrkdwn",
                text: "This will mark the quote rejected in QuoteBase.",
              },
              confirm: {
                type: "plain_text",
                text: "Reject",
              },
              deny: {
                type: "plain_text",
                text: "Cancel",
              },
            },
          },
          {
            type: "button",
            text: {
              type: "plain_text",
              text: "Suggest",
            },
            action_id: "quote_suggest",
            value: quote.id,
            confirm: {
              title: {
                type: "plain_text",
                text: "Request changes?",
              },
              text: {
                type: "mrkdwn",
                text: "This will mark the quote as changes requested in QuoteBase. Add detailed suggestions on the quote page if needed.",
              },
              confirm: {
                type: "plain_text",
                text: "Request changes",
              },
              deny: {
                type: "plain_text",
                text: "Cancel",
              },
            },
          },
          {
            type: "button",
            text: {
              type: "plain_text",
              text: "Full breakdown",
            },
            url: quoteUrl,
          },
        ]
      : [
          {
            type: "button",
            text: {
              type: "plain_text",
              text: "Open quote",
            },
            url: quoteUrl,
          },
        ];

  const approvalBlocks = approvalContext
    ? [
        {
          type: "section",
          fields: [
            {
              type: "mrkdwn",
              text: `*Customer:*\n${approvalContext.customerName}`,
            },
            {
              type: "mrkdwn",
              text: `*Job site:*\n${approvalContext.jobSite}`,
            },
            {
              type: "mrkdwn",
              text: `*Materials:*\n${approvalContext.materials.length}`,
            },
            {
              type: "mrkdwn",
              text: `*Material:*\n${formatCurrency(
                approvalContext.materialSubtotal,
              )}`,
            },
            {
              type: "mrkdwn",
              text: `*Trucking:*\n${formatCurrency(
                approvalContext.truckingSubtotal,
              )}`,
            },
            {
              type: "mrkdwn",
              text: `*Fees + tax:*\n${formatCurrency(
                approvalContext.feesSubtotal,
              )} fees / ${formatCurrency(approvalContext.taxTotal)} tax`,
            },
          ],
        },
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: buildMaterialSummary(approvalContext.materials, quoteUrl),
          },
        },
        {
          type: "context",
          elements: [
            {
              type: "mrkdwn",
              text: `*Plant logic:* ${
                approvalContext.plantSelectionReason ??
                "Selected from available supplier/material rules."
              }${
                approvalContext.routeDistanceMiles === null
                  ? ""
                  : ` Route: ${approvalContext.routeDistanceMiles.toFixed(
                      1,
                    )} mi.`
              }`,
            },
            {
              type: "mrkdwn",
              text: `<${quoteUrl}|Open full pricing breakdown in QuoteBase>`,
            },
          ],
        },
      ]
    : [];

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
      ...(note
        ? [
            {
              type: "section",
              text: {
                type: "mrkdwn",
                text: `*Reviewer comment:*\n${note}`,
              },
            },
          ]
        : []),
      ...approvalBlocks,
      {
        type: "actions",
        elements: actions,
      },
    ],
  };
}

async function getQuoteApprovalContext({
  supabase,
  organizationId,
  quoteId,
}: {
  supabase: SupabaseClient;
  organizationId: string;
  quoteId: string;
}): Promise<QuoteApprovalContext | null> {
  const [quoteResult, auditResult] = await Promise.all([
    supabase
      .from("quotes")
      .select(
        "material_subtotal, trucking_subtotal, fees_subtotal, tax_total, customers(name), job_sites(name, city, state), quote_items(quantity, unit, unit_cost, material_unit_price, material_subtotal, trucking_subtotal, fees_subtotal, line_total, load_count, supplier_plants(name), materials(name, tier))",
      )
      .eq("organization_id", organizationId)
      .eq("id", quoteId)
      .eq("is_active", true)
      .single<QuoteApprovalRecord>(),
    supabase
      .from("audit_log")
      .select("metadata")
      .eq("organization_id", organizationId)
      .eq("target_table", "quotes")
      .eq("target_id", quoteId)
      .eq("action", "quote.draft_created")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle<DraftAuditRecord>(),
  ]);

  const quote = quoteResult.data;
  const customer = quote ? relationOne(quote.customers) : null;
  const site = quote ? relationOne(quote.job_sites) : null;

  if (!quote || !customer || !site || !quote.quote_items?.length) {
    return null;
  }

  const materials = quote.quote_items
    .map((item, index): QuoteApprovalMaterial | null => {
      const supplier = relationOne(item.supplier_plants);
      const material = relationOne(item.materials);

      if (!supplier || !material) {
        return null;
      }

      const quantity = Number(item.quantity);
      const unitCost = Number(item.unit_cost);
      const materialSubtotal = Number(item.material_subtotal);
      const buyCost = unitCost * quantity;
      const grossMarginPct =
        materialSubtotal > 0
          ? ((materialSubtotal - buyCost) / materialSubtotal) * 100
          : null;

      return {
        label: `M${index + 1}`,
        name: material.name,
        tier: material.tier,
        supplierName: supplier.name,
        quantity,
        unit: item.unit,
        unitCost,
        sellPrice: Number(item.material_unit_price),
        materialSubtotal,
        truckingSubtotal: Number(item.trucking_subtotal),
        feesSubtotal: Number(item.fees_subtotal),
        lineTotal: Number(item.line_total),
        loadCount: Number(item.load_count),
        grossMarginPct,
      };
    })
    .filter((item): item is QuoteApprovalMaterial => item !== null);

  if (materials.length === 0) {
    return null;
  }

  const metadata = auditResult.data?.metadata ?? null;

  return {
    customerName: customer.name,
    jobSite: `${site.name} - ${site.city}, ${site.state}`,
    materialSubtotal: Number(quote.material_subtotal),
    truckingSubtotal: Number(quote.trucking_subtotal),
    feesSubtotal: Number(quote.fees_subtotal),
    taxTotal: Number(quote.tax_total),
    materials,
    plantSelectionReason: stringMetadata(metadata, "plant_selection_reason"),
    routeDistanceMiles: numberMetadata(metadata, "route_distance_miles"),
  };
}

async function notifyEstimatorByDirectMessage({
  supabase,
  organizationId,
  botToken,
  quote,
  actorName,
  to,
  note,
}: {
  supabase: SupabaseClient;
  organizationId: string;
  botToken: string;
  quote: QuoteNotification;
  actorName: string;
  to: string;
  note?: string;
}): Promise<void> {
  const { data: estimator } = await supabase
    .from("users")
    .select("full_name, email")
    .eq("organization_id", organizationId)
    .eq("id", quote.requested_by)
    .eq("is_active", true)
    .maybeSingle<EstimatorRecord>();

  if (!estimator?.email) {
    return;
  }

  const slackUserId = await lookupSlackUserIdByEmail({
    botToken,
    email: estimator.email,
  });

  if (!slackUserId) {
    return;
  }

  const channelId = await openSlackDirectMessage({
    botToken,
    slackUserId,
  });

  if (!channelId) {
    return;
  }

  await postSlackDirectMessage({
    botToken,
    channelId,
    text: createDirectMessageText({
      quote,
      estimatorName: estimator.full_name,
      actorName,
      to,
      note,
    }),
  });
}

async function lookupSlackUserIdByEmail({
  botToken,
  email,
}: {
  botToken: string;
  email: string;
}): Promise<string | null> {
  const url = new URL(`${SLACK_API_BASE_URL}/users.lookupByEmail`);
  url.searchParams.set("email", email);

  const response = await slackApiFetch<SlackLookupResponse>({
    botToken,
    url: url.toString(),
  });

  return response?.ok && response.user?.id ? response.user.id : null;
}

async function openSlackDirectMessage({
  botToken,
  slackUserId,
}: {
  botToken: string;
  slackUserId: string;
}): Promise<string | null> {
  const response = await slackApiFetch<SlackConversationResponse>({
    botToken,
    url: `${SLACK_API_BASE_URL}/conversations.open`,
    init: {
      method: "POST",
      body: JSON.stringify({ users: slackUserId }),
    },
  });

  return response?.ok && response.channel?.id ? response.channel.id : null;
}

async function postSlackDirectMessage({
  botToken,
  channelId,
  text,
}: {
  botToken: string;
  channelId: string;
  text: string;
}): Promise<void> {
  await slackApiFetch({
    botToken,
    url: `${SLACK_API_BASE_URL}/chat.postMessage`,
    init: {
      method: "POST",
      body: JSON.stringify({
        channel: channelId,
        text,
      }),
    },
  });
}

async function slackApiFetch<T = Record<string, unknown>>({
  botToken,
  url,
  init,
}: {
  botToken: string;
  url: string;
  init?: RequestInit;
}): Promise<T | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), SLACK_TIMEOUT_MS);
  const headers = new Headers(init?.headers);
  headers.set("authorization", `Bearer ${botToken}`);
  headers.set("content-type", "application/json");

  try {
    const response = await fetch(url, {
      method: "GET",
      ...init,
      headers,
      signal: controller.signal,
    });

    if (!response.ok) {
      return null;
    }

    return (await response.json()) as T;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

function createDirectMessageText({
  quote,
  estimatorName,
  actorName,
  to,
  note,
}: {
  quote: QuoteNotification;
  estimatorName: string;
  actorName: string;
  to: string;
  note?: string;
}): string {
  const quoteUrl = `${getBaseUrl()}/quotes/${quote.id}`;
  const status = formatStatus(to);
  const comment = note ? `\nComment: ${note}` : "";

  return `Hi ${estimatorName}, quote ${quote.quote_number} was marked ${status} by ${actorName}.${comment}\nOpen quote: ${quoteUrl}`;
}

function relationOne<T>(value: T | T[] | null): T | null {
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

function stringMetadata(
  metadata: Record<string, unknown> | null,
  key: string,
): string | null {
  const value = metadata?.[key];

  return typeof value === "string" && value.trim() ? value : null;
}

function numberMetadata(
  metadata: Record<string, unknown> | null,
  key: string,
): number | null {
  const value = metadata?.[key];

  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function buildMaterialSummary(
  materials: QuoteApprovalMaterial[],
  quoteUrl: string,
): string {
  const visibleMaterials = materials.slice(0, 8);
  const lines = visibleMaterials.map((material) => {
    const margin =
      material.grossMarginPct === null
        ? "margin pending"
        : `${material.grossMarginPct.toFixed(1)}% margin`;
    const loads = `${formatQuantity(material.loadCount)} load${
      material.loadCount === 1 ? "" : "s"
    }`;

    return [
      `*${material.label}: ${material.name} (${material.tier})*`,
      `${formatQuantity(material.quantity)} ${material.unit} | ${
        material.supplierName
      } | ${loads}`,
      `Cost ${formatCurrency(material.unitCost)}/${material.unit} | Sell ${formatCurrency(
        material.sellPrice,
      )}/${material.unit} | ${margin}`,
      `Material ${formatCurrency(
        material.materialSubtotal,
      )} | Trucking ${formatCurrency(
        material.truckingSubtotal,
      )} | Fees ${formatCurrency(material.feesSubtotal)} | Line ${formatCurrency(
        material.lineTotal,
      )}`,
    ].join("\n");
  });

  if (materials.length > visibleMaterials.length) {
    lines.push(
      `_${materials.length - visibleMaterials.length} more material${
        materials.length - visibleMaterials.length === 1 ? "" : "s"
      } hidden. <${quoteUrl}|Open QuoteBase> for the full breakdown._`,
    );
  }

  return `*Material breakdown:*\n${lines.join("\n\n")}`;
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(value);
}

function formatQuantity(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(2);
}

function formatStatus(status: string): string {
  return status
    .split("_")
    .map((part) => part[0]?.toUpperCase() + part.slice(1))
    .join(" ");
}
