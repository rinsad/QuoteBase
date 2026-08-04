import type { SupabaseClient } from "@supabase/supabase-js";

import { getBaseUrl } from "@/lib/env";
import { sendGmailQuoteEmail } from "@/lib/integrations/gmail";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  effectiveMaxFollowUpAttempts,
  isFollowUpJobStartingSoon,
  nextFollowUpDateForQuote,
  nextFollowUpDelayDays,
} from "@/lib/quotes/follow-up-schedule";

type FollowUpTone = "friendly" | "urgent" | "final" | "owner_escalation";
type FollowUpStatus =
  | "pending_approval"
  | "approved"
  | "sent"
  | "skipped"
  | "cancelled"
  | "failed";
type FollowUpChannel = "email" | "sms";

export type FollowUpDraft = {
  id: string;
  quote_id: string;
  owner_id: string;
  recipient_email: string | null;
  recipient_phone: string | null;
  channel: FollowUpChannel;
  tone: FollowUpTone;
  stage_day: number;
  subject: string;
  body: string;
  status: FollowUpStatus;
  auto_send: boolean;
  big_quote_escalation: boolean;
  due_at: string;
  sent_at: string | null;
  failure_reason: string | null;
  created_at: string;
  quotes:
    | {
        quote_number: string;
        total: number;
        status: string;
        customers: { name: string; email: string | null; phone: string | null } | null;
        users: { full_name: string; email: string } | null;
      }
    | Array<{
        quote_number: string;
        total: number;
        status: string;
        customers: { name: string; email: string | null; phone: string | null } | null;
        users: { full_name: string; email: string } | null;
      }>
    | null;
};

type FollowUpCandidate = {
  id: string;
  organization_id: string;
  quote_number: string;
  status: string;
  total: number;
  account_type: string | null;
  project_status: string | null;
  job_start_date: string | null;
  job_end_date: string | null;
  followup_date: string | null;
  last_followup_at: string | null;
  followup_attempt_count: number;
  followup_max_attempts: number;
  customers:
    | { name: string; email: string | null; phone: string | null }
    | { name: string; email: string | null; phone: string | null }[]
    | null;
  users:
    | { id: string; full_name: string; email: string }
    | { id: string; full_name: string; email: string }[]
    | null;
};

type PublicEventRecord = {
  quote_id: string;
  event_type: string;
  created_at: string;
};

type FollowUpSettings = {
  bigQuoteThreshold: number;
  autoSendEnabled: boolean;
  smsEnabled: boolean;
  defaultFollowupMaxAttempts: number;
  jobsStartingSoonDays: number;
};

const OPEN_QUOTE_STATUSES = ["sent", "viewed", "follow_up"];
const RESPONSE_EVENT_TYPES = ["accepted", "declined", "payment_completed"];
const DEFAULT_BIG_QUOTE_THRESHOLD = 10000;
const DEFAULT_JOBS_STARTING_SOON_DAYS = 14;

