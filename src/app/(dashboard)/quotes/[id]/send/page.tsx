import Link from "next/link";
import Image from "next/image";
import { notFound, redirect } from "next/navigation";
import { FileText, MessageSquare, Send } from "lucide-react";

import {
  createCustomerQuoteTextMessage,
  sendCustomerQuoteEmail,
  uploadQuoteAsset,
} from "@/app/(dashboard)/quotes/[id]/actions";
import { Button } from "@/components/ui/button";
import { getQuoteBranding } from "@/lib/admin/branding";
import { getCurrentUser } from "@/lib/auth/current-user";
import { listQuoteAssets } from "@/lib/quotes/assets";
import { getQuoteDetail, type QuoteDetailItem } from "@/lib/quotes/quotes";
import { CopyTextMessageButton } from "./copy-text-message-button";

export default async function QuoteSendPreviewPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{
    send_error?: string;
    text_status?: string;
    phone?: string;
    text_message?: string;
    public_link?: string;
    asset_uploaded?: string;
  }>;
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

  const canSendCustomerEmail =
    ["approved", "sent", "viewed", "follow_up"].includes(quote.status) &&
    (user.role === "admin" || user.role === "account_manager");

  if (!canSendCustomerEmail) {
    redirect(`/quotes/${quote.id}?action_error=${encodeURIComponent(
      "Customer emails are available after the quote is approved.",
    )}`);
  }

  const sendEmailAction = sendCustomerQuoteEmail.bind(null, quote.id);
  const createTextAction = createCustomerQuoteTextMessage.bind(null, quote.id);
  const uploadAssetAction = uploadQuoteAsset.bind(null, quote.id);
  const query = (await searchParams) ?? {};
  const [branding, quoteAssets] = await Promise.all([
    getQuoteBranding(user.organization_id),
    listQuoteAssets(user),
  ]);
  const companyName = branding?.branding.company_name ?? "QuoteBase";
  const logoUrl = branding?.branding.logo_url ?? null;
  const textMessage =
    query.text_status === "ready" && query.text_message
      ? query.text_message
      : null;
  const textPhone =
    query.text_status === "ready" && query.phone ? query.phone : quote.customer.phone;
  const smsHref =
    textMessage && textPhone ? buildSmsHref(textPhone, textMessage) : null;

  return (
    <main className="app-background">
      <div className="mx-auto grid w-full max-w-7xl gap-6 lg:grid-cols-[360px_1fr]">
        <aside className="glass-panel min-w-0 overflow-hidden p-5 sm:p-6 lg:sticky lg:top-6 lg:self-start">
          <div className="icon-well text-blue-700">
            <FileText className="size-5" />
          </div>
          <p className="mt-5 text-sm font-medium text-muted-foreground">
            Customer Delivery
          </p>
          <h1 className="mt-1 text-2xl font-semibold">Preview and send quote</h1>
          <p className="mt-3 text-sm leading-6 text-muted-foreground">
            Choose email or text based on how the customer wants to receive the
            quote. Text messages send the customer quote link.
          </p>

          <div className="mt-5 space-y-3 rounded-[18px] border border-white/70 bg-white/65 p-4">
            <PreviewRow label="Quote" value={quote.quote_number} />
            <PreviewRow label="Customer" value={quote.customer.name} />
            <PreviewRow
              label="Email"
              value={quote.customer.email ?? "No email saved"}
            />
            <PreviewRow label="Phone" value={quote.customer.phone ?? "No phone saved"} />
            <PreviewRow label="Total" value={formatCurrency(quote.total)} />
          </div>

          {query.send_error ? (
            <p className="mt-4 rounded-[16px] bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700 ring-1 ring-rose-100">
              {query.send_error}
            </p>
          ) : null}

          {query.asset_uploaded ? (
            <p className="mt-4 rounded-[16px] bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800 ring-1 ring-emerald-100">
              Asset uploaded and added to the quote library.
            </p>
          ) : null}

          {!quote.customer.email ? (
            <p className="mt-4 rounded-[16px] bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700 ring-1 ring-rose-100">
              Add an email address to this customer before sending.
            </p>
          ) : null}

          <div className="mt-5 grid gap-3">
            <form action={sendEmailAction} className="min-w-0 space-y-3">
              <QuoteAssetPicker assets={quoteAssets} />
              <Button
                type="submit"
                disabled={!quote.customer.email}
                className="h-11 w-full rounded-full"
              >
                <Send className="size-4" />
                Send PDF quote by email
              </Button>
            </form>
            <form
              action={uploadAssetAction}
              encType="multipart/form-data"
              className="rounded-[18px] border border-white/70 bg-white/65 p-4"
            >
              <p className="text-sm font-semibold">Add quote asset</p>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                Upload specs, tests, or material pictures for future quote sends.
              </p>
              <div className="mt-3 grid gap-3">
                <input
                  name="asset_title"
                  className="soft-control h-10"
                  placeholder="Asset title"
                  required
                />
                <select name="asset_type" className="soft-control h-10">
                  <option value="spec">Spec</option>
                  <option value="test">Test</option>
                  <option value="photo">Photo</option>
                  <option value="other">Other</option>
                </select>
                <input
                  name="asset_file"
                  type="file"
                  className="soft-control min-w-0 max-w-full py-2 file:max-w-[55%] file:truncate"
                  accept=".pdf,.txt,.doc,.docx,image/jpeg,image/png,image/webp"
                  required
                />
                <Button
                  type="submit"
                  variant="outline"
                  className="h-10 rounded-full bg-white/70"
                >
                  Upload asset
                </Button>
              </div>
            </form>
            <form action={createTextAction}>
              <Button
                type="submit"
                disabled={!quote.customer.phone}
                variant="outline"
                className="h-11 w-full rounded-full bg-white/70"
              >
                <MessageSquare className="size-4" />
                Prepare text message
              </Button>
            </form>
            {!quote.customer.phone ? (
              <p className="rounded-[16px] bg-amber-50 px-4 py-3 text-sm font-medium text-amber-900 ring-1 ring-amber-100">
                Add a phone number to this customer before texting.
              </p>
            ) : null}
            {smsHref && textMessage ? (
              <div className="rounded-[18px] border border-emerald-100 bg-emerald-50/80 p-4 text-sm text-emerald-900">
                <p className="font-semibold">Text message ready</p>
                <p className="mt-2 whitespace-pre-line leading-6">{textMessage}</p>
                <a
                  href={smsHref}
                  className="mt-3 inline-flex h-10 w-full items-center justify-center gap-2 rounded-full bg-primary px-4 text-sm font-semibold text-primary-foreground transition hover:bg-primary/80"
                >
                  <MessageSquare className="size-4" />
                  Open text message
                </a>
                <div className="mt-2">
                  <CopyTextMessageButton message={textMessage} />
                </div>
              </div>
            ) : null}
            <Link
              href={`/quotes/${quote.id}/print`}
              target="_blank"
              className="mac-link h-11 justify-center rounded-full"
            >
              Open template in new tab
            </Link>
            <Link
              href={`/quotes/${quote.id}`}
              className="mac-link h-11 justify-center rounded-full"
            >
              Back to quote
            </Link>
          </div>
        </aside>

        <section className="glass-panel min-w-0 overflow-hidden p-3 sm:p-4">
          <div className="max-h-[78vh] overflow-auto rounded-[18px] border border-slate-200 bg-[#f1f5f9] p-5 shadow-sm [color-scheme:light]">
            <QuotePreviewDocument
              quote={quote}
              companyName={companyName}
              logoUrl={logoUrl}
            />
          </div>
        </section>
      </div>
    </main>
  );
}

