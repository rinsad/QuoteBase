import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import {
  Building2,
  ClipboardList,
  DollarSign,
  FileText,
  MapPin,
  UserRound,
} from "lucide-react";

import { getCurrentUser } from "@/lib/auth/current-user";
import {
  getQuoteDetail,
  type QuoteDetailItem,
  type QuoteStatus,
} from "@/lib/quotes/quotes";

export default async function QuoteDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ created?: string }>;
}) {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/login");
  }

  const [{ id }, query] = await Promise.all([params, searchParams]);
  const quote = await getQuoteDetail(user, id);

  if (!quote) {
    notFound();
  }

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
                  Quote Detail
                </p>
                <h1 className="truncate text-lg font-semibold">
                  {quote.quote_number}
                </h1>
              </div>
            </div>
            <div className="flex flex-wrap items-center justify-end gap-2">
              <Link href="/quotes/new" className="mac-link">
                New quote
              </Link>
              <Link href="/quotes" className="mac-link">
                Quotes
              </Link>
              <Link href="/dashboard" className="mac-link">
                Dashboard
              </Link>
            </div>
          </div>
        </header>

        {query.created ? (
          <div className="mt-6 rounded-[20px] border border-emerald-100 bg-emerald-50/80 px-5 py-4 text-sm font-medium text-emerald-800 shadow-sm">
            Draft quote {query.created} was saved and logged.
          </div>
        ) : null}

        <section className="mt-6 grid gap-6 lg:grid-cols-[0.8fr_1.2fr]">
          <div className="glass-panel p-6 sm:p-8">
            <StatusPill status={quote.status} />
            <h2 className="accent-title mt-6 text-4xl font-semibold tracking-normal">
              {formatCurrency(quote.total)}
            </h2>
            <p className="mt-3 text-sm leading-6 text-muted-foreground">
              Created {formatDateTime(quote.created_at)} by{" "}
              {quote.requested_by.full_name}.
            </p>
            {quote.notes ? (
              <p className="mt-5 rounded-[16px] bg-white/70 px-4 py-3 text-sm leading-6 text-muted-foreground">
                {quote.notes}
              </p>
            ) : null}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <InfoCard
              icon={Building2}
              label="Customer"
              title={quote.customer.name}
              detail={[
                quote.customer.contact_name,
                quote.customer.email,
                quote.customer.phone,
              ]
                .filter(Boolean)
                .join(" - ")}
            />
            <InfoCard
              icon={MapPin}
              label="Job site"
              title={quote.job_site.name}
              detail={`${quote.job_site.city}, ${quote.job_site.state}`}
            />
            <InfoCard
              icon={UserRound}
              label="Owner"
              title={quote.requested_by.full_name}
              detail={quote.requested_by.email}
            />
            <InfoCard
              icon={ClipboardList}
              label="Tax"
              title={
                quote.tax_rate
                  ? `${quote.tax_rate.city}, ${quote.tax_rate.state}`
                  : "No tax rate"
              }
              detail={
                quote.tax_rate
                  ? `${(quote.tax_rate.rate * 100).toFixed(2)}%`
                  : "Pending"
              }
            />
          </div>
        </section>

        <section className="mt-6 grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
          <div className="glass-panel p-5 sm:p-6">
            <SectionHeading
              icon={FileText}
              kicker="Line Items"
              title={`${quote.items.length} quoted material line${
                quote.items.length === 1 ? "" : "s"
              }`}
            />
            <div className="mt-5 space-y-3">
              {quote.items.map((item) => (
                <QuoteItemRow key={item.id} item={item} />
              ))}
            </div>
          </div>

          <aside className="space-y-6">
            <section className="glass-panel p-5 sm:p-6">
              <SectionHeading
                icon={DollarSign}
                kicker="Totals"
                title="Draft calculation"
              />
              <div className="mt-5 space-y-3">
                <TotalRow
                  label="Material"
                  value={formatCurrency(quote.material_subtotal)}
                />
                <TotalRow
                  label="Trucking"
                  value={formatCurrency(quote.trucking_subtotal)}
                />
                <TotalRow label="Fees" value={formatCurrency(quote.fees_subtotal)} />
                <TotalRow label="Tax" value={formatCurrency(quote.tax_total)} />
                <TotalRow label="Total" value={formatCurrency(quote.total)} strong />
              </div>
            </section>

            <section className="glass-panel p-5 sm:p-6">
              <SectionHeading
                icon={ClipboardList}
                kicker="Audit"
                title="Recent events"
              />
              <div className="mt-5 space-y-3">
                {quote.auditEntries.length ? (
                  quote.auditEntries.map((entry) => (
                    <div key={entry.id} className="soft-row px-4 py-3">
                      <p className="text-sm font-semibold">
                        {formatAction(entry.action)}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {entry.user_name ?? "System"} -{" "}
                        {formatDateTime(entry.created_at)}
                      </p>
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-muted-foreground">
                    No audit entries yet.
                  </p>
                )}
              </div>
            </section>
          </aside>
        </section>
      </div>
    </main>
  );
}

