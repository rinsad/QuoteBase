"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { getCurrentUser } from "@/lib/auth/current-user";
import { logAction } from "@/lib/audit/log-action";
import { createClient } from "@/lib/supabase/server";

type QuoteStatus =
  | "draft"
  | "pending_approval"
  | "approved"
  | "rejected"
  | "expired";

type QuoteStatusRecord = {
  id: string;
  quote_number: string;
  status: QuoteStatus;
  notes: string | null;
  total: number;
};

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function submitQuoteForApproval(quoteId: string) {
  await transitionQuoteStatus({
    quoteId,
    from: "draft",
    to: "pending_approval",
    action: "quote.submitted_for_approval",
    allowedRoles: ["admin", "account_manager", "estimator"],
  });
}

export async function approveQuote(quoteId: string) {
  await transitionQuoteStatus({
    quoteId,
    from: "pending_approval",
    to: "approved",
    action: "quote.approved",
    allowedRoles: ["admin", "account_manager"],
  });
}

export async function rejectQuote(quoteId: string, formData: FormData) {
  const reasonValue = formData.get("rejection_reason");
  const reason = typeof reasonValue === "string" ? reasonValue.trim() : "";

  await transitionQuoteStatus({
    quoteId,
    from: "pending_approval",
    to: "rejected",
    action: "quote.rejected",
    allowedRoles: ["admin", "account_manager"],
    note: reason ? `Rejected: ${reason}` : "Rejected without a reason.",
  });
}

async function transitionQuoteStatus({
  quoteId,
  from,
  to,
  action,
  allowedRoles,
  note,
}: {
  quoteId: string;
  from: QuoteStatus;
  to: QuoteStatus;
  action: string;
  allowedRoles: Array<"admin" | "account_manager" | "estimator">;
  note?: string;
}) {
  if (!UUID_PATTERN.test(quoteId)) {
    throw new Error("Invalid quote id.");
  }

  const user = await getCurrentUser();

  if (!user) {
    redirect("/login");
  }

  if (!allowedRoles.includes(user.role)) {
    throw new Error("You do not have permission to perform this quote action.");
  }

  const supabase = await createClient();

  if (!supabase) {
    throw new Error("Supabase is not configured for this workspace.");
  }

  const { data: quote, error: quoteError } = await supabase
    .from("quotes")
    .select("id, quote_number, status, notes, total")
    .eq("organization_id", user.organization_id)
    .eq("id", quoteId)
    .eq("is_active", true)
    .single<QuoteStatusRecord>();

  if (quoteError || !quote) {
    throw new Error(quoteError?.message ?? "Quote not found.");
  }

  if (quote.status !== from) {
    throw new Error(
      `Quote ${quote.quote_number} must be ${formatStatus(from)} before it can become ${formatStatus(to)}.`,
    );
  }

  const notes = note ? appendNote(quote.notes, note) : quote.notes;
  const { error: updateError } = await supabase
    .from("quotes")
    .update({
      status: to,
      notes,
    })
    .eq("organization_id", user.organization_id)
    .eq("id", quote.id)
    .eq("status", from)
    .eq("is_active", true);

  if (updateError) {
    throw new Error(updateError.message);
  }

  await logAction({
    user,
    action,
    targetTable: "quotes",
    targetId: quote.id,
    before: {
      status: from,
      notes: quote.notes,
    },
    after: {
      status: to,
      notes,
      total: Number(quote.total),
    },
  });

  revalidatePath("/quotes");
  revalidatePath(`/quotes/${quote.id}`);
  redirect(`/quotes/${quote.id}`);
}

function appendNote(existingNotes: string | null, note: string): string {
  const timestamp = new Date().toISOString();
  const nextNote = `[${timestamp}] ${note}`;

  return existingNotes ? `${existingNotes}\n\n${nextNote}` : nextNote;
}

function formatStatus(status: string): string {
  return status
    .split("_")
    .map((part) => part[0]?.toUpperCase() + part.slice(1))
    .join(" ");
}
