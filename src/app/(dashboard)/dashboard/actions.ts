"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { logAction } from "@/lib/audit/log-action";
import { getCurrentUser } from "@/lib/auth/current-user";
import {
  createOpenAITextResponse,
  getOpenAIIntegration,
} from "@/lib/integrations/openai";
import {
  listFollowUpDrafts,
} from "@/lib/quotes/follow-up-agent";
import {
  getQuoteList,
  type QuoteListItem,
} from "@/lib/quotes/quotes";
import { getHermesOnboardingSummary } from "@/lib/system/hermes";
import { createClient } from "@/lib/supabase/server";
import { executeQuoteBaseTool } from "@/lib/system/tool-layer";

export type AssistantMessage = {
  role: "user" | "assistant";
  content: string;
};

export type AssistantProposedAction =
  | {
      type: "move_quote_status";
      label: string;
      payload: {
        quoteId: string;
        quoteNumber: string;
        toStatus: "draft" | "sent" | "follow_up" | "won" | "lost";
      };
    }
  | {
      type: "run_follow_up_agent";
      label: string;
      payload: Record<string, never>;
    }
  | {
      type: "approve_follow_up_draft" | "cancel_follow_up_draft";
      label: string;
      payload: {
        draftId: string;
        quoteNumber: string;
      };
    };

export type AssistantReply = {
  ok: true;
  message: string;
  suggestions: string[];
  proposedAction: AssistantProposedAction | null;
} | {
  ok: false;
  message: string;
};

export type AssistantConfirmResult = {
  ok: boolean;
  message: string;
};

export type HermesActionResult =
  | { ok: true }
  | { ok: false; message: string };

const MAX_ASSISTANT_REQUEST_MESSAGES = 40;
const MAX_ASSISTANT_CONTEXT_MESSAGES = 12;
const FOLLOW_UP_ELIGIBLE_STATUSES = ["sent", "viewed", "follow_up"] as const;

const assistantMessageSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string().trim().min(1).max(4000),
});

const askAssistantSchema = z.object({
  messages: z
    .array(assistantMessageSchema)
    .min(1)
    .max(MAX_ASSISTANT_REQUEST_MESSAGES),
});

const pipelineStatusSchema = z.enum(["draft", "sent", "follow_up", "won", "lost"]);

const proposedActionSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("move_quote_status"),
    label: z.string().trim().min(1).max(140),
    payload: z.object({
      quoteId: z.string().uuid(),
      quoteNumber: z.string().trim().min(1).max(60),
      toStatus: pipelineStatusSchema,
    }),
  }),
  z.object({
    type: z.literal("run_follow_up_agent"),
    label: z.string().trim().min(1).max(140),
    payload: z.record(z.string(), z.never()).default({}),
  }),
  z.object({
    type: z.enum(["approve_follow_up_draft", "cancel_follow_up_draft"]),
    label: z.string().trim().min(1).max(140),
    payload: z.object({
      draftId: z.string().uuid(),
      quoteNumber: z.string().trim().min(1).max(60),
    }),
  }),
]);

const assistantModelSchema = z.object({
  message: z.string().trim().min(1).max(2000),
  suggestions: z.array(z.string().trim().min(1).max(80)).max(3).default([]),
  proposedAction: proposedActionSchema.nullable().default(null),
});

const confirmAssistantActionSchema = z.object({
  action: proposedActionSchema,
});

