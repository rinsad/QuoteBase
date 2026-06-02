import { CalendarDays, CheckCircle2, FileText, UserRound, XCircle } from "lucide-react";
import { notFound } from "next/navigation";

import { submitPublicQuoteResponse } from "@/app/q/[token]/actions";
import { PublicPrintButton } from "@/app/q/[token]/public-print-button";
import { getPublicQuoteByToken, type PublicQuoteItem } from "@/lib/quotes/delivery";

export default async function PublicQuotePage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ responded?: string }>;
}) {
  const [{ token }, query] = await Promise.all([params, searchParams]);

  if (!/^[A-Za-z0-9_-]{32,256}$/.test(token)) {
    notFound();
  }

  const quote = await getPublicQuoteByToken(token);

  if (!quote) {
    notFound();
  }

  const canRespond = quote.status === "sent" || quote.status === "viewed";
  const responseAction = submitPublicQuoteResponse.bind(null, token);

  return (
    <main className="min-h-screen bg-[linear-gradient(135deg,#f8fbff_0%,#eef5fb_46%,#e9f6f3_100%)] px-4 py-6 text-slate-950 print:bg-white print:px-0 print:py-0">
      <div className="mx-auto max-w-5xl print:max-w-none">
        <div className="mb-4 flex justify-end print:hidden">
          <PublicPrintButton />
        </div>

        <article className="overflow-hidden rounded-[28px] border border-white/80 bg-white shadow-[0_24px_80px_rgba(59,91,152,0.14)] print:rounded-none print:border-0 print:shadow-none">
          <header className="border-b border-slate-200 bg-[linear-gradient(90deg,rgba(255,255,255,0.96),rgba(234,246,255,0.82))] p-8">
            <div className="flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p className="text-sm font-semibold uppercase text-sky-700">
                  Western Materials
                </p>
                <h1 className="mt-3 text-4xl font-semibold">Quote</h1>
                <p className="mt-2 text-sm text-slate-500">
                  {quote.quote_number}
                </p>
              </div>
              <div className="grid gap-3 text-left sm:text-right">
                <InfoLine
                  icon={CalendarDays}
                  label="Created"
                  value={formatDate(quote.created_at)}
                />
                <InfoLine
                  icon={FileText}
                  label="Status"
                  value={formatStatus(quote.status)}
                />
              </div>
            </div>
          </header>

          <section className="grid gap-6 border-b border-slate-200 p-8 sm:grid-cols-2">
            <div>
              <p className="text-xs font-semibold uppercase text-slate-500">
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
              <p className="text-xs font-semibold uppercase text-slate-500">
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

          <section className="p-8">
            <div className="overflow-hidden rounded-[18px] border border-slate-200">
              <div className="grid grid-cols-[1.5fr_0.6fr_0.6fr_0.8fr] bg-slate-950 px-4 py-3 text-xs font-semibold uppercase text-white">
                <span>Material</span>
                <span className="text-right">Qty</span>
                <span className="text-right">Unit</span>
                <span className="text-right">Line total</span>
              </div>
              {quote.items.map((item) => (
                <PublicQuoteItemRow key={item.id} item={item} />
              ))}
            </div>
          </section>

          <section className="grid gap-8 border-t border-slate-200 p-8 sm:grid-cols-[1fr_340px]">
            <div>
              <p className="text-xs font-semibold uppercase text-slate-500">
                Notes
              </p>
              <p className="mt-3 whitespace-pre-line text-sm leading-6 text-slate-600">
                {quote.notes ??
                  "Pricing is subject to material availability, trucking availability, and final job-site conditions."}
              </p>
              <div className="mt-6 flex items-center gap-3 text-sm text-slate-600">
                <UserRound className="size-4 text-sky-700" />
                Prepared by {quote.requested_by.full_name}
              </div>
              {query.responded === "accepted" || query.responded === "declined" ? (
                <div className="mt-6 rounded-[18px] border border-emerald-100 bg-emerald-50 p-4 text-sm font-medium text-emerald-800">
                  Your response has been recorded.
                </div>
              ) : null}
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

          <section className="border-t border-slate-200 bg-slate-50/80 p-8 print:hidden">
            {canRespond ? (
              <form
                action={responseAction}
                className="grid gap-5 lg:grid-cols-[1fr_auto] lg:items-end"
              >
                <label className="block">
                  <span className="text-sm font-medium text-slate-600">
                    Optional response note
                  </span>
                  <textarea
                    name="response_note"
                    rows={3}
                    className="soft-control mt-2 w-full resize-none bg-white"
                    placeholder="Add a short note for Western Materials"
                  />
                </label>
                <div className="grid gap-3 sm:grid-cols-2 lg:min-w-80">
                  <button
                    type="submit"
                    name="response"
                    value="accepted"
                    className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-full bg-emerald-600 px-5 text-sm font-semibold text-white shadow-[0_14px_32px_rgba(5,150,105,0.24)] transition hover:bg-emerald-700"
                  >
                    <CheckCircle2 className="size-4" />
                    Accept quote
                  </button>
                  <button
                    type="submit"
                    name="response"
                    value="declined"
                    className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-full border border-rose-100 bg-white px-5 text-sm font-semibold text-rose-700 shadow-sm transition hover:bg-rose-50"
                  >
                    <XCircle className="size-4" />
                    Decline quote
                  </button>
                </div>
              </form>
            ) : (
              <div className="rounded-[18px] border border-slate-200 bg-white p-4 text-sm font-medium text-slate-600">
                This quote has already been {formatStatus(quote.status)}.
              </div>
            )}
          </section>

          <footer className="border-t border-slate-200 px-8 py-6 text-xs leading-5 text-slate-500">
            This quote link expires on {formatDate(quote.expires_at)}.
          </footer>
        </article>
      </div>
    </main>
  );
}

function InfoLine({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof CalendarDays;
  label: string;
  value: string;
}) {
  return (
    <div>
      <p className="text-xs font-medium uppercase text-slate-500">{label}</p>
      <p className="mt-1 inline-flex items-center gap-2 text-sm font-semibold">
        <Icon className="size-4 text-sky-700" />
        {value}
      </p>
    </div>
  );
}

function PublicQuoteItemRow({ item }: { item: PublicQuoteItem }) {
  return (
    <div className="grid grid-cols-[1.5fr_0.6fr_0.6fr_0.8fr] border-t border-slate-200 px-4 py-4 text-sm">
      <div>
        <p className="font-semibold">{item.material_name}</p>
        <p className="mt-1 text-xs text-slate-500">
          {item.supplier_name} - {item.material_tier}
        </p>
        <p className="mt-1 text-xs text-slate-500">
          {item.load_count.toFixed(0)} load{item.load_count === 1 ? "" : "s"}
          {item.vehicle_name ? ` via ${item.vehicle_name}` : ""}
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
