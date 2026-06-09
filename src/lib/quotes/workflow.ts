import type { SupabaseClient } from "@supabase/supabase-js";

import type { AppUser } from "@/lib/auth/current-user";
import { logAction } from "@/lib/audit/log-action";
import { notifySlackQuoteStatusChange } from "@/lib/notifications/slack";
import { pushQuoteToQuoterDraft } from "@/lib/integrations/quoter";
import type { QuoteStatus } from "@/lib/quotes/quotes";

type AppRole = AppUser["role"];

type QuoteStatusRecord = {
  id: string;
  quote_number: string;
  status: QuoteStatus;
  notes: string | null;
  total: number;
  requested_by: string;
};

export type QuoteTransitionResult = {
  id: string;
  quote_number: string;
  from: QuoteStatus;
  to: QuoteStatus;
  total: number;
};

export async function transitionQuoteStatus({
  supabase,
  user,
  quoteId,
  from,
  to,
  action,
  allowedRoles,
  note,
}: {
  supabase: SupabaseClient;
  user: AppUser;
  quoteId: string;
  from: QuoteStatus;
  to: QuoteStatus;
  action: string;
  allowedRoles: AppRole[];
  note?: string;
}): Promise<QuoteTransitionResult> {
  if (!allowedRoles.includes(user.role)) {
    throw new Error("You do not have permission to perform this quote action.");
  }

  const { data: quote, error: quoteError } = await supabase
    .from("quotes")
    .select("id, quote_number, status, notes, total, requested_by")
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
    metadata:
      to === "approved" && quote.requested_by === user.id
        ? {
            self_approval: true,
            rule: "Admin approved their own quote; allowed but tracked.",
          }
        : undefined,
    supabase,
  });
  if (to === "approved") {
    await pushQuoteToQuoterDraft({
      supabase,
      user,
      quoteId: quote.id,
    });
  }
  await notifySlackQuoteStatusChange({
    supabase,
    user,
    quote,
    action,
    from,
    to,
    note,
  });

  return {
    id: quote.id,
    quote_number: quote.quote_number,
    from,
    to,
    total: Number(quote.total),
  };
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
