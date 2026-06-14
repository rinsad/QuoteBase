import { redirect } from "next/navigation";
import Link from "next/link";
import {
  AlertCircle,
  ArrowUpRight,
  Building2,
  CheckCircle2,
  Plus,
  Search,
  UsersRound,
  X,
} from "lucide-react";

import {
  CustomerForm,
  JobSiteForm,
} from "@/app/(dashboard)/customers/customer-forms";
import { getCurrentUser } from "@/lib/auth/current-user";
import {
  getCustomerDeskSummary,
  type CustomerSummary,
  type JobSiteSummary,
} from "@/lib/customers/customers";

export default async function CustomersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; customer?: string; page?: string }>;
}) {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/login");
  }

  const query = await searchParams;
  const search = query.q?.trim() ?? "";
  const summary = await getCustomerDeskSummary(user, search);
  const pageSize = 25;
  const requestedPage = Number(query.page ?? "1");
  const totalPages = Math.max(1, Math.ceil(summary.customers.length / pageSize));
  const currentPage =
    Number.isInteger(requestedPage) && requestedPage > 0
      ? Math.min(requestedPage, totalPages)
      : 1;
  const visibleCustomers = summary.customers.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize,
  );
  const selectedCustomer =
    query.customer
      ? (summary.customers.find((customer) => customer.id === query.customer) ??
        null)
      : null;
  const pipedriveLinked = summary.customers.filter(
    (customer) => customer.pipedrive_person_id,
  ).length;

  return (
    <>
      <div className="mb-5 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-sm font-semibold uppercase text-muted-foreground">
            CRM workspace
          </p>
          <h1 className="mt-1 text-3xl font-semibold tracking-normal sm:text-4xl">
            Customers
          </h1>
        </div>
        <div className="flex flex-wrap gap-2">
          <a href="#add-customer" className="mac-button-primary h-11">
            <Plus className="size-4" />
            Add customer
          </a>
        </div>
      </div>

      <section className="space-y-4">
        <div className="glass-panel overflow-hidden">
          <div className="border-b border-border bg-[#fbfcf8] p-4">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <div className="flex items-center gap-3">
                  <div className="icon-well text-primary">
                    <Building2 className="size-5" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">
                      Customer desk
                    </p>
                    <h2 className="text-2xl font-semibold">
                      {summary.customers.length} records
                    </h2>
                  </div>
                </div>
                <div className="mt-4 grid gap-2 text-xs text-muted-foreground sm:grid-cols-3">
                  <DeskStat label="Active" value={summary.counts.activeCustomers} />
                  <DeskStat label="Job sites" value={summary.counts.jobSites} />
                  <DeskStat label="Pipedrive linked" value={pipedriveLinked} />
                </div>
              </div>

              <form className="w-full max-w-xl">
                <label className="sr-only" htmlFor="customer-search">
                  Search customers
                </label>
                <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
                  <span className="soft-input min-h-11">
                    <Search className="size-4 text-muted-foreground" />
                    <input
                      id="customer-search"
                      name="q"
                      defaultValue={search}
                      className="min-w-0 flex-1 bg-transparent text-sm outline-none"
                      placeholder="Customer, contact, email, city, or county"
                    />
                  </span>
                  <button type="submit" className="mac-button-primary h-11">
                    Search
                  </button>
                </div>
                {search ? (
                  <Link
                    href="/customers"
                    className="mt-2 inline-flex text-xs font-medium text-primary hover:text-foreground"
                  >
                    Clear search
                  </Link>
                ) : null}
              </form>
            </div>
          </div>

          <div className="hidden border-b border-border bg-white px-4 py-3 text-xs font-semibold uppercase text-muted-foreground lg:grid lg:grid-cols-[minmax(210px,1.15fr)_minmax(180px,0.9fr)_120px_150px_150px_80px] lg:gap-4">
            <span>Customer</span>
            <span>Contact</span>
            <span>Job sites</span>
            <span>Pricing</span>
            <span>Last quote</span>
            <span>Status</span>
          </div>

          <div className="divide-y divide-border">
            {visibleCustomers.length ? (
              visibleCustomers.map((customer) => (
                <CustomerTableRow
                  key={customer.id}
                  customer={customer}
                  href={customerHref(customer.id, search, currentPage)}
                  selected={selectedCustomer?.id === customer.id}
                />
              ))
            ) : (
              <EmptyState text="No customers match this search." />
            )}
          </div>

          <PaginationBar
            currentPage={currentPage}
            totalPages={totalPages}
            totalRecords={summary.customers.length}
            pageSize={pageSize}
            search={search}
          />
        </div>

      </section>

      <CustomerSlideOver
        customer={selectedCustomer}
        search={search}
        currentPage={currentPage}
      />

      <CrudModal id="add-customer" title="Add customer">
        <CustomerForm plants={summary.plants} variant="bare" />
      </CrudModal>

      <CrudModal id="add-job-site" title="Add job site">
        <JobSiteForm
          customers={summary.customers}
          defaultCustomerId={selectedCustomer?.id}
          locationOptions={summary.locationOptions}
          variant="bare"
        />
      </CrudModal>
    </>
  );
}

