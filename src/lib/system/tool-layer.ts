import { revalidatePath } from "next/cache";
import { z } from "zod";

import { logAction } from "@/lib/audit/log-action";
import type { AppUser } from "@/lib/auth/current-user";
import {
  approveAndSendFollowUpDraft,
  cancelPendingFollowUpDraft,
  runFollowUpScheduler,
} from "@/lib/quotes/follow-up-agent";
import type { QuoteStatus } from "@/lib/quotes/quotes";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export type ToolCaller = "assistant" | "gui" | "agent" | "api";
export type ToolClassification = "read" | "write" | "confirm";

export type QuoteBaseToolId =
  | "quote.pipeline.move"
  | "follow_up.scheduler.run"
  | "follow_up.draft.approve"
  | "follow_up.draft.cancel";

export type QuoteBaseToolResult = {
  ok: boolean;
  message: string;
};

type ToolContext = {
  user: AppUser;
  caller: ToolCaller;
};

type ToolDefinition = {
  id: QuoteBaseToolId;
  classification: ToolClassification;
  requiredRoles: AppUser["role"][];
  requiresConfirmation: boolean;
  execute: (context: ToolContext, input: QuoteBaseToolInput) => Promise<QuoteBaseToolResult>;
};

const pipelineStatusSchema = z.enum(["draft", "sent", "follow_up", "won", "lost"]);

const toolInputSchema = z.discriminatedUnion("toolId", [
  z.object({
    toolId: z.literal("quote.pipeline.move"),
    payload: z.object({
      quoteId: z.string().uuid(),
      toStatus: pipelineStatusSchema,
    }),
  }),
  z.object({
    toolId: z.literal("follow_up.scheduler.run"),
    payload: z.record(z.string(), z.never()).default({}),
  }),
  z.object({
    toolId: z.enum(["follow_up.draft.approve", "follow_up.draft.cancel"]),
    payload: z.object({
      draftId: z.string().uuid(),
    }),
  }),
]);

export type QuoteBaseToolInput = z.infer<typeof toolInputSchema>;

const PIPELINE_TRANSITIONS: Record<z.infer<typeof pipelineStatusSchema>, QuoteStatus[]> = {
  draft: ["sent", "viewed", "follow_up"],
  sent: ["approved", "viewed", "follow_up"],
  follow_up: ["sent", "viewed"],
  won: ["sent", "viewed", "follow_up"],
  lost: ["sent", "viewed", "follow_up"],
};

export const quoteBaseToolRegistry: Record<QuoteBaseToolId, ToolDefinition> = {
  "quote.pipeline.move": {
    id: "quote.pipeline.move",
    classification: "confirm",
    requiredRoles: ["admin", "account_manager"],
    requiresConfirmation: true,
    execute: moveQuoteStatus,
  },
  "follow_up.scheduler.run": {
    id: "follow_up.scheduler.run",
    classification: "confirm",
    requiredRoles: ["admin", "account_manager"],
    requiresConfirmation: true,
    execute: runFollowUpAgent,
  },
  "follow_up.draft.approve": {
    id: "follow_up.draft.approve",
    classification: "confirm",
    requiredRoles: ["admin", "account_manager"],
    requiresConfirmation: true,
    execute: updateFollowUpDraft,
  },
  "follow_up.draft.cancel": {
    id: "follow_up.draft.cancel",
    classification: "confirm",
    requiredRoles: ["admin", "account_manager"],
    requiresConfirmation: true,
    execute: updateFollowUpDraft,
  },
};

export async function executeQuoteBaseTool({
  user,
  caller,
  confirmed,
  input,
}: {
  user: AppUser;
  caller: ToolCaller;
  confirmed: boolean;
  input: unknown;
}): Promise<QuoteBaseToolResult> {
  const parsed = toolInputSchema.safeParse(input);

  if (!parsed.success) {
    return { ok: false, message: "Invalid tool call." };
  }

  const tool = quoteBaseToolRegistry[parsed.data.toolId];

  if (!tool.requiredRoles.includes(user.role)) {
    await auditToolCall({
      user,
      caller,
      tool,
      ok: false,
      reason: "role_denied",
    });

    return { ok: false, message: "You do not have permission to run this tool." };
  }

  if (tool.requiresConfirmation && !confirmed) {
    await auditToolCall({
      user,
      caller,
      tool,
      ok: false,
      reason: "confirmation_required",
    });

    return { ok: false, message: "This tool requires confirmation." };
  }

  const result = await tool.execute({ user, caller }, parsed.data);

  await auditToolCall({
    user,
    caller,
    tool,
    ok: result.ok,
    reason: result.ok ? "executed" : "handler_failed",
    after: {
      input: parsed.data,
      message: result.message,
    },
  });

  return result;
}