export async function runFollowUpScheduler({
  organizationId,
  now = new Date(),
}: {
  organizationId?: string;
  now?: Date;
} = {}): Promise<{ scanned: number; drafted: number; skipped: number }> {
  const supabase = createAdminClient();

  if (!supabase) {
    return { scanned: 0, drafted: 0, skipped: 0 };
  }

  let query = supabase
    .from("quotes")
    .select(
      "id, organization_id, quote_number, status, total, account_type, project_status, job_start_date, job_end_date, followup_date, last_followup_at, followup_attempt_count, followup_max_attempts, customers(name, email, phone), users(id, full_name, email)",
    )
    .eq("is_active", true)
    .in("status", OPEN_QUOTE_STATUSES)
    .not("followup_date", "is", null)
    .lte("followup_date", isoDate(now))
    .limit(100);

  if (organizationId) {
    query = query.eq("organization_id", organizationId);
  }

  const { data: candidates } = await query.returns<FollowUpCandidate[]>();
  const quotes = candidates ?? [];

  if (!quotes.length) {
    return { scanned: 0, drafted: 0, skipped: 0 };
  }

  const responseEvents = await loadResponseEvents({
    supabase,
    organizationId,
    quoteIds: quotes.map((quote) => quote.id),
  });
  const respondedQuoteIds = new Set(responseEvents.map((event) => event.quote_id));
  const settingsByOrg = new Map<string, FollowUpSettings>();
  let drafted = 0;
  let skipped = 0;

  for (const quote of quotes) {
    const settings =
      settingsByOrg.get(quote.organization_id) ??
      (await loadFollowUpSettings({
        supabase,
        organizationId: quote.organization_id,
      }));

    settingsByOrg.set(quote.organization_id, settings);
    const maxAttempts = effectiveMaxFollowUpAttempts({
      quote,
      settings: {
        defaultFollowupMaxAttempts: settings.defaultFollowupMaxAttempts,
      },
    });

    if (quote.followup_attempt_count >= maxAttempts) {
      await markQuoteLostDueToFollowupExhaustion({
        supabase,
        organizationId: quote.organization_id,
        quoteId: quote.id,
        previousStatus: quote.status,
        attemptCount: quote.followup_attempt_count,
        maxAttempts,
      });
      skipped += 1;
      continue;
    }

    if (respondedQuoteIds.has(quote.id)) {
      await stopFollowUpForRespondedQuote({
        supabase,
        organizationId: quote.organization_id,
        quoteId: quote.id,
        reason: "Customer responded through public quote event.",
      });
      skipped += 1;
      continue;
    }

    const owner = relationOne(quote.users);
    const customer = relationOne(quote.customers);

    const stageDay = nextFollowUpDelayDays({
      quote,
      settings: {
        defaultFollowupMaxAttempts: settings.defaultFollowupMaxAttempts,
        jobsStartingSoonDays: settings.jobsStartingSoonDays,
      },
      now,
    });

    if (!stageDay) {
      skipped += 1;
      continue;
    }

    if (!owner) {
      skipped += 1;
      continue;
    }

    const draft = buildFollowUpDraft({
      quote,
      owner,
      customer,
      stageDay,
      settings,
    });

    const { data: insertedDraft, error } = await supabase
      .from("quote_follow_up_drafts")
      .insert(draft)
      .select("id")
      .single<{ id: string }>();

    if (error || !insertedDraft) {
      skipped += 1;
      continue;
    }

    drafted += 1;

    if (
      isFollowUpJobStartingSoon({
        quote,
        settings: {
          jobsStartingSoonDays: settings.jobsStartingSoonDays,
        },
        now,
      })
    ) {
      const { data: ownerDraft } = await supabase
        .from("quote_follow_up_drafts")
        .insert(
          buildOwnerCallDraft({
            quote,
            owner,
            customer,
            stageDay,
            settings,
          }),
        )
        .select("id")
        .maybeSingle<{ id: string }>();

      if (ownerDraft) {
        drafted += 1;
      }
    }

    if (
      draft.auto_send === true &&
      draft.channel === "email" &&
      typeof draft.owner_id === "string"
    ) {
      const sent = await approveAndSendFollowUpDraft({
        organizationId: quote.organization_id,
        userId: draft.owner_id,
        draftId: insertedDraft.id,
      });

      if (!sent.ok) {
        skipped += 1;
      }
    }
  }

  return {
    scanned: quotes.length,
    drafted,
    skipped,
  };
}

export async function listFollowUpDrafts({
  organizationId,
}: {
  organizationId: string;
}): Promise<FollowUpDraft[]> {
  const supabase = createAdminClient();

  if (!supabase) {
    return [];
  }

  const { data } = await supabase
    .from("quote_follow_up_drafts")
    .select(
      "id, quote_id, owner_id, recipient_email, recipient_phone, channel, tone, stage_day, subject, body, status, auto_send, big_quote_escalation, due_at, sent_at, failure_reason, created_at, quotes(quote_number, total, status, customers(name, email, phone), users(full_name, email))",
    )
    .eq("organization_id", organizationId)
    .in("status", ["pending_approval", "approved", "failed"])
    .order("created_at", { ascending: false })
    .limit(50)
    .returns<FollowUpDraft[]>();

  return data ?? [];
}