function CustomerTableRow({
  customer,
  href,
  selected,
}: {
  customer: CustomerSummary;
  href: string;
  selected: boolean;
}) {
  const displayName = customer.company_name ?? customer.name;
  const contact = [customer.contact_name, customer.email, customer.phone]
    .filter(Boolean)
    .join(" - ");
  const lastQuote = customer.quote_history[0];

  return (
    <Link
      href={href}
      className={`grid gap-3 px-4 py-4 transition hover:bg-secondary/70 lg:grid-cols-[minmax(210px,1.15fr)_minmax(180px,0.9fr)_120px_150px_150px_80px] lg:items-center lg:gap-4 ${
        selected ? "bg-[#ecf2ed]" : "bg-white"
      }`}
    >
      <div className="min-w-0">
        <div className="flex min-w-0 items-center gap-2">
          <p className="truncate text-sm font-semibold">{displayName}</p>
          {selected ? (
            <span className="rounded-full bg-primary px-2 py-0.5 text-[11px] font-semibold text-white">
              Selected
            </span>
          ) : null}
        </div>
        {customer.company_name ? (
          <p className="mt-1 truncate text-xs text-muted-foreground">
            {customer.name}
          </p>
        ) : null}
        <p className="mt-1 truncate text-xs text-muted-foreground">
          {formatAddress(customer.address)}
        </p>
      </div>

      <p className="min-w-0 truncate text-sm text-muted-foreground">
        {contact || "Contact pending"}
      </p>

      <span className="text-sm font-medium">
        {customer.job_sites.length} site{customer.job_sites.length === 1 ? "" : "s"}
      </span>

      <HealthLabel
        good={hasPricingContext(customer)}
        text={
          customer.default_plant_name ??
          customer.pricing_notes ??
          "Needs pricing"
        }
      />

      <span className="truncate text-sm text-muted-foreground">
        {lastQuote
          ? `${lastQuote.quote_number} - ${formatCurrency(lastQuote.total)}`
          : "No history"}
      </span>

      <StatusPill active={customer.is_active} />
    </Link>
  );
}

function PaginationBar({
  currentPage,
  totalPages,
  totalRecords,
  pageSize,
  search,
}: {
  currentPage: number;
  totalPages: number;
  totalRecords: number;
  pageSize: number;
  search: string;
}) {
  const start = totalRecords === 0 ? 0 : (currentPage - 1) * pageSize + 1;
  const end = Math.min(currentPage * pageSize, totalRecords);

  return (
    <div className="flex flex-col gap-3 border-t border-border bg-[#fbfcf8] px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
      <p className="text-sm text-muted-foreground">
        Showing {start}-{end} of {totalRecords} customers
      </p>
      <div className="flex items-center gap-2">
        <Link
          href={pageHref(search, Math.max(1, currentPage - 1))}
          className={`mac-link h-9 px-3 ${
            currentPage === 1 ? "pointer-events-none opacity-50" : ""
          }`}
          aria-disabled={currentPage === 1}
        >
          Previous
        </Link>
        <span className="rounded-md bg-white px-3 py-2 text-sm font-medium ring-1 ring-border">
          Page {currentPage} of {totalPages}
        </span>
        <Link
          href={pageHref(search, Math.min(totalPages, currentPage + 1))}
          className={`mac-link h-9 px-3 ${
            currentPage === totalPages ? "pointer-events-none opacity-50" : ""
          }`}
          aria-disabled={currentPage === totalPages}
        >
          Next
        </Link>
      </div>
    </div>
  );
}