function QuoteAssetPicker({
  assets,
}: {
  assets: Awaited<ReturnType<typeof listQuoteAssets>>;
}) {
  if (!assets.length) {
    return (
      <p className="rounded-[16px] bg-white/65 px-4 py-3 text-sm text-muted-foreground ring-1 ring-white/70">
        No reusable specs, tests, or photos have been uploaded yet.
      </p>
    );
  }

  return (
    <div className="rounded-[18px] border border-white/70 bg-white/65 p-4">
      <p className="text-sm font-semibold">Optional attachments</p>
      <div className="mt-3 max-h-48 space-y-2 overflow-auto pr-1">
        {assets.map((asset) => (
          <label
            key={asset.id}
            className="flex cursor-pointer items-start gap-3 rounded-[14px] bg-white/70 px-3 py-2 text-sm"
          >
            <input
              type="checkbox"
              name="asset_ids"
              value={asset.id}
              className="mt-1"
            />
            <span className="min-w-0">
              <span className="block truncate font-semibold">{asset.title}</span>
              <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                {formatAssetType(asset.asset_type)} - {asset.source_filename}
              </span>
            </span>
          </label>
        ))}
      </div>
    </div>
  );
}

function PreviewRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right font-semibold">{value}</span>
    </div>
  );
}

function QuotePreviewDocument({
  quote,
  companyName,
  logoUrl,
}: {
  quote: NonNullable<Awaited<ReturnType<typeof getQuoteDetail>>>;
  companyName: string;
  logoUrl: string | null;
}) {
  return (
    <article className="mx-auto max-w-5xl bg-[#ffffff] p-8 text-[#0f172a] shadow-[0_20px_70px_rgba(15,23,42,0.12)] [color-scheme:light]">
      <header className="flex flex-col gap-8 border-b border-slate-200 pb-8 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <BrandMark companyName={companyName} logoUrl={logoUrl} />
          <h2 className="mt-3 text-4xl font-semibold text-slate-950">Quote</h2>
          <p className="mt-2 text-sm text-slate-500">{quote.quote_number}</p>
        </div>
        <div className="text-left sm:text-right">
          <p className="text-sm font-medium text-slate-500">Status</p>
          <p className="mt-1 text-lg font-semibold text-slate-950">
            {formatStatus(quote.status)}
          </p>
          <p className="mt-4 text-sm font-medium text-slate-500">Date</p>
          <p className="mt-1 text-sm font-semibold text-slate-950">
            {formatDate(quote.quote_date)}
          </p>
          <p className="mt-4 text-sm font-medium text-slate-500">Expires</p>
          <p className="mt-1 text-sm font-semibold text-slate-950">
            {formatDate(quote.expires_at)}
          </p>
        </div>
      </header>

      <section className="grid gap-6 border-b border-slate-200 py-8 sm:grid-cols-2">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
            Prepared for
          </p>
          <h3 className="mt-3 text-xl font-semibold text-slate-950">
            {quote.customer.name}
          </h3>
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
          <h3 className="mt-3 text-xl font-semibold text-slate-950">
            {quote.job_site.name}
          </h3>
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
            <PreviewItemRow key={item.id} item={item} />
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
            <span className="text-base font-semibold text-slate-950">Total</span>
            <span className="text-2xl font-semibold text-slate-950">
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
  );
}