export async function approveAndSendFollowUpDraft({
  organizationId,
  userId,
  draftId,
}: {
  organizationId: string;
  userId: string;
  draftId: string;
}): Promise<{ ok: true } | { ok: false; message: string }> {
  const supabase = createAdminClient();

  if (!supabase) {
    return { ok: false, message: "Supabase is not configured." };
  }

  const { data: draft } = await supabase
    .from("quote_follow_up_drafts")
    .select(
      "id, organization_id, quote_id, owner_id, recipient_email, channel, subject, body, status, quotes(status, account_type, project_status, job_start_date, job_end_date, followup_attempt_count, followup_max_attempts)",
    )
    .eq("organization_id", organizationId)
    .eq("id", draftId)
    .single<{
      id: string;
      organization_id: string;
      quote_id: string;
      owner_id: string;
      recipient_email: string | null;
      channel: FollowUpChannel;
      subject: string;
      body: string;
      status: FollowUpStatus;
      quotes:
        | {
            status: string;
            account_type: string | null;
            project_status: string | null;
            job_start_date: string | null;
            job_end_date: string | null;
            followup_attempt_count: number;
            followup_max_attempts: number;
          }
        | {
            status: string;
            account_type: string | null;
            project_status: string | null;
            job_start_date: string | null;
            job_end_date: string | null;
            followup_attempt_count: number;
            followup_max_attempts: number;
          }[]
        | null;
    }>();

  if (!draft || draft.status !== "pending_approval") {
    return { ok: false, message: "Follow-up draft is no longer pending." };
  }

  const quote = relationOne(draft.quotes);

  if (!quote || !OPEN_QUOTE_STATUSES.includes(quote.status)) {
    await cancelFollowUpDraft({
      supabase,
      organizationId,
      draftId,
      reason: "Quote status changed before approval.",
    });

    return { ok: false, message: "Quote is no longer open." };
  }

  const settings = await loadFollowUpSettings({
    supabase,
    organizationId,
  });
  const maxAttempts = effectiveMaxFollowUpAttempts({
    quote,
    settings: {
      defaultFollowupMaxAttempts: settings.defaultFollowupMaxAttempts,
    },
  });

  if (Number(quote.followup_attempt_count) >= maxAttempts) {
    await cancelFollowUpDraft({
      supabase,
      organizationId,
      draftId,
      reason: "Follow-up attempt limit reached.",
    });

    return { ok: false, message: "Follow-up attempt limit reached." };
  }

  if (draft.channel === "sms") {
    await failFollowUpDraft({
      supabase,
      organizationId,
      draftId,
      reason: "SMS provider is not configured in MVP.",
    });

    return { ok: false, message: "SMS provider is not configured." };
  }

  if (!draft.recipient_email) {
    await failFollowUpDraft({
      supabase,
      organizationId,
      draftId,
      reason: "Recipient email is missing.",
    });

    return { ok: false, message: "Recipient email is missing." };
  }

  await supabase
    .from("quote_follow_up_drafts")
    .update({
      status: "approved",
      approved_by: userId,
      approved_at: new Date().toISOString(),
    })
    .eq("organization_id", organizationId)
    .eq("id", draftId);

  const delivery = await sendGmailQuoteEmail({
    supabase,
    organizationId,
    userId,
    to: draft.recipient_email,
    subject: draft.subject,
    text: draft.body,
    attachments: [],
  });

  if (delivery.status !== "sent") {
    await failFollowUpDraft({
      supabase,
      organizationId,
      draftId,
      reason: delivery.reason ?? "Email could not be sent.",
    });

    return { ok: false, message: delivery.reason ?? "Email could not be sent." };
  }

  await supabase
    .from("quote_follow_up_drafts")
    .update({
      status: "sent",
      sent_by: userId,
      sent_at: new Date().toISOString(),
      provider: delivery.provider,
      provider_message_id: delivery.messageId,
      failure_reason: null,
    })
    .eq("organization_id", organizationId)
    .eq("id", draftId);

  const nextAttemptCount = Number(quote.followup_attempt_count) + 1;
  const nextFollowupDate =
    nextAttemptCount >= maxAttempts
      ? null
      : nextFollowUpDateForQuote({
          quote: {
            ...quote,
            followup_attempt_count: nextAttemptCount,
          },
          settings: {
            defaultFollowupMaxAttempts: settings.defaultFollowupMaxAttempts,
            jobsStartingSoonDays: settings.jobsStartingSoonDays,
          },
        });

  if (nextAttemptCount >= maxAttempts) {
    await markQuoteLostDueToFollowupExhaustion({
      supabase,
      organizationId,
      quoteId: draft.quote_id,
      previousStatus: quote.status,
      attemptCount: nextAttemptCount,
      maxAttempts,
    });

    return { ok: true };
  }

  await supabase
    .from("quotes")
    .update({
      last_followup_at: new Date().toISOString(),
      followup_date: nextFollowupDate,
      followup_attempt_count: nextAttemptCount,
    })
    .eq("organization_id", organizationId)
    .eq("id", draft.quote_id)
    .in("status", OPEN_QUOTE_STATUSES)
    .eq("is_active", true);

  return { ok: true };
}