function CustomerSlideOver({
  customer,
  search,
  currentPage,
}: {
  customer: CustomerSummary | null;
  search: string;
  currentPage: number;
}) {
  if (!customer) {
    return null;
  }

  const displayName = customer.company_name ?? customer.name;

  return (
    <aside className="customer-slide-over" aria-label="Selected customer details">
      <Link
        href={customersHref(search)}
        className="customer-slide-backdrop"
        aria-label="Close selected customer details"
      />
      <div className="customer-slide-panel">
      <div className="border-b border-border bg-[#fbfcf8] p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm font-medium text-muted-foreground">
              Selected customer
            </p>
            <h2 className="mt-1 truncate text-2xl font-semibold">
              {displayName}
            </h2>
            <p className="mt-1 truncate text-sm text-muted-foreground">
              {customer.contact_name ?? "Contact pending"}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <StatusPill active={customer.is_active} />
            <Link
              href={customersHref(search)}
              className="mac-link size-9 px-0"
              aria-label="Close selected customer details"
            >
              <X className="size-4" />
            </Link>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <Link
            href={`/quotes/new?customer=${customer.id}`}
            className="mac-button-primary h-10 px-4"
          >
            Create quote
          </Link>
          <a href="#add-job-site" className="mac-link h-10 px-4">
            Add site
          </a>
          <a href="#add-customer" className="mac-link h-10 px-4">
            Add customer
          </a>
        </div>
      </div>

      <div className="grid gap-4 p-4">
        <DetailGroup title="Account details">
          <DetailLine label="Email" value={customer.email ?? "Not added"} />
          <DetailLine label="Phone" value={customer.phone ?? "Not added"} />
          <DetailLine label="Address" value={formatAddress(customer.address)} />
          <DetailLine
            label="Payment terms"
            value={customer.payment_terms ?? "Not set"}
          />
          <DetailLine
            label="Pipedrive"
            value={
              customer.pipedrive_person_id
                ? `Person #${customer.pipedrive_person_id}`
                : "Not linked"
            }
          />
        </DetailGroup>

        <DetailGroup
          title={`Job sites (${customer.job_sites.length})`}
          action={
            <a href="#add-job-site" className="text-xs font-semibold text-primary">
              Add site
            </a>
          }
        >
          {customer.job_sites.length ? (
            <div className="grid gap-2">
              {customer.job_sites.map((site) => (
                <JobSiteCard key={site.id} site={site} />
              ))}
            </div>
          ) : (
            <p className="rounded-md bg-white px-3 py-3 text-sm text-muted-foreground ring-1 ring-border">
              No job sites saved yet.
            </p>
          )}
        </DetailGroup>

        <DetailGroup title="Quote history">
          {customer.quote_history.length ? (
            <div className="grid gap-2">
              {customer.quote_history.map((quote) => (
                <Link
                  key={quote.id}
                  href={`/quotes/${quote.id}`}
                  className="soft-row flex min-h-12 items-center justify-between gap-3 px-3 text-sm transition hover:bg-white"
                >
                  <span className="min-w-0 truncate font-medium">
                    {quote.quote_number}
                  </span>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {formatCurrency(quote.total)}
                  </span>
                </Link>
              ))}
            </div>
          ) : (
            <p className="rounded-md bg-white px-3 py-3 text-sm text-muted-foreground ring-1 ring-border">
              No quote history yet.
            </p>
          )}
        </DetailGroup>
      </div>

      <div className="border-t border-border bg-[#fbfcf8] px-4 py-3">
        <Link
          href={customerHref(customer.id, search, currentPage)}
          className="inline-flex items-center gap-2 text-xs font-semibold text-primary hover:text-foreground"
        >
          Keep this customer selected
          <ArrowUpRight className="size-3.5" />
        </Link>
      </div>
      </div>
    </aside>
  );
}

