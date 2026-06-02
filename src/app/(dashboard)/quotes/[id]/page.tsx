import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import {
  Building2,
  CheckCircle2,
  ClipboardList,
  DollarSign,
  FileText,
  GitBranch,
  MapPin,
  PackagePlus,
  Send,
  Share2,
  XCircle,
  UserRound,
} from "lucide-react";

import {
  addQuoteItem,
  approveQuote,
  createCustomerQuoteLink,
  createQuoteRevisionAction,
  generateQuoteDocument,
  markQuoteAccepted,
  markQuoteDeclined,
  markQuoteSent,
  rejectQuote,
  removeQuoteItem,
  sendCustomerQuoteEmail,
  submitQuoteForApproval,
  updateQuoteItemQuantity,
} from "@/app/(dashboard)/quotes/[id]/actions";
import { Button } from "@/components/ui/button";
import { QuoteNav } from "@/components/app-nav";
import { getCurrentUser } from "@/lib/auth/current-user";
import { getNewQuoteContext } from "@/lib/quotes/new-quote";
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
  searchParams: Promise<{
    created?: string;
    document_created?: string;
    email_status?: string;
    public_link?: string;
    revision_created?: string;
  }>;
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

  const quoteContext = quote.status === "draft" ? await getNewQuoteContext(user) : null;
  const submitAction = submitQuoteForApproval.bind(null, quote.id);
  const approveAction = approveQuote.bind(null, quote.id);
  const rejectAction = rejectQuote.bind(null, quote.id);
  const sendAction = markQuoteSent.bind(null, quote.id);
  const acceptedAction = markQuoteAccepted.bind(null, quote.id);
  const declinedAction = markQuoteDeclined.bind(null, quote.id);
  const addItemAction = addQuoteItem.bind(null, quote.id);
  const createPublicLinkAction = createCustomerQuoteLink.bind(null, quote.id);
  const generateDocumentAction = generateQuoteDocument.bind(null, quote.id);
  const sendEmailAction = sendCustomerQuoteEmail.bind(null, quote.id);
  const createRevisionAction = createQuoteRevisionAction.bind(null, quote.id);
  const canSubmit = quote.status === "draft";
  const canEditItems = quote.status === "draft";
  const canApprove =
    quote.status === "pending_approval" &&
    (user.role === "admin" || user.role === "account_manager");
  const canSend =
    quote.status === "approved" &&
    (user.role === "admin" || user.role === "account_manager");
  const canRecordCustomerResponse =
    quote.status === "sent" &&
    (user.role === "admin" || user.role === "account_manager");
  const canCreateCustomerLink =
    ["sent", "viewed", "accepted", "declined"].includes(quote.status) &&
    (user.role === "admin" || user.role === "account_manager");
  const canGenerateDocument =
    ["approved", "sent", "viewed", "accepted", "declined"].includes(
      quote.status,
    ) && (user.role === "admin" || user.role === "account_manager");
  const canCreateRevision =
    ["approved", "sent", "viewed", "accepted", "declined", "expired"].includes(
      quote.status,
    ) && (user.role === "admin" || user.role === "account_manager");

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
            <QuoteNav quoteId={quote.id} includePrint />
          </div>
        </header>

        {query.created ? (
          <div className="mt-6 rounded-[20px] border border-emerald-100 bg-emerald-50/80 px-5 py-4 text-sm font-medium text-emerald-800 shadow-sm">
            Draft quote {query.created} was saved and logged.
          </div>
        ) : null}

        {query.document_created ? (
          <div className="mt-6 rounded-[20px] border border-emerald-100 bg-emerald-50/80 px-5 py-4 text-sm font-medium text-emerald-800 shadow-sm">
            Quote document version {query.document_created} was generated.
          </div>
        ) : null}

        {query.revision_created ? (
          <div className="mt-6 rounded-[20px] border border-emerald-100 bg-emerald-50/80 px-5 py-4 text-sm font-medium text-emerald-800 shadow-sm">
            Revision draft {query.revision_created} was created.
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
            <div className="mt-5 rounded-[18px] border border-white/70 bg-white/65 p-4">
              <div className="flex items-start gap-3">
                <div className="icon-well text-blue-700">
                  <GitBranch className="size-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-medium uppercase text-muted-foreground">
                    Revision
                  </p>
                  <p className="mt-1 text-sm font-semibold">
                    Revision {quote.revision_number}
                  </p>
                  {quote.revision_parent ? (
                    <p className="mt-2 text-sm text-muted-foreground">
                      Based on{" "}
                      <Link
                        href={`/quotes/${quote.revision_parent.id}`}
                        className="font-semibold text-blue-700 hover:text-blue-800"
                      >
                        {quote.revision_parent.quote_number}
                      </Link>
                    </p>
                  ) : null}
                  {quote.revision_children.length ? (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {quote.revision_children.map((revision) => (
                        <Link
                          key={revision.id}
                          href={`/quotes/${revision.id}`}
                          className="soft-chip bg-sky-50 text-sky-700 ring-sky-100"
                        >
                          {revision.quote_number}
                        </Link>
                      ))}
                    </div>
                  ) : null}
                </div>
              </div>
            </div>
            {quote.notes ? (
              <p className="mt-5 whitespace-pre-line rounded-[16px] bg-white/70 px-4 py-3 text-sm leading-6 text-muted-foreground">
                {quote.notes}
              </p>
            ) : null}
            {query.public_link ? (
              <div className="mt-5 rounded-[18px] border border-emerald-100 bg-emerald-50/80 p-4 text-sm text-emerald-900">
                <p className="font-semibold">
                  {query.email_status
                    ? emailStatusMessage(query.email_status)
                    : "Customer link created"}
                </p>
                <input
                  readOnly
                  value={query.public_link}
                  className="soft-control mt-3 w-full bg-white/85 font-mono text-xs"
                />
              </div>
            ) : null}
            {canSubmit || canApprove || canSend || canRecordCustomerResponse ? (
              <div className="mt-6 space-y-3">
                {canSubmit ? (
                  <form action={submitAction}>
                    <Button type="submit" className="h-11 w-full rounded-full">
                      <Send className="size-4" />
                      Submit for approval
                    </Button>
                  </form>
                ) : null}
                {canApprove ? (
                  <div className="grid gap-3">
                    <form action={approveAction}>
                      <Button
                        type="submit"
                        className="h-11 w-full rounded-full bg-emerald-600 text-white hover:bg-emerald-700"
                      >
                        <CheckCircle2 className="size-4" />
                        Approve quote
                      </Button>
                    </form>
                    <form action={rejectAction} className="space-y-3">
                      <textarea
                        name="rejection_reason"
                        className="soft-control min-h-24 w-full resize-none py-3"
                        placeholder="Reason for rejection"
                      />
                      <Button
                        type="submit"
                        variant="outline"
                        className="h-11 w-full rounded-full bg-rose-50 text-rose-700 hover:bg-rose-100"
                      >
                        <XCircle className="size-4" />
                        Reject quote
                      </Button>
                    </form>
                  </div>
                ) : null}
                {canSend ? (
                  <form action={sendAction} className="space-y-3">
                    <textarea
                      name="send_note"
                      className="soft-control min-h-24 w-full resize-none py-3"
                      placeholder="Delivery note, email thread, or customer contact"
                    />
                    <Button type="submit" className="h-11 w-full rounded-full">
                      <Send className="size-4" />
                      Mark quote sent
                    </Button>
                  </form>
                ) : null}
                {canRecordCustomerResponse ? (
                  <div className="grid gap-3">
                    <form action={acceptedAction} className="space-y-3">
                      <textarea
                        name="customer_response_note"
                        className="soft-control min-h-24 w-full resize-none py-3"
                        placeholder="Acceptance note"
                      />
                      <Button
                        type="submit"
                        className="h-11 w-full rounded-full bg-emerald-600 text-white hover:bg-emerald-700"
                      >
                        <CheckCircle2 className="size-4" />
                        Mark accepted
                      </Button>
                    </form>
                    <form action={declinedAction} className="space-y-3">
                      <textarea
                        name="customer_response_note"
                        className="soft-control min-h-24 w-full resize-none py-3"
                        placeholder="Decline note"
                      />
                      <Button
                        type="submit"
                        variant="outline"
                        className="h-11 w-full rounded-full bg-rose-50 text-rose-700 hover:bg-rose-100"
                      >
                        <XCircle className="size-4" />
                        Mark declined
                      </Button>
                    </form>
                  </div>
                ) : null}
              </div>
            ) : null}
            {canCreateCustomerLink ? (
              <div className="mt-3 grid gap-3">
                <form action={sendEmailAction}>
                  <Button type="submit" className="h-11 w-full rounded-full">
                    <Send className="size-4" />
                    Send customer email
                  </Button>
                </form>
                <form action={createPublicLinkAction}>
                  <Button
                    type="submit"
                    variant="outline"
                    className="h-11 w-full rounded-full bg-white/70"
                  >
                    <Share2 className="size-4" />
                    Create customer link
                  </Button>
                </form>
              </div>
            ) : null}
            {canCreateRevision ? (
              <form action={createRevisionAction} className="mt-3">
                <Button
                  type="submit"
                  variant="outline"
                  className="h-11 w-full rounded-full bg-white/70"
                >
                  <GitBranch className="size-4" />
                  Create revision draft
                </Button>
              </form>
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
                <QuoteItemRow
                  key={item.id}
                  canRemove={canEditItems}
                  item={item}
                  quoteId={quote.id}
                />
              ))}
            </div>
            {quoteContext ? (
              <form
                action={addItemAction}
                className="mt-5 rounded-[20px] border border-sky-100 bg-sky-50/60 p-4"
              >
                <div className="flex items-center gap-3">
                  <div className="icon-well text-blue-700">
                    <PackagePlus className="size-5" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">
                      Draft editor
                    </p>
                    <h3 className="text-lg font-semibold">Add material line</h3>
                  </div>
                </div>
                <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_140px_auto] sm:items-end">
                  <label className="block">
                    <span className="text-sm font-medium text-muted-foreground">
                      Material
                    </span>
                    <select
                      name="material_id"
                      className="soft-control mt-2 w-full"
                      required
                    >
                      <option value="">Select material...</option>
                      {quoteContext.materials.map((material) => (
                        <option key={material.id} value={material.id}>
                          {material.supplier_name} - {material.name} (
                          {material.tier})
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="block">
                    <span className="text-sm font-medium text-muted-foreground">
                      Quantity
                    </span>
                    <input
                      name="quantity"
                      type="number"
                      min="0.01"
                      step="0.01"
                      className="soft-control mt-2 w-full"
                      required
                    />
                  </label>
                  <Button type="submit" className="h-12 rounded-full">
                    <PackagePlus className="size-4" />
                    Add line
                  </Button>
                </div>
              </form>
            ) : null}
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
                icon={FileText}
                kicker="Documents"
                title={`${quote.documents.length} archived version${
                  quote.documents.length === 1 ? "" : "s"
                }`}
              />
              {canGenerateDocument ? (
                <form action={generateDocumentAction} className="mt-5">
                  <Button type="submit" className="h-11 w-full rounded-full">
                    <FileText className="size-4" />
                    Generate document
                  </Button>
                </form>
              ) : null}
              <div className="mt-5 space-y-3">
                {quote.documents.length ? (
                  quote.documents.map((document) => (
                    <div key={document.id} className="soft-row px-4 py-3">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="text-sm font-semibold">
                            Version {document.version}{" "}
                            {document.document_type.toUpperCase()}
                          </p>
                          <p className="mt-1 text-xs text-muted-foreground">
                            {document.generated_by_name ?? "System"} -{" "}
                            {formatDateTime(document.generated_at)}
                          </p>
                        </div>
                        <div className="flex shrink-0 items-center gap-2">
                          <Link
                            href={`/api/quote-documents/${document.id}/download`}
                            className="mac-link h-8 px-3 text-xs"
                            target="_blank"
                          >
                            Open
                          </Link>
                          <span className="soft-chip bg-slate-100 text-slate-600 ring-slate-200">
                            {formatStatus(document.status)}
                          </span>
                        </div>
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-muted-foreground">
                    No quote documents generated yet.
                  </p>
                )}
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

function QuoteItemRow({
  item,
  quoteId,
  canRemove,
}: {
  item: QuoteDetailItem;
  quoteId: string;
  canRemove: boolean;
}) {
  const removeAction = removeQuoteItem.bind(null, quoteId, item.id);
  const updateQuantityAction = updateQuoteItemQuantity.bind(
    null,
    quoteId,
    item.id,
  );

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
        <p className="mt-1 text-xs text-muted-foreground">
          {item.load_count.toFixed(0)} load{item.load_count === 1 ? "" : "s"}
          {item.vehicle_name ? ` via ${item.vehicle_name}` : ""}
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
        {canRemove ? (
          <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:justify-end">
            <form action={updateQuantityAction} className="flex gap-2">
              <input
                name="quantity"
                type="number"
                min="0.01"
                step="0.01"
                defaultValue={item.quantity}
                className="soft-control h-8 min-h-8 w-24 px-3 text-xs"
                aria-label={`Quantity for ${item.material_name}`}
                required
              />
              <Button
                type="submit"
                variant="outline"
                className="h-8 rounded-full bg-white/70 text-xs"
              >
                Update
              </Button>
            </form>
            <form action={removeAction}>
              <Button
                type="submit"
                variant="outline"
                className="h-8 rounded-full bg-white/70 text-xs text-rose-700 hover:bg-rose-50"
              >
                Remove line
              </Button>
            </form>
          </div>
        ) : null}
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
    sent: "bg-cyan-50 text-cyan-700 ring-cyan-100",
    viewed: "bg-indigo-50 text-indigo-700 ring-indigo-100",
    accepted: "bg-lime-50 text-lime-700 ring-lime-100",
    declined: "bg-orange-50 text-orange-700 ring-orange-100",
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

function emailStatusMessage(status: string) {
  if (status === "sent") {
    return "Customer email sent";
  }

  if (status === "skipped") {
    return "Email provider not configured; customer link created";
  }

  if (status === "failed") {
    return "Email delivery failed; customer link created";
  }

  return "Customer link created";
}
