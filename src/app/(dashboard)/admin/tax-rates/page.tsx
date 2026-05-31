import Link from "next/link";
import { redirect } from "next/navigation";
import { CalendarDays, MapPinned, Percent, Save } from "lucide-react";

import { saveTaxRate } from "@/app/(dashboard)/admin/tax-rates/actions";
import { Button } from "@/components/ui/button";
import { getAdminTaxRates } from "@/lib/admin/tax-rates";
import { getCurrentUser } from "@/lib/auth/current-user";

export default async function AdminTaxRatesPage({
  searchParams,
}: {
  searchParams: Promise<{ edit?: string; saved?: string }>;
}) {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/login");
  }

  if (user.role !== "admin") {
    redirect("/dashboard");
  }

  const [params, taxRates] = await Promise.all([
    searchParams,
    getAdminTaxRates(user.organization_id),
  ]);
  const editing = taxRates.find((taxRate) => taxRate.id === params.edit);

  return (
    <main className="app-background">
      <div className="mx-auto w-full max-w-6xl">
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
                  Admin
                </p>
                <h1 className="truncate text-lg font-semibold">Tax Rates</h1>
              </div>
            </div>
            <div className="flex flex-wrap items-center justify-end gap-2">
              <Link href="/admin/material-prices" className="mac-link">
                Material prices
              </Link>
              <Link href="/admin/pricing" className="mac-link">
                Pricing
              </Link>
              <Link href="/admin/plants" className="mac-link">
                Materials
              </Link>
              <Link href="/dashboard" className="mac-link">
                Dashboard
              </Link>
            </div>
          </div>
        </header>

        {params.saved ? (
          <div className="mt-6 rounded-[20px] border border-emerald-100 bg-emerald-50/80 px-5 py-4 text-sm font-medium text-emerald-800 shadow-sm">
            Tax rate saved.
          </div>
        ) : null}

        <section className="mt-6 grid gap-6 lg:grid-cols-[0.85fr_1.15fr]">
          <form action={saveTaxRate} className="glass-panel p-5 sm:p-6">
            <div className="flex items-center gap-3">
              <div className="icon-well text-blue-700">
                <Percent className="size-6" />
              </div>
              <div>
                <p className="text-sm font-medium text-muted-foreground">
                  {editing ? "Edit Area" : "New Area"}
                </p>
                <h2 className="accent-title text-2xl font-semibold tracking-normal">
                  Sales tax setup
                </h2>
              </div>
            </div>

            <input type="hidden" name="id" value={editing?.id ?? ""} />

            <div className="mt-6 grid gap-4 sm:grid-cols-2">
              <TextField
                name="city"
                label="City"
                defaultValue={editing?.city ?? ""}
              />
              <TextField
                name="county"
                label="County"
                defaultValue={editing?.county ?? ""}
              />
              <TextField
                name="state"
                label="State"
                defaultValue={editing?.state ?? "CA"}
                maxLength={2}
              />
              <NumberField
                name="rate_percent"
                label="Rate %"
                defaultValue={editing ? (editing.rate * 100).toFixed(3) : ""}
              />
              <label className="block sm:col-span-2">
                <span className="text-sm font-medium text-muted-foreground">
                  Effective date
                </span>
                <input
                  name="effective_date"
                  type="date"
                  defaultValue={editing?.effective_date ?? today()}
                  className="soft-control mt-2 w-full"
                  required
                />
              </label>
            </div>

            <div className="mt-6 flex flex-wrap justify-end gap-2">
              {editing ? (
                <Link href="/admin/tax-rates" className="mac-button-secondary">
                  New rate
                </Link>
              ) : null}
              <Button type="submit" className="h-11 rounded-full">
                <Save className="size-4" />
                Save tax rate
              </Button>
            </div>
          </form>

          <section className="glass-panel p-5 sm:p-6">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">
                  Active Dataset
                </p>
                <h2 className="accent-title text-2xl font-semibold tracking-normal">
                  {taxRates.length} tax areas
                </h2>
              </div>
              <div className="flex items-center gap-2 rounded-full bg-blue-50 px-3 py-1.5 text-sm font-medium text-blue-700 ring-1 ring-blue-100">
                <MapPinned className="size-4" />
                Tenant scoped
              </div>
            </div>

            <div className="mt-6 space-y-3">
              {taxRates.length ? (
                taxRates.map((taxRate) => (
                  <article
                    key={taxRate.id}
                    className="soft-row grid gap-4 px-4 py-4 sm:grid-cols-[1fr_auto] sm:items-center"
                  >
                    <div>
                      <h3 className="font-semibold">
                        {taxRate.city}, {taxRate.state}
                      </h3>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {taxRate.county} County
                      </p>
                      <div className="mt-3 flex flex-wrap gap-2 text-xs font-medium text-muted-foreground">
                        <span className="soft-chip bg-white/70 text-slate-700 ring-slate-200">
                          {(taxRate.rate * 100).toFixed(3)}%
                        </span>
                        <span className="soft-chip bg-white/70 text-slate-700 ring-slate-200">
                          <CalendarDays className="size-3.5" />
                          {taxRate.effective_date}
                        </span>
                      </div>
                    </div>
                    <Link
                      href={`/admin/tax-rates?edit=${taxRate.id}`}
                      className="mac-button-secondary justify-center"
                    >
                      Edit
                    </Link>
                  </article>
                ))
              ) : (
                <div className="soft-row px-4 py-6 text-sm text-muted-foreground">
                  No tax rates loaded yet.
                </div>
              )}
            </div>
          </section>
        </section>
      </div>
    </main>
  );
}

function TextField({
  name,
  label,
  defaultValue,
  maxLength,
}: {
  name: string;
  label: string;
  defaultValue: string;
  maxLength?: number;
}) {
  return (
    <label className="block">
      <span className="text-sm font-medium text-muted-foreground">{label}</span>
      <input
        name={name}
        type="text"
        defaultValue={defaultValue}
        maxLength={maxLength}
        className="soft-control mt-2 w-full"
        required
      />
    </label>
  );
}

function NumberField({
  name,
  label,
  defaultValue,
}: {
  name: string;
  label: string;
  defaultValue: string;
}) {
  return (
    <label className="block">
      <span className="text-sm font-medium text-muted-foreground">{label}</span>
      <input
        name={name}
        type="number"
        min="0"
        max="25"
        step="0.001"
        defaultValue={defaultValue}
        className="soft-control mt-2 w-full"
        required
      />
    </label>
  );
}

function today() {
  return new Date().toISOString().slice(0, 10);
}