export async function cancelPendingFollowUpDraft({
  organizationId,
  draftId,
}: {
  organizationId: string;
  draftId: string;
}): Promise<void> {
  const supabase = createAdminClient();

  if (!supabase) {
    return;
  }

  await cancelFollowUpDraft({
    supabase,
    organizationId,
    draftId,
    reason: "Cancelled by user.",
  });
}

function buildFollowUpDraft({
  quote,
  owner,
  customer,
  stageDay,
  settings,
}: {
  quote: FollowUpCandidate;
  owner: { id: string; full_name: string; email: string };
  customer: { name: string; email: string | null; phone: string | null } | null;
  stageDay: number;
  settings: FollowUpSettings;
}): Record<string, unknown> {
  const isBigQuote = Number(quote.total) >= settings.bigQuoteThreshold;
  const channel: FollowUpChannel =
    !isBigQuote && settings.smsEnabled && !customer?.email && customer?.phone
      ? "sms"
      : "email";
  const tone = isBigQuote ? "owner_escalation" : toneForStage(stageDay);
  const recipientEmail = isBigQuote ? owner.email : customer?.email ?? null;
  const autoSend =
    settings.autoSendEnabled && !isBigQuote && channel === "email" && Boolean(recipientEmail);
  const message = isBigQuote
    ? ownerEscalationMessage({ quote, owner, customer, stageDay })
    : customerFollowUpMessage({ quote, customer, stageDay });

  return {
    organization_id: quote.organization_id,
    quote_id: quote.id,
    owner_id: owner.id,
    recipient_email: recipientEmail,
    recipient_phone: isBigQuote ? null : customer?.phone ?? null,
    channel,
    tone,
    stage_day: stageDay,
    subject: message.subject,
    body: message.body,
    status: "pending_approval",
    auto_send: autoSend,
    big_quote_escalation: isBigQuote,
    due_at: new Date().toISOString(),
    metadata: {
      quote_total: Number(quote.total),
      quote_status: quote.status,
      followup_date: quote.followup_date,
      account_type: quote.account_type,
      project_status: quote.project_status,
      job_start_date: quote.job_start_date,
      job_end_date: quote.job_end_date,
      big_quote_threshold: settings.bigQuoteThreshold,
      auto_send_enabled: settings.autoSendEnabled,
      sms_enabled: settings.smsEnabled,
      jobs_starting_soon_days: settings.jobsStartingSoonDays,
    },
  };
}