function InfoCard({
  icon: Icon,
  label,
  title,
  detail,
}: {
  icon: typeof Building2;
  label: string;
  title: string;
  detail: string;
}) {
  return (
    <div className="glass-tile min-h-40 p-5">
      <Icon className="size-5 text-blue-700" />
      <p className="mt-5 text-xs font-medium uppercase text-muted-foreground">
        {label}
      </p>
      <p className="mt-2 text-sm font-semibold">{title}</p>
      {detail ? (
        <p className="mt-2 text-sm leading-6 text-muted-foreground">{detail}</p>
      ) : null}
    </div>
  );
}

function SectionHeading({
  icon: Icon,
  kicker,
  title,
}: {
  icon: typeof FileText;
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

function QuoteItemRow({ item }: { item: QuoteDetailItem }) {
  return (
    <div className="soft-row grid gap-4 px-4 py-4 md:grid-cols-[1fr_auto] md:items-center">
      <div>
        <p className="text-sm font-semibold">{item.material_name}</p>
        <p className="mt-1 text-sm text-muted-foreground">
          {item.supplier_name} - {item.material_tier} - {item.quantity}{" "}
          {item.unit}
        </p>
        <p className="mt-2 text-xs text-muted-foreground">
          Cost {formatCurrency(item.unit_cost)} | Markup{" "}
          {item.markup_pct.toFixed(2)}% | Sell{" "}
          {formatCurrency(item.material_unit_price)}
        </p>
      </div>
      <div className="text-left md:text-right">
        <p className="text-base font-semibold">
          {formatCurrency(item.line_total)}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          Material {formatCurrency(item.material_subtotal)} | Trucking{" "}
          {formatCurrency(item.trucking_subtotal)}
        </p>
      </div>
    </div>
  );
}

function TotalRow({
  label,
  value,
  strong = false,
}: {
  label: string;
  value: string;
  strong?: boolean;
}) {
  return (
    <div className="soft-row flex min-h-12 items-center justify-between gap-3 px-4">
      <span className="text-sm font-medium text-muted-foreground">{label}</span>
      <span className={strong ? "text-lg font-semibold" : "text-sm font-semibold"}>
        {value}
      </span>
    </div>
  );
}

function StatusPill({ status }: { status: QuoteStatus }) {
  const tone = {
    draft: "bg-blue-50 text-blue-700 ring-blue-100",
    pending_approval: "bg-amber-50 text-amber-700 ring-amber-100",
    approved: "bg-emerald-50 text-emerald-700 ring-emerald-100",
    rejected: "bg-rose-50 text-rose-700 ring-rose-100",
    expired: "bg-slate-100 text-slate-600 ring-slate-200",
  } satisfies Record<QuoteStatus, string>;

  return <span className={`soft-chip ${tone[status]}`}>{formatStatus(status)}</span>;
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(value);
}

function formatStatus(status: string) {
  return status
    .split("_")
    .map((part) => part[0]?.toUpperCase() + part.slice(1))
    .join(" ");
}

function formatAction(action: string) {
  return action
    .split(".")
    .map(formatStatus)
    .join(" ");
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}
