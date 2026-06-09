import { redirect } from "next/navigation";
import Link from "next/link";
import { Building2, MapPin, Plus, Search, UsersRound } from "lucide-react";

import {
  createCustomer,
  createJobSite,
} from "@/app/(dashboard)/customers/actions";
import { WorkspaceNav } from "@/components/app-nav";
import { Button } from "@/components/ui/button";
import { getCurrentUser } from "@/lib/auth/current-user";
import {
  getCustomerDeskSummary,
  type CustomerSummary,
  type CustomerPlantOption,
  type JobSiteSummary,
} from "@/lib/customers/customers";

export default async function CustomersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/login");
  }

  const query = await searchParams;
  const search = query.q?.trim() ?? "";
  const summary = await getCustomerDeskSummary(user, search);

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
                  CRM
                </p>
                <h1 className="truncate text-lg font-semibold">
                  Customers & Job Sites
                </h1>
              </div>
            </div>
            <WorkspaceNav role={user.role} />
          </div>
        </header>

        <section className="mt-6 grid gap-6 lg:grid-cols-[0.85fr_1.15fr]">
          <div className="glass-panel p-6 sm:p-8">
            <div className="icon-well text-blue-700">
              <UsersRound className="size-6" />
            </div>
            <h2 className="accent-title mt-6 text-3xl font-semibold tracking-normal">
              Keep customer data close to quoting.
            </h2>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">
              Manage the active customers and job sites available to the quote
              builder. New records are scoped to the current organization and
              logged for audit review.
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-4">
            <Metric label="Customers" value={summary.counts.customers} />
            <Metric label="Active" value={summary.counts.activeCustomers} />
            <Metric label="Job Sites" value={summary.counts.jobSites} />
            <Metric label="Active Sites" value={summary.counts.activeJobSites} />
          </div>
        </section>

        <section className="mt-6 glass-panel p-5 sm:p-6">
          <form className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <label className="block flex-1">
              <span className="text-sm font-medium text-muted-foreground">
                Search customers and job sites
              </span>
              <span className="mt-2 flex items-center gap-2 rounded-[20px] bg-white/70 px-4 ring-1 ring-white/80">
                <Search className="size-4 text-muted-foreground" />
                <input
                  name="q"
                  defaultValue={search}
                  className="min-h-11 flex-1 bg-transparent text-sm outline-none"
                  placeholder="Customer, contact, email, city, or county"
                />
              </span>
            </label>
            <div className="flex gap-2">
              <Button type="submit" className="h-11 rounded-full">
                Search
              </Button>
              {search ? (
                <Link href="/customers" className="mac-button-secondary h-11">
                  Clear
                </Link>
              ) : null}
            </div>
          </form>
        </section>

        <section className="mt-6 grid gap-6 lg:grid-cols-2">
          <CustomerForm plants={summary.plants} />
          <JobSiteForm customers={summary.customers} />
        </section>

        <section className="mt-6 grid gap-6 lg:grid-cols-[1fr_0.9fr]">
          <div className="glass-panel p-5 sm:p-6">
            <SectionHeading
              icon={Building2}
              kicker="Customers"
              title={`${summary.customers.length} records`}
            />
            <div className="mt-5 space-y-3">
              {summary.customers.map((customer) => (
                <CustomerRow key={customer.id} customer={customer} />
              ))}
            </div>
          </div>

          <div className="glass-panel p-5 sm:p-6">
            <SectionHeading
              icon={MapPin}
              kicker="Job Sites"
              title={`${summary.jobSites.length} records`}
            />
            <div className="mt-5 space-y-3">
              {summary.jobSites.map((site) => (
                <JobSiteRow key={site.id} site={site} />
              ))}
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}