export async function askQuoteBaseAssistant(
  input: unknown,
): Promise<AssistantReply> {
  const parsed = askAssistantSchema.safeParse(input);

  if (!parsed.success) {
    return { ok: false, message: "Ask QuoteBase needs a valid message." };
  }

  const user = await getCurrentUser();

  if (!user) {
    return { ok: false, message: "Please sign in to use the assistant." };
  }

  const supabase = await createClient();

  if (!supabase) {
    return { ok: false, message: "Supabase is not configured." };
  }

  const [quoteList, followUpDrafts, integration] = await Promise.all([
    getQuoteList(user),
    listFollowUpDrafts({ organizationId: user.organization_id }),
    getOpenAIIntegration({ supabase, organizationId: user.organization_id }),
  ]);
  const apiKey =
    integration?.isEnabled && integration.apiKey ? integration.apiKey : null;

  if (!apiKey) {
    return {
      ok: false,
      message:
        "Ask QuoteBase is not connected yet. Tenant admins can add an OpenAI API key under Admin > Integrations > OpenAI.",
    };
  }

  try {
    const raw = await createOpenAITextResponse({
      apiKey,
      model: integration?.model ?? "gpt-5.4-mini",
      input: buildAssistantPrompt({
        messages: parsed.data.messages.slice(-MAX_ASSISTANT_CONTEXT_MESSAGES),
        quotes: quoteList.quotes,
        moneyKpis: quoteList.moneyKpis,
        hotQuotes: quoteList.hotQuotes,
        bigQuotes: quoteList.bigQuotes,
        jobsStartingSoon: quoteList.jobsStartingSoon,
        followUpDrafts,
      }),
    });
    const normalized = parseAssistantModelReply(raw);

    return {
      ok: true,
      message: normalized.message,
      suggestions: normalized.suggestions,
      proposedAction: normalized.proposedAction,
    };
  } catch (error) {
    console.error("Ask QuoteBase failed.", error);

    return {
      ok: false,
      message: "Ask QuoteBase could not reach the OpenAI API right now.",
    };
  }
}

export async function confirmAssistantAction(
  input: unknown,
): Promise<AssistantConfirmResult> {
  const parsed = confirmAssistantActionSchema.safeParse(input);

  if (!parsed.success) {
    return { ok: false, message: "Invalid assistant action." };
  }

  const user = await getCurrentUser();

  if (!user) {
    return { ok: false, message: "Authentication is required." };
  }

  if (user.role !== "admin" && user.role !== "account_manager") {
    return { ok: false, message: "Only admins and account managers can confirm assistant actions." };
  }

  const action = parsed.data.action;

  if (action.type === "move_quote_status") {
    return executeQuoteBaseTool({
      user,
      caller: "assistant",
      confirmed: true,
      input: {
        toolId: "quote.pipeline.move",
        payload: {
          quoteId: action.payload.quoteId,
          toStatus: action.payload.toStatus,
        },
      },
    });
  }

  if (action.type === "run_follow_up_agent") {
    return executeQuoteBaseTool({
      user,
      caller: "assistant",
      confirmed: true,
      input: {
        toolId: "follow_up.scheduler.run",
        payload: {},
      },
    });
  }

  return executeQuoteBaseTool({
    user,
    caller: "assistant",
    confirmed: true,
    input: {
      toolId:
        action.type === "approve_follow_up_draft"
          ? "follow_up.draft.approve"
          : "follow_up.draft.cancel",
      payload: {
        draftId: action.payload.draftId,
      },
    },
  });
}

export async function updateHermesOnboardingDismissed(
  dismissed: boolean,
): Promise<HermesActionResult> {
  const user = await getCurrentUser();

  if (!user) {
    return { ok: false, message: "Authentication is required." };
  }

  if (user.role !== "admin" && user.role !== "account_manager") {
    return {
      ok: false,
      message: "Only admins and account managers can update onboarding.",
    };
  }

  const supabase = await createClient();

  if (!supabase) {
    return { ok: false, message: "Supabase is not configured." };
  }

  const { data: before } = await supabase
    .from("organization_onboarding")
    .select("id, is_dismissed, dismissed_at, completed_at, current_step, metadata")
    .eq("organization_id", user.organization_id)
    .maybeSingle<{
      id: string;
      is_dismissed: boolean;
      dismissed_at: string | null;
      completed_at: string | null;
      current_step: string;
      metadata: Record<string, unknown>;
    }>();
  const now = new Date().toISOString();
  const { data: after, error } = await supabase
    .from("organization_onboarding")
    .upsert(
      {
        organization_id: user.organization_id,
        is_dismissed: dismissed,
        dismissed_at: dismissed ? now : null,
        current_step: "import",
        metadata: {
          ...(before?.metadata ?? {}),
          last_action: dismissed ? "dismissed" : "restarted",
        },
        updated_by: user.id,
      },
      { onConflict: "organization_id" },
    )
    .select("id, is_dismissed, dismissed_at, completed_at, current_step, metadata")
    .single<Record<string, unknown>>();

  if (error || !after) {
    return { ok: false, message: "Could not update Hermes onboarding." };
  }

  await logAction({
    user,
    action: dismissed ? "hermes.onboarding.dismissed" : "hermes.onboarding.restarted",
    targetTable: "organization_onboarding",
    targetId: typeof after.id === "string" ? after.id : undefined,
    before,
    after,
    supabase,
  });

  revalidatePath("/dashboard");

  return { ok: true };
}