function buildOwnerCallDraft({
  quote,
  owner,
  customer,
  stageDay,
  settings,
}: {
  quote: FollowUpCandidate;
  owner: { id: string; full_name: string; email: string };
  customer: { name: string; email: string | null; phone: string | null } | null;
  stageDay: number;
  settings: FollowUpSettings;
}): Record<string, unknown> {
  const message = ownerCallMessage({ quote, owner, customer, stageDay });

  return {
    organization_id: quote.organization_id,
    quote_id: quote.id,
    owner_id: owner.id,
    recipient_email: owner.email,
    recipient_phone: null,
    channel: "email",
    tone: "owner_escalation",
    stage_day: stageDay,
    subject: message.subject,
    body: message.body,
    status: "pending_approval",
    auto_send: false,
    big_quote_escalation: false,
    due_at: new Date().toISOString(),
    metadata: {
      owner_call_required: true,
      quote_total: Number(quote.total),
      quote_status: quote.status,
      followup_date: quote.followup_date,
      account_type: quote.account_type,
      project_status: quote.project_status,
      job_start_date: quote.job_start_date,
      job_end_date: quote.job_end_date,
      jobs_starting_soon_days: settings.jobsStartingSoonDays,
    },
  };
}

function customerFollowUpMessage({
  quote,
  customer,
  stageDay,
}: {
  quote: FollowUpCandidate;
  customer: { name: string; email: string | null; phone: string | null } | null;
  stageDay: number;
}): { subject: string; body: string } {
  const customerName = customer?.name ?? "there";
  const quoteUrl = `${getBaseUrl()}/quotes/${quote.id}`;

  if (stageDay >= 10) {
    return {
      subject: `Final follow-up on quote ${quote.quote_number}`,
      body: [
        `Hi ${customerName},`,
        "",
        `I wanted to send one final note on quote ${quote.quote_number}.`,
        `If the scope is still active, we can help keep the material and trucking plan moving. If priorities changed, no problem; just reply and I will close the loop on our side.`,
        "",
        `Quote total: ${formatCurrency(Number(quote.total))}`,
        `Internal quote link: ${quoteUrl}`,
        "",
        "Thank you,",
        "QuoteBase",
      ].join("\n"),
    };
  }

  if (stageDay >= 5) {
    return {
      subject: `Checking timing for quote ${quote.quote_number}`,
      body: [
        `Hi ${customerName},`,
        "",
        `I wanted to check whether quote ${quote.quote_number} is still on your schedule.`,
        "Material and trucking availability can move quickly, so it would be good to confirm timing or revise the quote if anything changed.",
        "",
        `Quote total: ${formatCurrency(Number(quote.total))}`,
        `Internal quote link: ${quoteUrl}`,
        "",
        "Thank you,",
        "QuoteBase",
      ].join("\n"),
    };
  }

  return {
    subject: `Following up on quote ${quote.quote_number}`,
    body: [
      `Hi ${customerName},`,
      "",
      `Just checking in on quote ${quote.quote_number}.`,
      "Let me know if you have questions, need a revision, or want to move forward.",
      "",
      `Quote total: ${formatCurrency(Number(quote.total))}`,
      `Internal quote link: ${quoteUrl}`,
      "",
      "Thank you,",
      "QuoteBase",
    ].join("\n"),
  };
}

function ownerEscalationMessage({
  quote,
  owner,
  customer,
  stageDay,
}: {
  quote: FollowUpCandidate;
  owner: { full_name: string };
  customer: { name: string; email: string | null; phone: string | null } | null;
  stageDay: number;
}): { subject: string; body: string } {
  return {
    subject: `Big quote follow-up: ${quote.quote_number}`,
    body: [
      `Hi ${owner.full_name},`,
      "",
      `Quote ${quote.quote_number} is due for a day ${stageDay} follow-up and is above the big-quote threshold.`,
      "Auto-send is off for this quote. Please review the customer context and follow up directly.",
      "",
      `Customer: ${customer?.name ?? "Unknown customer"}`,
      `Total: ${formatCurrency(Number(quote.total))}`,
      `Quote: ${getBaseUrl()}/quotes/${quote.id}`,
      "",
      "QuoteBase",
    ].join("\n"),
  };
}