function BrandMark({
  companyName,
  logoUrl,
}: {
  companyName: string;
  logoUrl: string | null;
}) {
  if (logoUrl) {
    return (
      <div className="flex h-14 w-64 items-center">
        <Image
          src={logoUrl}
          alt={`${companyName} logo`}
          width={256}
          height={56}
          unoptimized
          className="max-h-14 max-w-64 object-contain object-left"
        />
      </div>
    );
  }

  return (
    <p className="text-sm font-semibold uppercase tracking-[0.16em] text-sky-700">
      {companyName}
    </p>
  );
}

function PreviewItemRow({ item }: { item: QuoteDetailItem }) {
  return (
    <div className="grid grid-cols-[1.5fr_0.6fr_0.6fr_0.8fr] border-t border-slate-200 px-4 py-4 text-sm text-slate-950">
      <div>
        <p className="font-semibold">{item.material_name}</p>
        <p className="mt-1 text-xs text-slate-500">
          {item.supplier_name} - {item.material_tier}
        </p>
        <p className="mt-1 text-xs text-slate-500">
          {item.load_count.toFixed(0)} load{item.load_count === 1 ? "" : "s"}
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
      <span className="font-semibold text-slate-950">{value}</span>
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

function formatAssetType(assetType: string) {
  return assetType
    .split("_")
    .map((part) => part[0]?.toUpperCase() + part.slice(1))
    .join(" ");
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${value}T00:00:00.000Z`));
}

function buildSmsHref(phone: string, message: string) {
  const normalizedPhone = phone.replace(/[^\d+]/g, "");

  return `sms:${normalizedPhone}?body=${encodeURIComponent(message)}`;
}

function formatAddress(address: Record<string, unknown>) {
  const line1 = typeof address.line1 === "string" ? address.line1 : "";
  const city = typeof address.city === "string" ? address.city : "";
  const state = typeof address.state === "string" ? address.state : "";

  return [line1, city, state].filter(Boolean).join(", ") || "Address pending";
}