export async function finishHermesOnboarding(): Promise<HermesActionResult> {
  const user = await getCurrentUser();

  if (!user) {
    return { ok: false, message: "Authentication is required." };
  }

  if (user.role !== "admin" && user.role !== "account_manager") {
    return {
      ok: false,
      message: "Only admins and account managers can finish onboarding.",
    };
  }

  const supabase = await createClient();

  if (!supabase) {
    return { ok: false, message: "Supabase is not configured." };
  }

  const summary = await getHermesOnboardingSummary(user);

  if (summary.progress < 100) {
    return {
      ok: false,
      message: "Hermes onboarding still has setup steps remaining.",
    };
  }

  const { data: before } = await supabase
    .from("organization_onboarding")
    .select("id, is_dismissed, dismissed_at, completed_at, current_step, metadata")
    .eq("organization_id", user.organization_id)
    .maybeSingle<{
      id: string;
      is_dismissed: boolean;
      dismissed_at: string | null;
      completed_at: string | null;
      current_step: string;
      metadata: Record<string, unknown>;
    }>();
  const now = new Date().toISOString();
  const { data: after, error } = await supabase
    .from("organization_onboarding")
    .upsert(
      {
        organization_id: user.organization_id,
        is_dismissed: true,
        dismissed_at: now,
        completed_at: before?.completed_at ?? now,
        current_step: "first_quote",
        metadata: {
          ...(before?.metadata ?? {}),
          last_action: "completed",
          progress: summary.progress,
        },
        updated_by: user.id,
      },
      { onConflict: "organization_id" },
    )
    .select("id, is_dismissed, dismissed_at, completed_at, current_step, metadata")
    .single<Record<string, unknown>>();

  if (error || !after) {
    return { ok: false, message: "Could not finish Hermes onboarding." };
  }

  await logAction({
    user,
    action: "hermes.onboarding.completed",
    targetTable: "organization_onboarding",
    targetId: typeof after.id === "string" ? after.id : undefined,
    before,
    after,
    supabase,
  });

  revalidatePath("/dashboard");

  return { ok: true };
}