function ownerCallMessage({
  quote,
  owner,
  customer,
  stageDay,
}: {
  quote: FollowUpCandidate;
  owner: { full_name: string };
  customer: { name: string; email: string | null; phone: string | null } | null;
  stageDay: number;
}): { subject: string; body: string } {
  return {
    subject: `Call now: job starting soon for ${quote.quote_number}`,
    body: [
      `Hi ${owner.full_name},`,
      "",
      `Quote ${quote.quote_number} is due for a day ${stageDay} follow-up and the job start date is coming up soon.`,
      "Please call the customer directly in addition to any email or text follow-up.",
      "",
      `Customer: ${customer?.name ?? "Unknown customer"}`,
      customer?.phone ? `Phone: ${customer.phone}` : "Phone: Not saved",
      customer?.email ? `Email: ${customer.email}` : "Email: Not saved",
      quote.job_start_date
        ? `Estimated start: ${quote.job_start_date}`
        : "Estimated start: Not set",
      quote.job_end_date ? `Estimated end: ${quote.job_end_date}` : "Estimated end: Not set",
      `Total: ${formatCurrency(Number(quote.total))}`,
      `Quote: ${getBaseUrl()}/quotes/${quote.id}`,
      "",
      "QuoteBase",
    ].join("\n"),
  };
}

async function loadResponseEvents({
  supabase,
  organizationId,
  quoteIds,
}: {
  supabase: SupabaseClient;
  organizationId?: string;
  quoteIds: string[];
}): Promise<PublicEventRecord[]> {
  let query = supabase
    .from("quote_public_events")
    .select("quote_id, event_type, created_at")
    .in("quote_id", quoteIds)
    .in("event_type", RESPONSE_EVENT_TYPES);

  if (organizationId) {
    query = query.eq("organization_id", organizationId);
  }

  const { data } = await query.returns<PublicEventRecord[]>();

  return data ?? [];
}

async function cancelFollowUpDraft({
  supabase,
  organizationId,
  draftId,
  reason,
}: {
  supabase: SupabaseClient;
  organizationId: string;
  draftId: string;
  reason: string;
}): Promise<void> {
  await supabase
    .from("quote_follow_up_drafts")
    .update({ status: "cancelled", failure_reason: reason })
    .eq("organization_id", organizationId)
    .eq("id", draftId)
    .in("status", ["pending_approval", "approved"]);
}

async function stopFollowUpForRespondedQuote({
  supabase,
  organizationId,
  quoteId,
  reason,
}: {
  supabase: SupabaseClient;
  organizationId: string;
  quoteId: string;
  reason: string;
}): Promise<void> {
  await supabase
    .from("quotes")
    .update({ followup_date: null })
    .eq("organization_id", organizationId)
    .eq("id", quoteId)
    .in("status", OPEN_QUOTE_STATUSES)
    .eq("is_active", true);

  await supabase
    .from("quote_follow_up_drafts")
    .update({ status: "cancelled", failure_reason: reason })
    .eq("organization_id", organizationId)
    .eq("quote_id", quoteId)
    .in("status", ["pending_approval", "approved"]);
}

