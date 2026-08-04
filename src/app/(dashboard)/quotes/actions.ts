"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { logAction } from "@/lib/audit/log-action";
import { getCurrentUser } from "@/lib/auth/current-user";
import {
  approveAndSendFollowUpDraft,
  cancelPendingFollowUpDraft,
  runFollowUpScheduler,
} from "@/lib/quotes/follow-up-agent";
import { scheduleNextFollowUpForQuote } from "@/lib/quotes/follow-up-schedule";
import type { QuoteStatus } from "@/lib/quotes/quotes";
import { createClient } from "@/lib/supabase/server";

const pipelineStatusSchema = z.enum(["draft", "sent", "follow_up", "won", "lost"]);

const moveQuoteSchema = z.object({
  quoteId: z.string().uuid(),
  toStatus: pipelineStatusSchema,
});

const PIPELINE_TRANSITIONS: Record<
  z.infer<typeof pipelineStatusSchema>,
  QuoteStatus[]
> = {
  draft: ["sent", "viewed", "follow_up"],
  sent: ["approved", "viewed", "follow_up"],
  follow_up: ["sent", "viewed"],
  won: ["sent", "viewed", "follow_up"],
  lost: ["sent", "viewed", "follow_up"],
};

type MoveQuoteResult =
  | { ok: true }
  | { ok: false; message: string };

export async function moveQuotePipelineStatus(
  input: unknown,
): Promise<MoveQuoteResult> {
  const parsed = moveQuoteSchema.safeParse(input);

  if (!parsed.success) {
    return { ok: false, message: "Invalid pipeline move." };
  }

  const user = await getCurrentUser();

  if (!user) {
    return { ok: false, message: "Authentication is required." };
  }

  if (user.role !== "admin" && user.role !== "account_manager") {
    return {
      ok: false,
      message: "Only admins and account managers can move pipeline cards.",
    };
  }

  const supabase = await createClient();

  if (!supabase) {
    return { ok: false, message: "Supabase is not configured." };
  }

  const { data: quote, error: quoteError } = await supabase
    .from("quotes")
    .select("id, quote_number, status, total")
    .eq("organization_id", user.organization_id)
    .eq("id", parsed.data.quoteId)
    .eq("is_active", true)
    .single<{
      id: string;
      quote_number: string;
      status: QuoteStatus;
      total: number;
    }>();

  if (quoteError || !quote) {
    return { ok: false, message: "Quote not found." };
  }

  if (quote.status === parsed.data.toStatus) {
    return { ok: true };
  }

  if (!PIPELINE_TRANSITIONS[parsed.data.toStatus].includes(quote.status)) {
    return {
      ok: false,
      message: `${formatStatus(quote.status)} quotes cannot move directly to ${formatStatus(
        parsed.data.toStatus,
      )}.`,
    };
  }

  const updatePayload: {
    status: z.infer<typeof pipelineStatusSchema>;
    followup_date?: string | null;
  } = {
    status: parsed.data.toStatus,
  };

  if (parsed.data.toStatus === "follow_up") {
    updatePayload.followup_date = offsetDate(-2);
  }

  if (parsed.data.toStatus === "won" || parsed.data.toStatus === "lost") {
    updatePayload.followup_date = null;
  }

  const { error: updateError } = await supabase
    .from("quotes")
    .update(updatePayload)
    .eq("organization_id", user.organization_id)
    .eq("id", quote.id)
    .eq("status", quote.status)
    .eq("is_active", true);

  if (updateError) {
    return { ok: false, message: "Could not move quote." };
  }

  if (parsed.data.toStatus === "sent") {
    await scheduleNextFollowUpForQuote({
      supabase,
      organizationId: user.organization_id,
      quoteId: quote.id,
    });
  }

  await logAction({
    user,
    action: `quote.pipeline.${parsed.data.toStatus}`,
    targetTable: "quotes",
    targetId: quote.id,
    before: {
      status: quote.status,
    },
    after: {
      status: parsed.data.toStatus,
      total: Number(quote.total),
    },
    metadata: {
      quote_number: quote.quote_number,
      source: "kanban_drag_drop",
    },
    supabase,
  });

  revalidatePath("/quotes");
  revalidatePath(`/quotes/${quote.id}`);
  revalidatePath("/dashboard");
  revalidatePath("/admin/reports");

  return { ok: true };
}

export async function approveFollowUpDraft(formData: FormData) {
  const draftId = formData.get("draft_id");

  if (typeof draftId !== "string" || !z.string().uuid().safeParse(draftId).success) {
    return;
  }

  const user = await getCurrentUser();

  if (!user) {
    return;
  }

  if (user.role !== "admin" && user.role !== "account_manager") {
    return;
  }

  await approveAndSendFollowUpDraft({
    organizationId: user.organization_id,
    userId: user.id,
    draftId,
  });
  revalidatePath("/quotes");
  revalidatePath("/dashboard");
}

export async function cancelFollowUpDraft(formData: FormData) {
  const draftId = formData.get("draft_id");

  if (typeof draftId !== "string" || !z.string().uuid().safeParse(draftId).success) {
    return;
  }

  const user = await getCurrentUser();

  if (!user) {
    return;
  }

  if (user.role !== "admin" && user.role !== "account_manager") {
    return;
  }

  await cancelPendingFollowUpDraft({
    organizationId: user.organization_id,
    draftId,
  });
  revalidatePath("/quotes");
  revalidatePath("/dashboard");
}

export async function runFollowUpAgentNow() {
  const user = await getCurrentUser();

  if (!user) {
    return;
  }

  if (user.role !== "admin" && user.role !== "account_manager") {
    return;
  }

  await runFollowUpScheduler({
    organizationId: user.organization_id,
  });
  revalidatePath("/quotes");
  revalidatePath("/dashboard");
}

function formatStatus(status: string): string {
  return status
    .split("_")
    .map((part) => part[0]?.toUpperCase() + part.slice(1))
    .join(" ");
}

function offsetDate(days: number): string {
  const value = new Date();
  value.setUTCDate(value.getUTCDate() + days);

  return value.toISOString().slice(0, 10);
}