function buildAssistantPrompt({
  messages,
  quotes,
  moneyKpis,
  hotQuotes,
  bigQuotes,
  jobsStartingSoon,
  followUpDrafts,
}: {
  messages: AssistantMessage[];
  quotes: QuoteListItem[];
  moneyKpis: Awaited<ReturnType<typeof getQuoteList>>["moneyKpis"];
  hotQuotes: Awaited<ReturnType<typeof getQuoteList>>["hotQuotes"];
  bigQuotes: Awaited<ReturnType<typeof getQuoteList>>["bigQuotes"];
  jobsStartingSoon: Awaited<ReturnType<typeof getQuoteList>>["jobsStartingSoon"];
  followUpDrafts: Awaited<ReturnType<typeof listFollowUpDrafts>>;
}): string {
  const context = {
    kpis: moneyKpis,
    quotes: quotes.slice(0, 30).map(compactQuote),
    hotQuotes: hotQuotes.slice(0, 5).map(compactQuote),
    bigQuotes: bigQuotes.slice(0, 5).map(compactQuote),
    jobsStartingSoon: jobsStartingSoon.slice(0, 5).map(compactQuote),
    followUpScheduler: buildFollowUpSchedulerContext(quotes),
    followUpDrafts: followUpDrafts.slice(0, 10).map((draft) => ({
      id: draft.id,
      quoteId: draft.quote_id,
      quoteNumber: relationOne(draft.quotes)?.quote_number ?? "Unknown",
      subject: draft.subject,
      status: draft.status,
      tone: draft.tone,
      stageDay: draft.stage_day,
      bigQuoteEscalation: draft.big_quote_escalation,
    })),
  };

  return [
    "You are Ask QuoteBase, a concise operations assistant inside a quote management SaaS.",
    "Use the provided tenant-scoped context only. Read questions are allowed freely.",
    "For writes, do not claim you changed anything. Return one proposedAction that the UI can confirm.",
    "Supported proposedAction types: move_quote_status, run_follow_up_agent, approve_follow_up_draft, cancel_follow_up_draft.",
    "A run_follow_up_agent proposedAction must be {\"type\":\"run_follow_up_agent\",\"label\":\"Run the follow-up agent\",\"payload\":{}}.",
    "Follow-up scheduler rule: it only scans quotes whose status is sent, viewed, or follow_up, whose followupDate is not null, whose followupDate is on or before currentDate, and whose followupAttemptCount is below followupMaxAttempts.",
    "When explaining follow-ups, use each quote's actual followupDate/followUpDue/followUpEligibilityReason from Context JSON. Never say no follow-up dates are set if any relevant quote has a non-null followupDate.",
    "If a quote has status draft, approved, pending_approval, changes_requested, rejected, won, lost, accepted, declined, or expired, say it is not eligible for the follow-up agent yet instead of saying the date is missing.",
    "Setting arbitrary follow-up dates is not a supported assistant write action yet. If asked to set dates, explain that the current assistant can run the scheduler but cannot set followupDate.",
    "If the user asks for an unsupported write or the quote/draft is ambiguous, ask one short clarifying question and return proposedAction null.",
    "Return strict JSON only: {\"message\":\"...\",\"suggestions\":[\"...\"],\"proposedAction\":null|{...}}.",
    "",
    `Context JSON: ${JSON.stringify(context)}`,
    `Conversation JSON: ${JSON.stringify(messages)}`,
  ].join("\n");
}

function parseAssistantModelReply(raw: string): z.infer<typeof assistantModelSchema> {
  const trimmed = raw.trim();
  const jsonText = trimmed.startsWith("```")
    ? trimmed.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "")
    : trimmed;

  try {
    const parsedJson = JSON.parse(jsonText) as unknown;
    const normalizedJson = normalizeAssistantJson(parsedJson);
    const parsed = assistantModelSchema.safeParse(normalizedJson);

    if (parsed.success) {
      return parsed.data;
    }

    const salvaged = salvageAssistantJson(normalizedJson);

    if (salvaged) {
      return salvaged;
    }
  } catch {
    // Fall through to plain-text fallback.
  }

  return {
    message: trimmed || "I could not format that answer.",
    suggestions: ["Show hot quotes", "Run follow-up agent", "List big quotes"],
    proposedAction: null,
  };
}

function normalizeAssistantJson(value: unknown): unknown {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return value;
  }

  const record = value as Record<string, unknown>;
  const proposedAction = record.proposedAction;

  if (
    !proposedAction ||
    typeof proposedAction !== "object" ||
    Array.isArray(proposedAction)
  ) {
    return record;
  }

  const action = proposedAction as Record<string, unknown>;

  if (action.type === "run_follow_up_agent") {
    return {
      ...record,
      proposedAction: {
        type: "run_follow_up_agent",
        label:
          typeof action.label === "string" && action.label.trim()
            ? action.label
            : "Run the follow-up agent",
        payload: {},
      },
    };
  }

  return record;
}

function salvageAssistantJson(
  value: unknown,
): z.infer<typeof assistantModelSchema> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const record = value as Record<string, unknown>;
  const message =
    typeof record.message === "string" && record.message.trim()
      ? record.message.trim().slice(0, 2000)
      : null;

  if (!message) {
    return null;
  }

  const suggestions = Array.isArray(record.suggestions)
    ? record.suggestions
        .filter((suggestion): suggestion is string => typeof suggestion === "string")
        .map((suggestion) => suggestion.trim())
        .filter(Boolean)
        .map((suggestion) => suggestion.slice(0, 80))
        .slice(0, 3)
    : [];

  return {
    message,
    suggestions,
    proposedAction: coerceAssistantProposedAction(record.proposedAction),
  };
}