function CustomerForm({ plants }: { plants: CustomerPlantOption[] }) {
  return (
    <form action={createCustomer} className="glass-panel p-5 sm:p-6">
      <SectionHeading icon={Plus} kicker="Create" title="Customer" />
      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <Field label="Customer name">
          <input name="name" className="soft-control w-full" required />
        </Field>
        <Field label="Company">
          <input name="company_name" className="soft-control w-full" />
        </Field>
        <Field label="Contact name">
          <input name="contact_name" className="soft-control w-full" />
        </Field>
        <Field label="Email">
          <input name="email" type="email" className="soft-control w-full" />
        </Field>
        <Field label="Phone">
          <input name="phone" className="soft-control w-full" />
        </Field>
        <Field label="Address">
          <input name="address" className="soft-control w-full" />
        </Field>
        <Field label="Payment terms">
          <input name="payment_terms" className="soft-control w-full" />
        </Field>
        <Field label="Default plant">
          <select name="default_plant_id" className="soft-control w-full">
            <option value="">No default</option>
            {plants.map((plant) => (
              <option key={plant.id} value={plant.id}>
                {plant.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Pricing notes">
          <textarea
            name="pricing_notes"
            rows={3}
            className="soft-control w-full resize-none sm:col-span-2"
          />
        </Field>
      </div>
      <Button type="submit" className="mt-5 h-11 rounded-full">
        Save customer
      </Button>
    </form>
  );
}

function JobSiteForm({ customers }: { customers: CustomerSummary[] }) {
  return (
    <form action={createJobSite} className="glass-panel p-5 sm:p-6">
      <SectionHeading icon={MapPin} kicker="Create" title="Job site" />
      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <Field label="Customer">
          <select name="customer_id" className="soft-control w-full" required>
            <option value="">Select customer...</option>
            {customers
              .filter((customer) => customer.is_active)
              .map((customer) => (
                <option key={customer.id} value={customer.id}>
                  {customer.name}
                </option>
              ))}
          </select>
        </Field>
        <Field label="Site name">
          <input name="name" className="soft-control w-full" required />
        </Field>
        <Field label="Street address">
          <input name="line1" className="soft-control w-full" />
        </Field>
        <Field label="City">
          <input name="city" className="soft-control w-full" required />
        </Field>
        <Field label="County">
          <input name="county" className="soft-control w-full" required />
        </Field>
        <Field label="State">
          <input
            name="state"
            className="soft-control w-full"
            defaultValue="CA"
            maxLength={2}
          />
        </Field>
        <Field label="Latitude">
          <input
            name="latitude"
            type="number"
            step="0.0000001"
            className="soft-control w-full"
          />
        </Field>
        <Field label="Longitude">
          <input
            name="longitude"
            type="number"
            step="0.0000001"
            className="soft-control w-full"
          />
        </Field>
      </div>
      <Button type="submit" className="mt-5 h-11 rounded-full">
        Save job site
      </Button>
    </form>
  );
}

function CustomerRow({ customer }: { customer: CustomerSummary }) {
  return (
    <div className="soft-row px-4 py-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">
            {customer.company_name ?? customer.name}
          </p>
          {customer.company_name ? (
            <p className="mt-1 truncate text-xs text-muted-foreground">
              {customer.name}
            </p>
          ) : null}
          <p className="mt-1 text-sm text-muted-foreground">
            {[customer.contact_name, customer.email, customer.phone]
              .filter(Boolean)
              .join(" - ") || "Contact pending"}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {[formatAddress(customer.address), customer.payment_terms]
              .filter(Boolean)
              .join(" - ") || "Address and terms pending"}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {[customer.default_plant_name, customer.pricing_notes]
              .filter(Boolean)
              .join(" - ") || "WM pricing settings pending"}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {customer.pipedrive_person_id
              ? `Pipedrive #${customer.pipedrive_person_id}`
              : "Not linked to Pipedrive yet"}
            {customer.pipedrive_synced_at
              ? ` - synced ${new Date(
                  customer.pipedrive_synced_at,
                ).toLocaleDateString("en-US")}`
              : ""}
          </p>
        </div>
        <StatusPill active={customer.is_active} />
      </div>
      <p className="mt-3 text-xs text-muted-foreground">
        {customer.job_sites.length} job site
        {customer.job_sites.length === 1 ? "" : "s"}
      </p>
      <div className="mt-4 border-t border-border/70 pt-3">
        <p className="text-xs font-medium uppercase text-muted-foreground">
          Recent quote history
        </p>
        {customer.quote_history.length ? (
          <div className="mt-3 space-y-2">
            {customer.quote_history.map((quote) => (
              <Link
                key={quote.id}
                href={`/quotes/${quote.id}`}
                className="flex items-center justify-between gap-3 rounded-xl bg-white/60 px-3 py-2 text-sm transition hover:bg-white"
              >
                <span className="min-w-0 truncate font-medium">
                  {quote.quote_number}
                </span>
                <span className="shrink-0 text-xs text-muted-foreground">
                  {formatStatus(quote.status)} - {formatCurrency(quote.total)}
                </span>
              </Link>
            ))}
          </div>
        ) : (
          <p className="mt-2 text-xs text-muted-foreground">
            No quote history yet.
          </p>
        )}
      </div>
    </div>
  );
}

function JobSiteRow({ site }: { site: JobSiteSummary }) {
  return (
    <div className="soft-row px-4 py-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">{site.name}</p>
          <p className="mt-1 text-sm text-muted-foreground">
            {formatAddress(site.address)}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {site.city}, {site.state} - {site.county}
          </p>
          <p className="mt-1 font-mono text-xs text-muted-foreground">
            {site.latitude ?? "lat pending"}, {site.longitude ?? "lng pending"}
          </p>
        </div>
        <StatusPill active={site.is_active} />
      </div>
    </div>
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

function SectionHeading({
  icon: Icon,
  kicker,
  title,
}: {
  icon: typeof Building2;
  kicker: string;
  title: string;
}) {
  return (
    <div className="flex items-center gap-3">
      <div className="icon-well text-blue-700">
        <Icon className="size-5" />
      </div>
      <div>
        <p className="text-sm font-medium text-muted-foreground">{kicker}</p>
        <h2 className="text-xl font-semibold">{title}</h2>
      </div>
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="text-sm font-medium text-muted-foreground">{label}</span>
      <span className="mt-2 block">{children}</span>
    </label>
  );
}

function StatusPill({ active }: { active: boolean }) {
  return (
    <span
      className={`soft-chip shrink-0 ${
        active
          ? "bg-emerald-50 text-emerald-700 ring-emerald-100"
          : "bg-slate-100 text-slate-600 ring-slate-200"
      }`}
    >
      {active ? "Active" : "Inactive"}
    </span>
  );
}

function formatAddress(address: Record<string, unknown>) {
  const line1 = typeof address.line1 === "string" ? address.line1 : "";
  const city = typeof address.city === "string" ? address.city : "";
  const state = typeof address.state === "string" ? address.state : "";

  return [line1, city, state].filter(Boolean).join(", ") || "Address pending";
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
    maximumFractionDigits: 0,
  }).format(value);
}
