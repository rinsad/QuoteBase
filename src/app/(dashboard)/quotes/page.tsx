import { redirect } from "next/navigation";
import Link from "next/link";
import { Bot, ListChecks, Plus, Send, XCircle } from "lucide-react";

import {
  approveFollowUpDraft,
  cancelFollowUpDraft,
  runFollowUpAgentNow,
} from "@/app/(dashboard)/quotes/actions";
import { QuoteNav } from "@/components/app-nav";
import { getCurrentUser } from "@/lib/auth/current-user";
import { listFollowUpDrafts, type FollowUpDraft } from "@/lib/quotes/follow-up-agent";
import { getQuoteList } from "@/lib/quotes/quotes";
import { QuotePipelineBoard } from "@/app/(dashboard)/quotes/quote-pipeline-board";

export default async function QuotesPage() {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/login");
  }

  const [summary, followUpDrafts] = await Promise.all([
    getQuoteList(user),
    listFollowUpDrafts({ organizationId: user.organization_id }),
  ]);

  return (
    <main className="app-background">
      <div className="mx-auto w-full max-w-7xl">
        <header className="mac-window">
          <div className="mac-toolbar">
            <div className="flex min-w-0 items-center gap-3">
              <div className="mac-controls">
                <span className="mac-control-red" />
                <span className="mac-control-yellow" />
                <span className="mac-control-green" />
              </div>
              <div className="h-5 w-px bg-border/80" />
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-muted-foreground">
                  Quotes
                </p>
                <h1 className="truncate text-lg font-semibold">Pipeline</h1>
              </div>
            </div>
            <QuoteNav />
          </div>
        </header>

        <section className="mt-6 grid gap-6 lg:grid-cols-[0.85fr_1.15fr]">
          <div className="glass-panel p-6 sm:p-8">
            <div className="icon-well text-blue-700">
              <ListChecks className="size-6" />
            </div>
            <h2 className="accent-title mt-6 text-3xl font-semibold tracking-normal">
              Work the quote pipeline.
            </h2>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">
              Move quotes from draft to sent, follow-up, won, or lost with
              tenant-scoped customer, job-site, owner, and total information.
            </p>
            <Link href="/quotes/new" className="mac-button-primary mt-6 h-11 w-fit">
              <Plus className="size-4" />
              New Quote
            </Link>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <Metric label="Total" value={summary.counts.total} />
            <Metric label="Drafts" value={summary.counts.drafts} />
            <Metric label="Sent" value={summary.counts.sent} />
            <Metric label="Follow-up" value={summary.counts.followUp} />
            <Metric label="Win rate" value={`${summary.counts.winRate.toFixed(0)}%`} />
            <Metric label="Won" value={summary.counts.won} />
            <Metric label="Lost" value={summary.counts.lost} />
          </div>
        </section>

        <section className="mt-6 glass-panel p-5 sm:p-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-sm font-medium text-muted-foreground">
                Sales pipeline
              </p>
              <h2 className="text-2xl font-semibold tracking-normal">
                Kanban board
              </h2>
            </div>
            <Link href="/quotes/new" className="mac-button-primary h-10 w-fit">
              <Plus className="size-4" />
              New Quote
            </Link>
          </div>

          <div className="mt-6">
            {summary.quotes.length ? (
              <QuotePipelineBoard quotes={summary.quotes} />
            ) : (
              <div className="soft-row px-4 py-10 text-center">
                <p className="text-sm font-medium">No quotes yet.</p>
                <p className="mt-2 text-sm text-muted-foreground">
                  Create the first draft quote to start building the pipeline.
                </p>
                <Link
                  href="/quotes/new"
                  className="mac-button-primary mx-auto mt-5 h-10 w-fit"
                >
                  <Plus className="size-4" />
                  New Quote
                </Link>
              </div>
            )}
          </div>
        </section>

        <section id="follow-up-queue" className="mt-6 glass-panel p-5 sm:p-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex items-start gap-3">
              <div className="icon-well text-primary">
                <Bot className="size-5" />
              </div>
              <div>
                <p className="text-sm font-medium text-muted-foreground">
                  AI follow-up agent
                </p>
                <h2 className="text-2xl font-semibold tracking-normal">
                  Approval queue
                </h2>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
                  Auto-send is off. Review each context-aware draft, then approve
                  to send by Gmail. Big quotes are escalated to the owner.
                </p>
              </div>
            </div>
            <form action={runFollowUpAgentNow}>
              <button type="submit" className="mac-link h-10 rounded-full">
                Generate drafts
              </button>
            </form>
          </div>

          <div className="mt-6 space-y-4">
            {followUpDrafts.length ? (
              followUpDrafts.map((draft) => (
                <FollowUpDraftCard key={draft.id} draft={draft} />
              ))
            ) : (
              <div className="soft-row px-4 py-10 text-center">
                <p className="text-sm font-medium">No follow-up drafts waiting.</p>
                <p className="mt-2 text-sm text-muted-foreground">
                  The scheduler creates drafts for open quotes past their follow-up date.
                </p>
              </div>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}

function FollowUpDraftCard({ draft }: { draft: FollowUpDraft }) {
  const quote = relationOne(draft.quotes);
  const customer = relationOne(quote?.customers ?? null);
  const owner = relationOne(quote?.users ?? null);
  const recipient = draft.recipient_email ?? draft.recipient_phone ?? "Missing recipient";

  return (
    <div className="soft-row p-4">
      <div className="grid gap-4 lg:grid-cols-[1fr_auto]">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="soft-chip bg-secondary text-secondary-foreground ring-border">
              {formatStatus(draft.tone)}
            </span>
            <span className="soft-chip bg-card text-muted-foreground ring-border">
              Day {draft.stage_day}
            </span>
            {draft.big_quote_escalation ? (
              <span className="soft-chip bg-amber-50 text-amber-800 ring-amber-100">
                Owner escalation
              </span>
            ) : null}
            <span className="soft-chip bg-card text-muted-foreground ring-border">
              {draft.channel.toUpperCase()}
            </span>
          </div>
          <h3 className="mt-3 text-lg font-semibold">{draft.subject}</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            {quote?.quote_number ?? "Quote"} · {customer?.name ?? "Unknown customer"} ·{" "}
            {owner?.full_name ?? "Unknown owner"} · {recipient}
          </p>
          <pre className="mt-4 max-h-64 overflow-auto whitespace-pre-wrap rounded-md border border-border bg-background p-4 text-sm leading-6">
            {draft.body}
          </pre>
          {draft.failure_reason ? (
            <p className="mt-3 rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700 ring-1 ring-rose-100">
              {draft.failure_reason}
            </p>
          ) : null}
        </div>
        <div className="flex flex-col gap-2 lg:w-44">
          <Link href={`/quotes/${draft.quote_id}`} className="mac-link h-10 justify-center rounded-full">
            Open quote
          </Link>
          <form action={approveFollowUpDraft}>
            <input type="hidden" name="draft_id" value={draft.id} />
            <button
              type="submit"
              className="mac-button-primary h-10 w-full rounded-full"
            >
              <Send className="size-4" />
              Approve/send
            </button>
          </form>
          <form action={cancelFollowUpDraft}>
            <input type="hidden" name="draft_id" value={draft.id} />
            <button
              type="submit"
              className="mac-link h-10 w-full justify-center rounded-full text-rose-700"
            >
              <XCircle className="size-4" />
              Cancel
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="glass-tile min-h-32 p-5">
      <p className="text-xs font-medium uppercase text-muted-foreground">
        {label}
      </p>
      <p className="mt-4 text-4xl font-semibold">{value}</p>
    </div>
  );
}

function formatStatus(status: string) {
  return status
    .split("_")
    .map((part) => part[0]?.toUpperCase() + part.slice(1))
    .join(" ");
}

function relationOne<T>(value: T | T[] | null): T | null {
  return Array.isArray(value) ? (value[0] ?? null) : value;
}
