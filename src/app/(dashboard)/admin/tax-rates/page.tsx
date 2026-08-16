import Link from "next/link";
import { redirect } from "next/navigation";
import { CalendarDays, MapPinned, Save, X } from "lucide-react";

import { saveTaxRate } from "@/app/(dashboard)/admin/tax-rates/actions";
import { AdminNav } from "@/components/app-nav";
import { Button } from "@/components/ui/button";
import { DatePicker } from "@/components/ui/date-picker";
import { getAdminTaxRates, type AdminTaxRate } from "@/lib/admin/tax-rates";
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
  const editing =
    params.edit && params.edit !== "new"
      ? (taxRates.find((taxRate) => taxRate.id === params.edit) ?? null)
      : null;
  const showEditor = params.edit === "new" || Boolean(editing);

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
            <AdminNav />
          </div>
        </header>

        {params.saved ? (
          <div className="mt-6 rounded-[20px] border border-emerald-100 bg-emerald-50/80 px-5 py-4 text-sm font-medium text-emerald-800 shadow-sm">
            Tax rate saved.
          </div>
        ) : null}

        <section className="mt-6">
          <section className="glass-panel overflow-hidden">
            <div className="slide-panel-header">
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
              <Link href="/admin/tax-rates?edit=new" className="mac-button-primary h-10 px-4">
                New tax rate
              </Link>
              </div>
            </div>

            <div className="master-table-head lg:grid-cols-[1fr_1fr_90px_150px_90px] lg:gap-4">
              <span>City</span>
              <span>County</span>
              <span>Rate</span>
              <span>Effective</span>
              <span>Action</span>
            </div>

            <div className="divide-y divide-border">
              {taxRates.length ? (
                taxRates.map((taxRate) => (
                  <Link
                    key={taxRate.id}
                    href={`/admin/tax-rates?edit=${taxRate.id}`}
                    className={`grid gap-3 px-4 py-4 transition hover:bg-secondary/70 lg:grid-cols-[1fr_1fr_90px_150px_90px] lg:items-center lg:gap-4 ${
                      editing?.id === taxRate.id ? "bg-secondary" : ""
                    }`}
                  >
                    <div className="min-w-0">
                      <h3 className="truncate text-sm font-semibold">
                        {taxRate.city}, {taxRate.state}
                      </h3>
                      <p className="mt-1 text-xs text-muted-foreground lg:hidden">
                        {taxRate.county} County
                      </p>
                    </div>
                    <p className="hidden truncate text-sm text-muted-foreground lg:block">
                      {taxRate.county} County
                    </p>
                    <span className="soft-chip w-fit bg-white/70 text-slate-700 ring-slate-200">
                      {(taxRate.rate * 100).toFixed(3)}%
                    </span>
                    <span className="flex items-center gap-2 text-sm text-muted-foreground">
                      <CalendarDays className="size-3.5" />
                      {taxRate.effective_date}
                    </span>
                    <span className="mac-button-secondary justify-center">
                      Edit
                    </span>
                  </Link>
                ))
              ) : (
                <div className="px-4 py-6 text-sm text-muted-foreground">
                  No tax rates loaded yet.
                </div>
              )}
            </div>
          </section>
        </section>
        <TaxRateSlideOver taxRate={editing} open={showEditor} />
      </div>
    </main>
  );
}

function TaxRateSlideOver({
  taxRate,
  open,
}: {
  taxRate: AdminTaxRate | null;
  open: boolean;
}) {
  if (!open) {
    return null;
  }

  return (
    <aside className="customer-slide-over" aria-label="Tax rate editor">
      <Link
        href="/admin/tax-rates"
        className="customer-slide-backdrop"
        aria-label="Close tax rate editor"
      />
      <div className="customer-slide-panel">
        <div className="slide-panel-header">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-medium text-muted-foreground">
                {taxRate ? "Edit tax area" : "New tax area"}
              </p>
              <h2 className="mt-1 truncate text-2xl font-semibold">
                Sales tax setup
              </h2>
              <p className="mt-1 truncate text-sm text-muted-foreground">
                City, county, state, rate, and effective date.
              </p>
            </div>
            <Link
              href="/admin/tax-rates"
              className="mac-link size-9 shrink-0 px-0"
              aria-label="Close tax rate editor"
            >
              <X className="size-4" />
            </Link>
          </div>
        </div>

        <form action={saveTaxRate} className="grid gap-4 p-4" noValidate>
          <input type="hidden" name="id" value={taxRate?.id ?? ""} />
          <TextField name="city" label="City" defaultValue={taxRate?.city ?? ""} />
          <TextField
            name="county"
            label="County"
            defaultValue={taxRate?.county ?? ""}
          />
          <TextField
            name="state"
            label="State"
            defaultValue={taxRate?.state ?? "CA"}
            maxLength={2}
          />
          <NumberField
            name="rate_percent"
            label="Rate %"
            defaultValue={taxRate ? (taxRate.rate * 100).toFixed(3) : ""}
          />
          <label className="block">
            <span className="text-sm font-medium text-muted-foreground">
              Effective date
            </span>
            <DatePicker
              name="effective_date"
              defaultValue={taxRate?.effective_date ?? today()}
              className="soft-control mt-2 w-full"
              required
            />
          </label>
          <Button type="submit" className="h-11 rounded-md">
            <Save className="size-4" />
            Save tax rate
          </Button>
        </form>
      </div>
    </aside>
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
