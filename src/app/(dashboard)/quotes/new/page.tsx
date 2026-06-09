import { redirect } from "next/navigation";
import { FilePlus2 } from "lucide-react";

import { QuoteDraftForm } from "@/app/(dashboard)/quotes/new/quote-draft-form";
import { QuoteNav } from "@/components/app-nav";
import { getCurrentUser } from "@/lib/auth/current-user";
import { getNewQuoteContext } from "@/lib/quotes/new-quote";

export default async function NewQuotePage() {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/login");
  }

  const context = await getNewQuoteContext(user);

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
                  New Draft Quote
                </h1>
              </div>
            </div>
            <QuoteNav userRole={user.role} />
          </div>
        </header>

        <section className="mt-6 grid gap-6 lg:grid-cols-[0.85fr_1.15fr]">
          <div className="glass-panel p-6 sm:p-8">
            <div className="icon-well text-blue-700">
              <FilePlus2 className="size-6" />
            </div>
            <h2 className="accent-title mt-6 text-3xl font-semibold tracking-normal">
              Create a priced draft.
            </h2>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">
              This quote builder saves one material line, calculates pricing
              from tenant config, applies tax, chooses a vehicle/load plan, and
              writes an audit log entry.
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <Metric label="Customers" value={context.customers.length} />
            <Metric label="Materials" value={context.materials.length} />
            <Metric label="Tax Areas" value={context.taxRates.length} />
            <Metric label="Vehicles" value={context.vehicleTypes.length} />
          </div>
        </section>

        {!context.quoteCreationEnabled ? (
          <div className="mt-6 rounded-[20px] border border-amber-100 bg-amber-50/80 px-5 py-4 text-sm font-medium text-amber-800 shadow-sm">
            Quote creation is currently disabled for this organization.
          </div>
        ) : null}

        <section className="mt-6">
          <QuoteDraftForm context={context} userRole={user.role} />
        </section>
      </div>
    </main>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="glass-tile min-h-36 p-5">
      <p className="text-xs font-medium uppercase text-muted-foreground">
        {label}
      </p>
      <p className="mt-4 text-4xl font-semibold">{value}</p>
    </div>
  );
}
