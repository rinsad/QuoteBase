import Link from "next/link";
import { redirect } from "next/navigation";
import { FilePlus2, ListChecks } from "lucide-react";

import { getCurrentUser } from "@/lib/auth/current-user";
import { getQuoteList, type QuoteStatus } from "@/lib/quotes/quotes";

export default async function QuotesPage() {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/login");
  }

  const summary = await getQuoteList(user);

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
                <h1 className="truncate text-lg font-semibold">Quote Desk</h1>
              </div>
            </div>
            <div className="flex flex-wrap items-center justify-end gap-2">
              <Link href="/quotes/new" className="mac-button-primary h-9">
                <FilePlus2 className="size-4" />
                New quote
              </Link>
              <Link href="/dashboard" className="mac-link">
                Dashboard
              </Link>
            </div>
          </div>
        </header>

        <section className="mt-6 grid gap-6 lg:grid-cols-[0.85fr_1.15fr]">
          <div className="glass-panel p-6 sm:p-8">
            <div className="icon-well text-blue-700">
              <ListChecks className="size-6" />
            </div>
            <h2 className="accent-title mt-6 text-3xl font-semibold tracking-normal">
              Review active quotes.
            </h2>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">
              Drafts and submitted quotes are shown with tenant-scoped customer,
              job-site, owner, and total information.
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
            <Metric label="Total" value={summary.counts.total} />
            <Metric label="Drafts" value={summary.counts.drafts} />
            <Metric label="Pending" value={summary.counts.pendingApproval} />
            <Metric label="Approved" value={summary.counts.approved} />
            <Metric label="Sent" value={summary.counts.sent} />
          </div>
        </section>

        <section className="mt-6 glass-panel p-5 sm:p-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-sm font-medium text-muted-foreground">
                Recent quotes
              </p>
              <h2 className="text-2xl font-semibold tracking-normal">
                Last 50 active records
              </h2>
            </div>
          </div>

          <div className="mt-6 space-y-3">
            {summary.quotes.length ? (
              summary.quotes.map((quote) => (
                <Link
                  key={quote.id}
                  href={`/quotes/${quote.id}`}
                  className="soft-row grid gap-3 px-4 py-4 transition hover:bg-white/80 md:grid-cols-[1fr_1fr_auto_auto] md:items-center"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold">
                      {quote.quote_number}
                    </p>
                    <p className="mt-1 truncate text-sm text-muted-foreground">
                      {quote.customer_name}
                    </p>
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">
                      {quote.job_site_name}
                    </p>
                    <p className="mt-1 truncate text-xs text-muted-foreground">
                      {quote.job_site_city || "Location pending"} -{" "}
                      {quote.requested_by_name}
                    </p>
                  </div>
                  <StatusPill status={quote.status} />
                  <div className="text-left md:text-right">
                    <p className="text-base font-semibold">
                      {formatCurrency(quote.total)}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {formatDate(quote.created_at)}
                    </p>
                  </div>
                </Link>
              ))
            ) : (
              <div className="soft-row px-4 py-10 text-center">
                <p className="text-sm font-medium">No quotes yet.</p>
                <p className="mt-2 text-sm text-muted-foreground">
                  Create the first draft quote to start building the pipeline.
                </p>
              </div>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="glass-tile min-h-32 p-5">
      <p className="text-xs font-medium uppercase text-muted-foreground">
        {label}
      </p>
      <p className="mt-4 text-4xl font-semibold">{value}</p>
    </div>
  );
}

function StatusPill({ status }: { status: QuoteStatus }) {
  const tone = {
    draft: "bg-blue-50 text-blue-700 ring-blue-100",
    pending_approval: "bg-amber-50 text-amber-700 ring-amber-100",
    approved: "bg-emerald-50 text-emerald-700 ring-emerald-100",
    rejected: "bg-rose-50 text-rose-700 ring-rose-100",
    sent: "bg-cyan-50 text-cyan-700 ring-cyan-100",
    viewed: "bg-indigo-50 text-indigo-700 ring-indigo-100",
    accepted: "bg-lime-50 text-lime-700 ring-lime-100",
    declined: "bg-orange-50 text-orange-700 ring-orange-100",
    expired: "bg-slate-100 text-slate-600 ring-slate-200",
  } satisfies Record<QuoteStatus, string>;

  return (
    <span className={`soft-chip shrink-0 ${tone[status]}`}>
      {formatStatus(status)}
    </span>
  );
}

function formatStatus(status: string) {
  return status
    .split("_")
    .map((part) => part[0]?.toUpperCase() + part.slice(1))
    .join(" ");
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