function coerceAssistantProposedAction(
  value: unknown,
): AssistantProposedAction | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const action = value as Record<string, unknown>;

  if (action.type === "run_follow_up_agent") {
    return {
      type: "run_follow_up_agent",
      label:
        typeof action.label === "string" && action.label.trim()
          ? action.label.trim().slice(0, 140)
          : "Run the follow-up agent",
      payload: {},
    };
  }

  const parsed = proposedActionSchema.safeParse(action);

  return parsed.success ? parsed.data : null;
}

function compactQuote(quote: QuoteListItem): Record<string, unknown> {
  const followUpEligibility = describeFollowUpEligibility(quote);

  return {
    id: quote.id,
    quoteNumber: quote.quote_number,
    status: quote.status,
    total: quote.total,
    jobStartDate: quote.job_start_date,
    jobEndDate: quote.job_end_date,
    followupDate: quote.followup_date,
    followupAttemptCount: quote.followup_attempt_count,
    followupMaxAttempts: quote.followup_max_attempts,
    followUpEligible: followUpEligibility.eligible,
    followUpDue: followUpEligibility.due,
    followUpEligibilityReason: followUpEligibility.reason,
    customer: quote.customer_name,
    site: quote.job_site_city || quote.job_site_name,
  };
}

function buildFollowUpSchedulerContext(quotes: QuoteListItem[]): Record<string, unknown> {
  const compactQuotes = quotes.map((quote) => ({
    id: quote.id,
    quoteNumber: quote.quote_number,
    status: quote.status,
    followupDate: quote.followup_date,
    followupAttemptCount: quote.followup_attempt_count,
    followupMaxAttempts: quote.followup_max_attempts,
    ...describeFollowUpEligibility(quote),
  }));

  return {
    currentDate: todayIsoDate(),
    eligibleStatuses: FOLLOW_UP_ELIGIBLE_STATUSES,
    dueQuotes: compactQuotes.filter((quote) => quote.due),
    futureEligibleQuotes: compactQuotes.filter(
      (quote) => quote.eligible && !quote.due && quote.followupDate,
    ),
    eligibleMissingDateQuotes: compactQuotes.filter(
      (quote) => quote.eligible && !quote.followupDate,
    ),
    ineligibleQuotesWithDates: compactQuotes.filter(
      (quote) => !quote.eligible && quote.followupDate,
    ),
    counts: {
      due: compactQuotes.filter((quote) => quote.due).length,
      eligibleWithFutureDate: compactQuotes.filter(
        (quote) => quote.eligible && !quote.due && quote.followupDate,
      ).length,
      eligibleMissingDate: compactQuotes.filter(
        (quote) => quote.eligible && !quote.followupDate,
      ).length,
      ineligibleWithDate: compactQuotes.filter(
        (quote) => !quote.eligible && quote.followupDate,
      ).length,
    },
  };
}

function describeFollowUpEligibility(quote: QuoteListItem): {
  eligible: boolean;
  due: boolean;
  reason: string;
} {
  if (!FOLLOW_UP_ELIGIBLE_STATUSES.includes(quote.status as FollowUpEligibleStatus)) {
    return {
      eligible: false,
      due: false,
      reason: `Status ${quote.status} is not scanned by the follow-up scheduler.`,
    };
  }

  if (quote.followup_attempt_count >= quote.followup_max_attempts) {
    return {
      eligible: false,
      due: false,
      reason: "Follow-up attempt limit reached.",
    };
  }

  if (!quote.followup_date) {
    return {
      eligible: true,
      due: false,
      reason: "Eligible status, but followupDate is not set.",
    };
  }

  if (quote.followup_date <= todayIsoDate()) {
    return {
      eligible: true,
      due: true,
      reason: "Eligible and followupDate is due.",
    };
  }

  return {
    eligible: true,
    due: false,
    reason: "Eligible, but followupDate is in the future.",
  };
}

type FollowUpEligibleStatus = (typeof FOLLOW_UP_ELIGIBLE_STATUSES)[number];

function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10);
}

function relationOne<T>(value: T | T[] | null): T | null {
  return Array.isArray(value) ? (value[0] ?? null) : value;
}
