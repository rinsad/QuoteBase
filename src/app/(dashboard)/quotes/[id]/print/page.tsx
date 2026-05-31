import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { PrintButton } from "@/app/(dashboard)/quotes/[id]/print/print-button";
import { getCurrentUser } from "@/lib/auth/current-user";
import { getQuoteDetail, type QuoteDetailItem } from "@/lib/quotes/quotes";

export default async function QuotePrintPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/login");
  }

  const { id } = await params;
  const quote = await getQuoteDetail(user, id);

  if (!quote) {
    notFound();
  }

  return (
    <main className="min-h-screen bg-slate-100 px-4 py-6 text-slate-950 print:bg-white print:px-0 print:py-0">
      <div className="mx-auto max-w-5xl print:max-w-none">
        <div className="mb-4 flex justify-end gap-2 print:hidden">
          <Link href={`/quotes/${quote.id}`} className="mac-link">
            Back to quote
          </Link>
          <PrintButton />
        </div>

        <article className="bg-white p-8 shadow-[0_20px_70px_rgba(15,23,42,0.12)] print:p-0 print:shadow-none">
          <header className="flex flex-col gap-8 border-b border-slate-200 pb-8 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.16em] text-sky-700">
                Western Materials
              </p>
              <h1 className="mt-3 text-4xl font-semibold">Quote</h1>
              <p className="mt-2 text-sm text-slate-500">
                {quote.quote_number}
              </p>
            </div>
            <div className="text-left sm:text-right">
              <p className="text-sm font-medium text-slate-500">Status</p>
              <p className="mt-1 text-lg font-semibold">
                {formatStatus(quote.status)}
              </p>
              <p className="mt-4 text-sm font-medium text-slate-500">Date</p>
              <p className="mt-1 text-sm font-semibold">
                {formatDate(quote.created_at)}
              </p>
            </div>
          </header>

          <section className="grid gap-6 border-b border-slate-200 py-8 sm:grid-cols-2">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                Prepared for
              </p>
              <h2 className="mt-3 text-xl font-semibold">
                {quote.customer.name}
              </h2>
              <div className="mt-3 space-y-1 text-sm text-slate-600">
                {quote.customer.contact_name ? (
                  <p>{quote.customer.contact_name}</p>
                ) : null}
                {quote.customer.email ? <p>{quote.customer.email}</p> : null}
                {quote.customer.phone ? <p>{quote.customer.phone}</p> : null}
              </div>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                Job site
              </p>
              <h2 className="mt-3 text-xl font-semibold">
                {quote.job_site.name}
              </h2>
              <div className="mt-3 space-y-1 text-sm text-slate-600">
                <p>{formatAddress(quote.job_site.address)}</p>
                <p>
                  {quote.job_site.city}, {quote.job_site.state}
                </p>
              </div>
            </div>
          </section>

          <section className="py-8">
            <div className="overflow-hidden border border-slate-200">
              <div className="grid grid-cols-[1.5fr_0.6fr_0.6fr_0.8fr] bg-slate-950 px-4 py-3 text-xs font-semibold uppercase tracking-[0.12em] text-white">
                <span>Material</span>
                <span className="text-right">Qty</span>
                <span className="text-right">Unit</span>
                <span className="text-right">Line total</span>
              </div>
              {quote.items.map((item) => (
                <PrintItemRow key={item.id} item={item} />
              ))}
            </div>
          </section>

          <section className="grid gap-8 border-t border-slate-200 pt-8 sm:grid-cols-[1fr_340px]">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                Notes
              </p>
              <p className="mt-3 whitespace-pre-line text-sm leading-6 text-slate-600">
                {quote.notes ??
                  "Pricing is subject to material availability, trucking availability, and final job-site conditions."}
              </p>
            </div>
            <div className="space-y-3">
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
              <div className="flex items-center justify-between border-t border-slate-300 pt-4">
                <span className="text-base font-semibold">Total</span>
                <span className="text-2xl font-semibold">
                  {formatCurrency(quote.total)}
                </span>
              </div>
            </div>
          </section>

          <footer className="mt-10 border-t border-slate-200 pt-6 text-xs leading-5 text-slate-500">
            <p>
              Prepared by {quote.requested_by.full_name}. This document is a
              QuoteBase generated quote for review and approval.
            </p>
          </footer>
        </article>
      </div>
    </main>
  );
}

function PrintItemRow({ item }: { item: QuoteDetailItem }) {
  return (
    <div className="grid grid-cols-[1.5fr_0.6fr_0.6fr_0.8fr] border-t border-slate-200 px-4 py-4 text-sm">
      <div>
        <p className="font-semibold">{item.material_name}</p>
        <p className="mt-1 text-xs text-slate-500">
          {item.supplier_name} - {item.material_tier}
        </p>
      </div>
      <span className="text-right">{item.quantity.toLocaleString()}</span>
      <span className="text-right">{item.unit}</span>
      <span className="text-right font-semibold">
        {formatCurrency(item.line_total)}
      </span>
    </div>
  );
}

function TotalRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-slate-500">{label}</span>
      <span className="font-semibold">{value}</span>
    </div>
  );
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

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  }).format(new Date(value));
}

function formatAddress(address: Record<string, unknown>) {
  const line1 = typeof address.line1 === "string" ? address.line1 : "";
  const city = typeof address.city === "string" ? address.city : "";
  const state = typeof address.state === "string" ? address.state : "";

  return [line1, city, state].filter(Boolean).join(", ") || "Address pending";
}