function CrudModal({
  id,
  title,
  children,
}: {
  id: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div id={id} className="crud-modal" aria-hidden="true">
      <a href="#" className="crud-modal-backdrop" aria-label="Close modal" />
      <section
        className="crud-modal-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${id}-title`}
      >
        <div className="flex items-center justify-between gap-4 border-b border-border bg-[#fbfcf8] px-5 py-4">
          <h2 id={`${id}-title`} className="text-xl font-semibold">
            {title}
          </h2>
          <a href="#" className="mac-link size-9 px-0" aria-label="Close modal">
            <X className="size-4" />
          </a>
        </div>
        <div className="max-h-[calc(100vh-9rem)] overflow-y-auto p-5">
          {children}
        </div>
      </section>
    </div>
  );
}

function DetailGroup({
  title,
  action,
  children,
}: {
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section>
      <div className="mb-2 flex items-center justify-between gap-3">
        <h3 className="text-xs font-semibold uppercase text-muted-foreground">
          {title}
        </h3>
        {action}
      </div>
      {children}
    </section>
  );
}

function DetailLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-[100px_1fr] gap-3 border-b border-border py-2 text-sm last:border-b-0">
      <span className="text-muted-foreground">{label}</span>
      <span className="min-w-0 truncate font-medium">{value}</span>
    </div>
  );
}

function JobSiteCard({ site }: { site: JobSiteSummary }) {
  return (
    <div className="soft-row p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">{site.name}</p>
          <p className="mt-1 truncate text-xs text-muted-foreground">
            {formatAddress(site.address)}
          </p>
          <p className="mt-1 truncate text-xs text-muted-foreground">
            {[site.city, site.county, site.state].filter(Boolean).join(" - ")}
          </p>
        </div>
        <StatusPill active={site.is_active} />
      </div>
    </div>
  );
}

function DeskStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md border border-border bg-white px-3 py-2">
      <span className="block text-muted-foreground">{label}</span>
      <span className="mt-1 block font-mono text-lg font-semibold text-foreground">
        {value}
      </span>
    </div>
  );
}

function HealthLabel({ good, text }: { good: boolean; text: string }) {
  const Icon = good ? CheckCircle2 : AlertCircle;

  return (
    <span className="flex min-w-0 items-center gap-2 text-sm text-muted-foreground">
      <Icon
        className={`size-4 shrink-0 ${good ? "text-primary" : "text-amber-700"}`}
      />
      <span className="truncate">{text}</span>
    </span>
  );
}

function StatusPill({ active }: { active: boolean }) {
  return (
    <span
      className={`soft-chip shrink-0 justify-center ${
        active
          ? "bg-emerald-50 text-emerald-700 ring-emerald-100"
          : "bg-slate-100 text-slate-600 ring-slate-200"
      }`}
    >
      {active ? "Active" : "Inactive"}
    </span>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="px-4 py-12 text-center">
      <UsersRound className="mx-auto size-8 text-muted-foreground" />
      <p className="mt-3 text-sm text-muted-foreground">{text}</p>
    </div>
  );
}

function customerHref(customerId: string, search: string, page: number) {
  const params = new URLSearchParams();

  if (search) {
    params.set("q", search);
  }

  if (page > 1) {
    params.set("page", String(page));
  }

  params.set("customer", customerId);

  return `/customers?${params.toString()}`;
}

function pageHref(search: string, page: number) {
  const params = new URLSearchParams();

  if (search) {
    params.set("q", search);
  }

  if (page > 1) {
    params.set("page", String(page));
  }

  const query = params.toString();

  return query ? `/customers?${query}` : "/customers";
}

function customersHref(search: string) {
  const params = new URLSearchParams();

  if (search) {
    params.set("q", search);
  }

  const query = params.toString();

  return query ? `/customers?${query}` : "/customers";
}

function hasPricingContext(customer: CustomerSummary) {
  return Boolean(customer.default_plant_name || customer.pricing_notes);
}

function formatAddress(address: Record<string, unknown>) {
  const line1 = typeof address.line1 === "string" ? address.line1 : "";
  const city = typeof address.city === "string" ? address.city : "";
  const state = typeof address.state === "string" ? address.state : "";

  return [line1, city, state].filter(Boolean).join(", ") || "Address pending";
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
}