async function moveQuoteStatus(
  context: ToolContext,
  input: QuoteBaseToolInput,
): Promise<QuoteBaseToolResult> {
  if (input.toolId !== "quote.pipeline.move") {
    return { ok: false, message: "Invalid quote pipeline tool input." };
  }

  const supabase = await createClient();

  if (!supabase) {
    return { ok: false, message: "Supabase is not configured." };
  }

  const { quoteId, toStatus } = input.payload;
  const { data: quote } = await supabase
    .from("quotes")
    .select("id, quote_number, status, total")
    .eq("organization_id", context.user.organization_id)
    .eq("id", quoteId)
    .eq("is_active", true)
    .single<{
      id: string;
      quote_number: string;
      status: QuoteStatus;
      total: number;
    }>();

  if (!quote) {
    return { ok: false, message: "Quote not found." };
  }

  if (quote.status === toStatus) {
    return { ok: true, message: `${quote.quote_number} is already ${formatStatus(toStatus)}.` };
  }

  if (!PIPELINE_TRANSITIONS[toStatus].includes(quote.status)) {
    return {
      ok: false,
      message: `${formatStatus(quote.status)} quotes cannot move directly to ${formatStatus(toStatus)}.`,
    };
  }

  const updatePayload: {
    status: z.infer<typeof pipelineStatusSchema>;
    followup_date?: string | null;
  } = { status: toStatus };

  if (toStatus === "sent") {
    updatePayload.followup_date = offsetDate(2);
  }

  if (toStatus === "follow_up") {
    updatePayload.followup_date = offsetDate(-2);
  }

  if (toStatus === "won" || toStatus === "lost") {
    updatePayload.followup_date = null;
  }

  const { error } = await supabase
    .from("quotes")
    .update(updatePayload)
    .eq("organization_id", context.user.organization_id)
    .eq("id", quote.id)
    .eq("status", quote.status)
    .eq("is_active", true);

  if (error) {
    return { ok: false, message: "Could not update the quote." };
  }

  await logAction({
    user: context.user,
    action: `tool.quote.pipeline.${toStatus}`,
    targetTable: "quotes",
    targetId: quote.id,
    before: { status: quote.status },
    after: { status: toStatus, total: Number(quote.total) },
    metadata: {
      caller: context.caller,
      quote_number: quote.quote_number,
      tool_id: input.toolId,
    },
    supabase,
  });

  revalidateToolPaths();

  return {
    ok: true,
    message: `${quote.quote_number} moved to ${formatStatus(toStatus)}.`,
  };
}

async function runFollowUpAgent(context: ToolContext): Promise<QuoteBaseToolResult> {
  const result = await runFollowUpScheduler({
    organizationId: context.user.organization_id,
  });

  revalidateToolPaths();

  return {
    ok: true,
    message:
      `Scanned ${result.scanned} due follow-up quote${result.scanned === 1 ? "" : "s"}; ` +
      `generated ${result.drafted} draft${result.drafted === 1 ? "" : "s"}; ` +
      `skipped ${result.skipped}. ` +
      "The scheduler only considers sent, viewed, or follow-up quotes with a due follow-up date.",
  };
}

async function updateFollowUpDraft(
  context: ToolContext,
  input: QuoteBaseToolInput,
): Promise<QuoteBaseToolResult> {
  if (
    input.toolId !== "follow_up.draft.approve" &&
    input.toolId !== "follow_up.draft.cancel"
  ) {
    return { ok: false, message: "Invalid follow-up draft tool input." };
  }

  const admin = createAdminClient();

  if (!admin) {
    return { ok: false, message: "Supabase service role is not configured." };
  }

  const { draftId } = input.payload;
  const { data: before } = await admin
    .from("quote_follow_up_drafts")
    .select("id, quote_id, status, subject, channel")
    .eq("organization_id", context.user.organization_id)
    .eq("id", draftId)
    .single<{
      id: string;
      quote_id: string;
      status: string;
      subject: string;
      channel: string;
    }>();

  if (!before) {
    return { ok: false, message: "Follow-up draft not found." };
  }

  const approving = input.toolId === "follow_up.draft.approve";
  const result = approving
    ? await approveAndSendFollowUpDraft({
        organizationId: context.user.organization_id,
        userId: context.user.id,
        draftId,
      })
    : await cancelPendingFollowUpDraft({
        organizationId: context.user.organization_id,
        draftId,
      }).then(() => ({ ok: true as const }));

  if (!result.ok) {
    return { ok: false, message: result.message };
  }

  await logAction({
    user: context.user,
    action: approving
      ? "tool.follow_up_draft.approved"
      : "tool.follow_up_draft.cancelled",
    targetTable: "quote_follow_up_drafts",
    targetId: draftId,
    before,
    after: {
      status: approving ? "sent" : "cancelled",
    },
    metadata: {
      caller: context.caller,
      tool_id: input.toolId,
    },
  });

  revalidateToolPaths();

  return {
    ok: true,
    message: approving
      ? "Follow-up draft approved and sent."
      : "Follow-up draft cancelled.",
  };
}

async function auditToolCall({
  user,
  caller,
  tool,
  ok,
  reason,
  after,
}: {
  user: AppUser;
  caller: ToolCaller;
  tool: ToolDefinition;
  ok: boolean;
  reason: string;
  after?: Record<string, unknown>;
}): Promise<void> {
  await logAction({
    user,
    action: ok ? "tool.executed" : "tool.rejected",
    targetTable: "tool_registry",
    targetId: tool.id,
    before: null,
    after: after ?? { tool_id: tool.id },
    metadata: {
      caller,
      tool_id: tool.id,
      classification: tool.classification,
      reason,
    },
  });
}

function revalidateToolPaths(): void {
  revalidatePath("/dashboard");
  revalidatePath("/quotes");
  revalidatePath("/admin/reports");
}

function offsetDate(days: number): string {
  const value = new Date();

  value.setUTCDate(value.getUTCDate() + days);

  return value.toISOString().slice(0, 10);
}

function formatStatus(status: string): string {
  return status
    .split("_")
    .map((part) => part[0]?.toUpperCase() + part.slice(1))
    .join(" ");
}
