import Link from "next/link";
import { redirect } from "next/navigation";
import { Truck } from "lucide-react";

import { QuoteNav } from "@/components/app-nav";
import { getCurrentUser } from "@/lib/auth/current-user";
import { getApprovedQuoteQueue } from "@/lib/quotes/approved-queue";

export default async function ApprovedQuoteQueuePage() {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/login");
  }

  const quotes = await getApprovedQuoteQueue(user);

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
                  Approved Queue
                </h1>
              </div>
            </div>
            <QuoteNav userRole={user.role} />
          </div>
        </header>

        <section className="mt-6 glass-panel p-5 sm:p-6">
          <div className="flex items-center gap-3">
            <div className="icon-well text-emerald-700">
              <Truck className="size-6" />
            </div>
            <div>
              <p className="text-sm font-medium text-muted-foreground">
                Delivery Planning
              </p>
              <h2 className="accent-title text-3xl font-semibold tracking-normal">
                {quotes.length} approved quotes ready
              </h2>
            </div>
          </div>

          <div className="mt-6 space-y-3">
            {quotes.length ? (
              quotes.map((quote) => (
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
                      {quote.estimator_name}
                    </p>
                  </div>
                  <span className="soft-chip shrink-0 bg-emerald-50 text-emerald-700 ring-emerald-100">
                    Approved
                  </span>
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
                <p className="text-sm font-medium">No approved quotes ready.</p>
                <p className="mt-2 text-sm text-muted-foreground">
                  Quotes approved by John, Judd, or an account manager will
                  appear here oldest first.
                </p>
              </div>
            )}
          </div>
        </section>
      </div>
    </main>
  );
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