async function markQuoteLostDueToFollowupExhaustion({
  supabase,
  organizationId,
  quoteId,
  previousStatus,
  attemptCount,
  maxAttempts,
}: {
  supabase: SupabaseClient;
  organizationId: string;
  quoteId: string;
  previousStatus: string;
  attemptCount: number;
  maxAttempts: number;
}): Promise<void> {
  const finalAttemptCount = Math.min(attemptCount, maxAttempts);
  const { data: quote } = await supabase
    .from("quotes")
    .update({
      status: "lost",
      followup_date: null,
      followup_attempt_count: finalAttemptCount,
    })
    .eq("organization_id", organizationId)
    .eq("id", quoteId)
    .in("status", OPEN_QUOTE_STATUSES)
    .eq("is_active", true)
    .select("id")
    .maybeSingle<{ id: string }>();

  if (!quote) {
    return;
  }

  await supabase
    .from("quote_follow_up_drafts")
    .update({
      status: "cancelled",
      failure_reason:
        "Quote was automatically marked lost after follow-up attempts were exhausted.",
    })
    .eq("organization_id", organizationId)
    .eq("quote_id", quoteId)
    .in("status", ["pending_approval", "approved"]);

  await supabase.from("audit_log").insert({
    organization_id: organizationId,
    user_id: null,
    action: "quote.auto_lost_after_followups",
    target_table: "quotes",
    target_id: quoteId,
    before_value: {
      status: previousStatus,
      followup_attempt_count: attemptCount,
    },
    after_value: {
      status: "lost",
      followup_attempt_count: finalAttemptCount,
      followup_max_attempts: maxAttempts,
    },
    metadata: {
      reason: "Follow-up attempt limit reached.",
    },
  });
}

async function failFollowUpDraft({
  supabase,
  organizationId,
  draftId,
  reason,
}: {
  supabase: SupabaseClient;
  organizationId: string;
  draftId: string;
  reason: string;
}): Promise<void> {
  await supabase
    .from("quote_follow_up_drafts")
    .update({ status: "failed", failure_reason: reason })
    .eq("organization_id", organizationId)
    .eq("id", draftId);
}

function toneForStage(stageDay: number): FollowUpTone {
  if (stageDay >= 10) {
    return "final";
  }

  if (stageDay >= 5) {
    return "urgent";
  }

  return "friendly";
}

async function loadFollowUpSettings({
  supabase,
  organizationId,
}: {
  supabase: SupabaseClient;
  organizationId: string;
}): Promise<FollowUpSettings> {
  const { data } = await supabase
    .from("pricing_config")
    .select(
      "big_quote_threshold, default_followup_max_attempts, follow_up_auto_send_enabled, follow_up_sms_enabled, jobs_starting_soon_days",
    )
    .eq("organization_id", organizationId)
    .maybeSingle<{
      big_quote_threshold: number | string | null;
      default_followup_max_attempts: number | string | null;
      follow_up_auto_send_enabled: boolean | null;
      follow_up_sms_enabled: boolean | null;
      jobs_starting_soon_days: number | string | null;
    }>();
  const value = Number(data?.big_quote_threshold ?? DEFAULT_BIG_QUOTE_THRESHOLD);
  const bigQuoteThreshold =
    Number.isFinite(value) && value > 0 ? value : DEFAULT_BIG_QUOTE_THRESHOLD;
  const startingSoonDays = Number(
    data?.jobs_starting_soon_days ?? DEFAULT_JOBS_STARTING_SOON_DAYS,
  );
  const maxAttempts = Number(data?.default_followup_max_attempts ?? 5);

  return {
    bigQuoteThreshold,
    autoSendEnabled: Boolean(data?.follow_up_auto_send_enabled),
    smsEnabled: Boolean(data?.follow_up_sms_enabled),
    defaultFollowupMaxAttempts:
      Number.isFinite(maxAttempts) && maxAttempts >= 3 && maxAttempts <= 5
        ? Math.trunc(maxAttempts)
        : 5,
    jobsStartingSoonDays:
      Number.isFinite(startingSoonDays) && startingSoonDays > 0
        ? Math.trunc(startingSoonDays)
        : DEFAULT_JOBS_STARTING_SOON_DAYS,
  };
}

function isoDate(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(value);
}

function relationOne<T>(value: T | T[] | null): T | null {
  return Array.isArray(value) ? (value[0] ?? null) : value;
}
