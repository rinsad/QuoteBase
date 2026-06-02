import { revalidatePath } from "next/cache";

import {
  apiOk,
  badRequest,
  forbidden,
  notFound,
  serverError,
  unauthorized,
} from "@/lib/api/responses";
import { isUuid } from "@/lib/api/validation";
import { getCurrentUser } from "@/lib/auth/current-user";
import type { QuoteStatus } from "@/lib/quotes/quotes";
import { transitionQuoteStatus } from "@/lib/quotes/workflow";
import { createClient } from "@/lib/supabase/server";

type WorkflowAction =
  | "submit"
  | "approve"
  | "reject"
  | "send"
  | "accept"
  | "decline";

type WorkflowRule = {
  from: QuoteStatus;
  to: QuoteStatus;
  action: string;
  allowedRoles: Array<"admin" | "account_manager" | "estimator">;
  notePrefix?: string;
  defaultNote?: string;
};

const WORKFLOW_RULES: Record<WorkflowAction, WorkflowRule> = {
  submit: {
    from: "draft",
    to: "pending_approval",
    action: "quote.submitted_for_approval",
    allowedRoles: ["admin", "account_manager", "estimator"],
  },
  approve: {
    from: "pending_approval",
    to: "approved",
    action: "quote.approved",
    allowedRoles: ["admin", "account_manager"],
  },
  reject: {
    from: "pending_approval",
    to: "rejected",
    action: "quote.rejected",
    allowedRoles: ["admin", "account_manager"],
    notePrefix: "Rejected",
    defaultNote: "Rejected without a reason.",
  },
  send: {
    from: "approved",
    to: "sent",
    action: "quote.sent",
    allowedRoles: ["admin", "account_manager"],
    notePrefix: "Sent",
    defaultNote: "Marked as sent to customer.",
  },
  accept: {
    from: "sent",
    to: "accepted",
    action: "quote.accepted",
    allowedRoles: ["admin", "account_manager"],
    notePrefix: "Accepted",
    defaultNote: "Marked accepted by customer.",
  },
  decline: {
    from: "sent",
    to: "declined",
    action: "quote.declined",
    allowedRoles: ["admin", "account_manager"],
    notePrefix: "Declined",
    defaultNote: "Marked declined by customer.",
  },
};

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();

  if (!user) {
    return unauthorized();
  }

  const supabase = await createClient();

  if (!supabase) {
    return serverError("Supabase is not configured.");
  }

  const { id } = await params;

  if (!isUuid(id)) {
    return badRequest("id must be a valid UUID.");
  }

  const parsed = await parseWorkflowBody(request);

  if (!parsed.ok) {
    return badRequest(parsed.message);
  }

  const rule = WORKFLOW_RULES[parsed.action];

  if (!rule.allowedRoles.includes(user.role)) {
    return forbidden("You do not have permission to perform this quote action.");
  }

  try {
    const quote = await transitionQuoteStatus({
      supabase,
      user,
      quoteId: id,
      from: rule.from,
      to: rule.to,
      action: rule.action,
      allowedRoles: rule.allowedRoles,
      note: formatWorkflowNote(rule, parsed.note),
    });

    revalidatePath("/quotes");
    revalidatePath(`/quotes/${quote.id}`);

    return apiOk({ quote });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Could not update quote status.";

    if (message.includes("permission")) {
      return forbidden("You do not have permission to perform this quote action.");
    }

    if (message.includes("must be")) {
      return badRequest(message);
    }

    if (message.toLowerCase().includes("not found")) {
      return notFound("Quote not found.");
    }

    return serverError("Could not update quote status.");
  }
}

async function parseWorkflowBody(
  request: Request,
): Promise<
  | { ok: true; action: WorkflowAction; note: string }
  | { ok: false; message: string }
> {
  let payload: unknown;

  try {
    payload = await request.json();
  } catch {
    return { ok: false, message: "Request body must be valid JSON." };
  }

  if (!isRecord(payload)) {
    return { ok: false, message: "Request body must be an object." };
  }

  const action = payload.action;
  const note = payload.note;

  if (!isWorkflowAction(action)) {
    return { ok: false, message: "action is not a valid quote workflow action." };
  }

  if (note !== undefined && typeof note !== "string") {
    return { ok: false, message: "note must be a string when provided." };
  }

  return {
    ok: true,
    action,
    note: typeof note === "string" ? note.trim().slice(0, 1000) : "",
  };
}

function formatWorkflowNote(rule: WorkflowRule, note: string): string | undefined {
  if (!rule.notePrefix && !rule.defaultNote) {
    return undefined;
  }

  if (!note) {
    return rule.defaultNote;
  }

  return `${rule.notePrefix}: ${note}`;
}

function isWorkflowAction(value: unknown): value is WorkflowAction {
  return typeof value === "string" && value in WORKFLOW_RULES;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
