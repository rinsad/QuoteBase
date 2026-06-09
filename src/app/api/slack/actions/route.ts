import { NextResponse } from "next/server";
import { z } from "zod";

import type { AppUser } from "@/lib/auth/current-user";
import { isFeatureEnabled } from "@/lib/features/flags";
import {
  getSlackIntegration,
  verifySlackSignature,
} from "@/lib/integrations/slack";
import type { QuoteStatus } from "@/lib/quotes/quotes";
import { transitionQuoteStatus } from "@/lib/quotes/workflow";
import { createAdminClient } from "@/lib/supabase/admin";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const slackActionSchema = z.object({
  action_id: z.enum(["quote_approve", "quote_reject"]),
  value: z.string().regex(UUID_PATTERN),
});

const slackPayloadSchema = z.object({
  type: z.literal("block_actions"),
  user: z.object({
    id: z.string().min(1),
    username: z.string().optional(),
    name: z.string().optional(),
  }),
  actions: z.array(slackActionSchema).min(1),
});

type AppUserRecord = Omit<AppUser, "organization"> & {
  organizations: AppUser["organization"] | AppUser["organization"][];
};

export async function POST(request: Request) {
  const rawBody = await request.text();
  const params = new URLSearchParams(rawBody);
  const payloadValue = params.get("payload");

  if (!payloadValue) {
    return slackMessage("Slack payload is missing.", 400);
  }

  let rawPayload: unknown;

  try {
    rawPayload = JSON.parse(payloadValue);
  } catch {
    return slackMessage("Slack payload JSON is invalid.", 400);
  }

  const parsedPayload = slackPayloadSchema.safeParse(rawPayload);

  if (!parsedPayload.success) {
    return slackMessage("Slack payload is invalid.", 400);
  }

  const action = parsedPayload.data.actions[0];
  const supabase = createAdminClient();

  if (!supabase) {
    return slackMessage("QuoteBase Supabase service role is not configured.", 503);
  }

  const quoteOrg = await getQuoteOrganization(action.value);

  if (!quoteOrg) {
    return slackMessage("Quote not found.", 404);
  }

  const slackFeatureEnabled = await isFeatureEnabled({
    supabase,
    organizationId: quoteOrg.organization_id,
    featureName: "slack_notifications",
  });

  if (!slackFeatureEnabled) {
    return slackMessage("Slack notifications are disabled for this organization.", 403);
  }

  const integration = await getSlackIntegration({
    supabase,
    organizationId: quoteOrg.organization_id,
  });

  if (!integration?.isEnabled || !integration.signingSecret) {
    return slackMessage(
      "Slack is not configured for this QuoteBase organization.",
      503,
    );
  }

  const verification = verifySlackSignature({
    rawBody,
    timestamp: request.headers.get("x-slack-request-timestamp"),
    signature: request.headers.get("x-slack-signature"),
    signingSecret: integration.signingSecret,
  });

  if (!verification.ok) {
    return slackMessage(verification.message, verification.status);
  }

  const actor = await getSlackApprover({
    organizationId: quoteOrg.organization_id,
    approverEmail: integration.approverEmail,
  });

  if (!actor) {
    return slackMessage(
      "QuoteBase Slack admin approver is not configured for this organization.",
      503,
    );
  }

  const transition =
    action.action_id === "quote_approve"
      ? {
          from: "pending_approval" as const,
          to: "approved" as const,
          action: "quote.approved_from_slack",
          note: `Approved from Slack by ${slackUserName(parsedPayload.data.user)}.`,
        }
      : {
          from: "pending_approval" as const,
          to: "rejected" as const,
          action: "quote.rejected_from_slack",
          note: `Rejected from Slack by ${slackUserName(parsedPayload.data.user)}.`,
        };

  const existingStatus = await getQuoteStatus({
    quoteId: action.value,
    organizationId: actor.organization_id,
  });

  if (existingStatus === transition.to) {
    return slackMessage(
      `Quote is already ${formatStatus(transition.to)} in QuoteBase.`,
    );
  }

  try {
    const result = await transitionQuoteStatus({
      supabase,
      user: actor,
      quoteId: action.value,
      from: transition.from,
      to: transition.to,
      action: transition.action,
      allowedRoles: ["admin"],
      note: transition.note,
    });

    return slackMessage(
      `Quote ${result.quote_number} is now ${formatStatus(result.to)}.`,
    );
  } catch (error) {
    return slackMessage(
      error instanceof Error
        ? error.message
        : "QuoteBase could not update this quote.",
      200,
    );
  }
}

async function getSlackApprover({
  organizationId,
  approverEmail,
}: {
  organizationId: string;
  approverEmail: string | null;
}): Promise<AppUser | null> {
  const supabase = createAdminClient();

  if (!approverEmail || !supabase) {
    return null;
  }

  const { data } = await supabase
    .from("users")
    .select(
      "id, organization_id, email, full_name, role, organizations(id, name, slug)",
    )
    .eq("email", approverEmail)
    .eq("organization_id", organizationId)
    .eq("is_active", true)
    .eq("role", "admin")
    .limit(1)
    .single<AppUserRecord>();

  if (!data) {
    return null;
  }

  const organization = Array.isArray(data.organizations)
    ? (data.organizations[0] ?? null)
    : data.organizations;

  return {
    id: data.id,
    organization_id: data.organization_id,
    email: data.email,
    full_name: data.full_name,
    role: data.role,
    organization,
  };
}

async function getQuoteOrganization(
  quoteId: string,
): Promise<{ organization_id: string } | null> {
  const supabase = createAdminClient();

  if (!supabase) {
    return null;
  }

  const { data } = await supabase
    .from("quotes")
    .select("organization_id")
    .eq("id", quoteId)
    .eq("is_active", true)
    .single<{ organization_id: string }>();

  return data ?? null;
}

async function getQuoteStatus({
  quoteId,
  organizationId,
}: {
  quoteId: string;
  organizationId: string;
}): Promise<QuoteStatus | null> {
  const supabase = createAdminClient();

  if (!supabase) {
    return null;
  }

  const { data } = await supabase
    .from("quotes")
    .select("status")
    .eq("organization_id", organizationId)
    .eq("id", quoteId)
    .eq("is_active", true)
    .single<{ status: QuoteStatus }>();

  return data?.status ?? null;
}

function slackMessage(text: string, status = 200) {
  return NextResponse.json(
    {
      response_type: "ephemeral",
      text,
    },
    { status },
  );
}

function slackUserName(user: z.infer<typeof slackPayloadSchema>["user"]) {
  return user.username ?? user.name ?? user.id;
}

function formatStatus(status: string): string {
  return status
    .split("_")
    .map((part) => part[0]?.toUpperCase() + part.slice(1))
    .join(" ");
}
