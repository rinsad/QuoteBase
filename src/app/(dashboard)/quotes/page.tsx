import Link from "next/link";
import { redirect } from "next/navigation";
import { Plus } from "lucide-react";

import { QuotePipelineBoard } from "@/app/(dashboard)/quotes/quote-pipeline-board";
import { QuoteNav } from "@/components/app-nav";
import { getCurrentUser } from "@/lib/auth/current-user";
import { getQuoteList } from "@/lib/quotes/quotes";

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
                <h1 className="truncate text-lg font-semibold">Pipeline</h1>
              </div>
            </div>
            <QuoteNav />
          </div>
        </header>

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
      </div>
    </main>
  );
}
