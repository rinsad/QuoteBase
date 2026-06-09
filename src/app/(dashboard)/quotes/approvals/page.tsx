import Link from "next/link";
import { redirect } from "next/navigation";
import { CheckCircle2, ClipboardCheck, XCircle } from "lucide-react";

import {
  approveQuote,
  rejectQuote,
  requestQuoteChanges,
} from "@/app/(dashboard)/quotes/[id]/actions";
import { QuoteNav } from "@/components/app-nav";
import { Button } from "@/components/ui/button";
import { getCurrentUser } from "@/lib/auth/current-user";
import {
  getApprovalQueue,
  type ApprovalQueueFlag,
} from "@/lib/quotes/approval-queue";

export default async function ApprovalQueuePage() {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/login");
  }

  if (user.role !== "admin") {
    redirect("/quotes");
  }

  const quotes = await getApprovalQueue(user);

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
                <h1 className="truncate text-lg font-semibold">
                  Approval Queue
                </h1>
              </div>
            </div>
            <QuoteNav userRole={user.role} />
          </div>
        </header>

        <section className="mt-6 glass-panel p-5 sm:p-6">
          <div className="flex items-center gap-3">
            <div className="icon-well text-emerald-700">
              <ClipboardCheck className="size-6" />
            </div>
            <div>
              <p className="text-sm font-medium text-muted-foreground">
                Owner Review
              </p>
              <h2 className="accent-title text-3xl font-semibold tracking-normal">
                {quotes.length} quotes waiting
              </h2>
            </div>
          </div>

          <div className="mt-6 space-y-3">
            {quotes.length ? (
              quotes.map((quote) => {
                const approveAction = approveQuote.bind(null, quote.id);
                const rejectAction = rejectQuote.bind(null, quote.id);
                const requestChangesAction = requestQuoteChanges.bind(
                  null,
                  quote.id,
                );

                return (
                <article
                  key={quote.id}
                  className="soft-row grid gap-4 px-4 py-4 xl:grid-cols-[0.9fr_0.95fr_0.8fr_1fr] xl:items-center"
                >
                  <div className="min-w-0">
                    <Link
                      href={`/quotes/${quote.id}`}
                      className="truncate text-sm font-semibold text-foreground hover:text-blue-700"
                    >
                      {quote.quote_number}
                    </Link>
                    <p className="mt-1 truncate text-sm text-muted-foreground">
                      {quote.customer_name}
                    </p>
                    <p className="mt-2 text-base font-semibold">
                      {formatCurrency(quote.total)}
                    </p>
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">
                      {quote.job_site_name}
                    </p>
                    <p className="mt-1 truncate text-xs text-muted-foreground">
                      Submitted by {quote.estimator_name}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm font-semibold">
                      Margin{" "}
                      {quote.margin_pct === null
                        ? "pending"
                        : `${quote.margin_pct.toFixed(1)}%`}
                    </p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {quote.flags.length ? (
                        quote.flags.map((flag) => (
                          <FlagPill key={flag} flag={flag} />
                        ))
                      ) : (
                        <span className="soft-chip bg-emerald-50 text-emerald-700 ring-emerald-100">
                          No flags
                        </span>
                      )}
                    </div>
                    <p className="mt-2 text-xs text-muted-foreground">
                      Submitted {formatDate(quote.submitted_at)}
                    </p>
                  </div>
                  <div className="grid gap-2">
                    <form action={approveAction}>
                      <Button
                        type="submit"
                        className="h-9 w-full rounded-full bg-emerald-600 text-white hover:bg-emerald-700"
                      >
                        <CheckCircle2 className="size-4" />
                        Approve
                      </Button>
                    </form>
                    <form
                      action={requestChangesAction}
                      className="grid gap-2 sm:grid-cols-[1fr_auto]"
                    >
                      <input
                        name="change_request_comment"
                        className="soft-control min-h-9 w-full px-3 text-xs"
                        placeholder="Change request comment"
                        required
                      />
                      <Button
                        type="submit"
                        variant="outline"
                        className="h-9 rounded-full bg-amber-50 text-amber-800 hover:bg-amber-100"
                      >
                        Request
                      </Button>
                    </form>
                    <form action={rejectAction}>
                      <Button
                        type="submit"
                        variant="outline"
                        className="h-9 w-full rounded-full bg-rose-50 text-rose-700 hover:bg-rose-100"
                      >
                        <XCircle className="size-4" />
                        Reject
                      </Button>
                    </form>
                  </div>
                </article>
                );
              })
            ) : (
              <div className="soft-row px-4 py-10 text-center">
                <p className="text-sm font-medium">No pending approvals.</p>
                <p className="mt-2 text-sm text-muted-foreground">
                  Submitted quotes will appear here oldest first.
                </p>
              </div>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}

function FlagPill({ flag }: { flag: ApprovalQueueFlag }) {
  const labels = {
    low_margin: "Low margin",
    manual_override: "Manual override",
    new_customer: "New customer",
  } satisfies Record<ApprovalQueueFlag, string>;
  const tones = {
    low_margin: "bg-rose-50 text-rose-700 ring-rose-100",
    manual_override: "bg-amber-50 text-amber-800 ring-amber-100",
    new_customer: "bg-blue-50 text-blue-700 ring-blue-100",
  } satisfies Record<ApprovalQueueFlag, string>;

  return <span className={`soft-chip ${tones[flag]}`}>{labels[flag]}</span>;
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(value);
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(value));
}
