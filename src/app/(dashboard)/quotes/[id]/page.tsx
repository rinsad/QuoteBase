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
  MessageSquare,
  Send,
  Share2,
  XCircle,
  UserRound,
} from "lucide-react";

import {
  approveQuote,
  createCreditApplicationLink,
  createCustomerQuoteLink,
  createQuoteRevisionAction,
  generateQuoteDocument,
  markQuoteAccepted,
  markQuoteDeclined,
  markQuoteSent,
  recordQuoteFeedback,
  requestQuoteChanges,
  rejectQuote,
  removeQuoteItem,
  sendCreditApplicationToCustomer,
  submitQuoteForApproval,
  updateQuoteItemQuantity,
} from "@/app/(dashboard)/quotes/[id]/actions";
import { Button } from "@/components/ui/button";
import { QuoteNav } from "@/components/app-nav";
import { QuoteStatusListener } from "@/components/quote-status-listener";
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
  searchParams: Promise<{
    action_error?: string;
    credit_application_error?: string;
    credit_application_link?: string;
    credit_application_status?: string;
    created?: string;
    document_created?: string;
    email_error?: string;
    email_status?: string;
    feedback_recorded?: string;
    integration_warning?: string;
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

  const editableUnapprovedStatuses: QuoteStatus[] = [
    "draft",
    "pending_approval",
    "changes_requested",
    "rejected",
  ];
  const canEditItems = editableUnapprovedStatuses.includes(quote.status);
  const submitAction = submitQuoteForApproval.bind(null, quote.id);
  const approveAction = approveQuote.bind(null, quote.id);
  const rejectAction = rejectQuote.bind(null, quote.id);
  const requestChangesAction = requestQuoteChanges.bind(null, quote.id);
  const sendAction = markQuoteSent.bind(null, quote.id);
  const acceptedAction = markQuoteAccepted.bind(null, quote.id);
  const declinedAction = markQuoteDeclined.bind(null, quote.id);
  const recordFeedbackAction = recordQuoteFeedback.bind(null, quote.id);
  const createPublicLinkAction = createCustomerQuoteLink.bind(null, quote.id);
  const createCreditApplicationLinkAction = createCreditApplicationLink.bind(
    null,
    quote.id,
  );
  const sendCreditApplicationAction = sendCreditApplicationToCustomer.bind(
    null,
    quote.id,
  );
  const generateDocumentAction = generateQuoteDocument.bind(null, quote.id);
  const createRevisionAction = createQuoteRevisionAction.bind(null, quote.id);
  const canSubmit =
    quote.status === "draft" || quote.status === "changes_requested";
  const canApprove =
    quote.status === "pending_approval" && user.role === "admin";
  const canSend =
    quote.status === "approved" &&
    (user.role === "admin" || user.role === "account_manager");
  const canRecordCustomerResponse =
    ["sent", "viewed", "follow_up"].includes(quote.status) &&
    (user.role === "admin" || user.role === "account_manager");
  const canCreateCustomerLink =
    ["approved", "sent", "viewed", "follow_up"].includes(quote.status) &&
    (user.role === "admin" || user.role === "account_manager");
  const canSendCustomerEmail =
    ["approved", "sent", "viewed", "follow_up"].includes(quote.status) &&
    (user.role === "admin" || user.role === "account_manager");
  const canGenerateDocument =
    ["approved", "sent", "viewed", "follow_up", "won", "lost"].includes(
      quote.status,
    ) && (user.role === "admin" || user.role === "account_manager");
  const canCreateRevision =
    ["approved", "sent", "viewed", "follow_up", "won", "lost", "expired"].includes(
      quote.status,
    ) && user.role === "admin";
  const canSendCreditApplication =
    ["won", "accepted"].includes(quote.status) &&
    (user.role === "admin" || user.role === "account_manager");

  return (
    <main className="app-background">
      <QuoteStatusListener quoteId={quote.id} currentStatus={quote.status} />
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

        {query.action_error ? (
          <div className="mt-6 rounded-[20px] border border-rose-100 bg-rose-50/90 px-5 py-4 text-sm font-medium text-rose-800 shadow-sm">
            {query.action_error}
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

        {query.feedback_recorded ? (
          <div className="mt-6 rounded-[20px] border border-emerald-100 bg-emerald-50/80 px-5 py-4 text-sm font-medium text-emerald-800 shadow-sm">
            Customer feedback was recorded.
          </div>
        ) : null}

        {query.integration_warning ? (
          <div className="mt-6 rounded-[20px] border border-amber-100 bg-amber-50/90 px-5 py-4 text-sm font-medium text-amber-900 shadow-sm">
            {query.integration_warning}
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
            <dl className="mt-5 grid gap-3 rounded-[18px] border border-white/70 bg-white/65 p-4 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-muted-foreground">Quote date</dt>
                <dd className="mt-1 font-semibold">
                  {formatDate(quote.quote_date)}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Expires at</dt>
                <dd className="mt-1 font-semibold">
                  {formatDate(quote.expires_at)}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Account type</dt>
                <dd className="mt-1 font-semibold">
                  {formatAccountType(quote.account_type)}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Project status</dt>
                <dd className="mt-1 font-semibold">
                  {formatProjectStatus(quote.project_status)}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Job start</dt>
                <dd className="mt-1 font-semibold">
                  {quote.job_start_date ? formatDate(quote.job_start_date) : "Not set"}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Job end</dt>
                <dd className="mt-1 font-semibold">
                  {quote.job_end_date ? formatDate(quote.job_end_date) : "Not set"}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Follow-ups</dt>
                <dd className="mt-1 font-semibold">
                  {quote.followup_attempt_count} / {quote.followup_max_attempts}
                </dd>
              </div>
            </dl>
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
                <label
                  htmlFor="customer-acceptance-link"
                  className="mt-3 block text-xs font-semibold uppercase text-emerald-800/80"
                >
                  Customer acceptance link
                </label>
                <input
                  id="customer-acceptance-link"
                  readOnly
                  value={query.public_link}
                  className="soft-control mt-2 w-full bg-white/85 font-mono text-xs"
                />
              </div>
            ) : null}
            {query.email_error ? (
              <div className="mt-5 rounded-[18px] border border-rose-100 bg-rose-50/90 p-4 text-sm font-medium text-rose-800">
                {query.email_error}
              </div>
            ) : null}
            {query.credit_application_link ? (
              <div className="mt-5 rounded-[18px] border border-emerald-100 bg-emerald-50/80 p-4 text-sm text-emerald-900">
                <p className="font-semibold">
                  {creditApplicationStatusMessage(
                    query.credit_application_status,
                  )}
                </p>
                <label
                  htmlFor="credit-application-link"
                  className="mt-3 block text-xs font-semibold uppercase text-emerald-800/80"
                >
                  Credit application link
                </label>
                <input
                  id="credit-application-link"
                  readOnly
                  value={query.credit_application_link}
                  className="soft-control mt-2 w-full bg-white/85 font-mono text-xs"
                />
              </div>
            ) : null}
            {query.credit_application_error ? (
              <div className="mt-5 rounded-[18px] border border-rose-100 bg-rose-50/90 p-4 text-sm font-medium text-rose-800">
                {query.credit_application_error}
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
                    <form action={requestChangesAction} className="space-y-3">
                      <textarea
                        name="change_request_comment"
                        className="soft-control min-h-24 w-full resize-none py-3"
                        placeholder="What needs to change?"
                        required
                      />
                      <Button
                        type="submit"
                        variant="outline"
                        className="h-11 w-full rounded-full bg-amber-50 text-amber-800 hover:bg-amber-100"
                      >
                        Request changes
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
                        placeholder="Win note"
                      />
                      <Button
                        type="submit"
                        className="h-11 w-full rounded-full bg-emerald-600 text-white hover:bg-emerald-700"
                      >
                        <CheckCircle2 className="size-4" />
                        Mark won
                      </Button>
                    </form>
                    <form action={declinedAction} className="space-y-3">
                      <textarea
                        name="customer_response_note"
                        className="soft-control min-h-24 w-full resize-none py-3"
                        placeholder="Loss note"
                      />
                      <Button
                        type="submit"
                        variant="outline"
                        className="h-11 w-full rounded-full bg-rose-50 text-rose-700 hover:bg-rose-100"
                      >
                        <XCircle className="size-4" />
                        Mark lost
                      </Button>
                    </form>
                  </div>
                ) : null}
              </div>
            ) : null}
            {canSendCustomerEmail || canCreateCustomerLink ? (
              <div className="mt-3 grid gap-3">
                {canSendCustomerEmail ? (
                  <Link href={`/quotes/${quote.id}/send`} className="block">
                    <Button type="button" className="h-11 w-full rounded-full">
                      <Send className="size-4" />
                      Preview and send PDF quote
                    </Button>
                  </Link>
                ) : null}
                {canCreateCustomerLink ? (
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
                ) : null}
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
            {canSendCreditApplication ? (
              <div className="mt-3 grid gap-3 rounded-[18px] border border-white/70 bg-white/65 p-4">
                <div>
                  <p className="text-sm font-semibold">Credit application</p>
                  <p className="mt-1 text-sm leading-6 text-muted-foreground">
                    Send the accepted customer an electronic credit application,
                    or create a secure link to share manually.
                  </p>
                </div>
                <form action={sendCreditApplicationAction}>
                  <Button type="submit" className="h-11 w-full rounded-full">
                    <Send className="size-4" />
                    Email credit application
                  </Button>
                </form>
                <form action={createCreditApplicationLinkAction}>
                  <Button
                    type="submit"
                    variant="outline"
                    className="h-11 w-full rounded-full bg-white/70"
                  >
                    <Share2 className="size-4" />
                    Create application link
                  </Button>
                </form>
              </div>
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
                icon={MessageSquare}
                kicker="Feedback"
                title="Customer follow-up notes"
              />
              {canRecordCustomerResponse ? (
                <form action={recordFeedbackAction} className="mt-5 space-y-3">
                  <select
                    name="feedback_type"
                    className="soft-control h-11 w-full"
                    defaultValue="general"
                  >
                    <option value="price_too_high">Price too high</option>
                    <option value="question">Question</option>
                    <option value="requested_change">Requested change</option>
                    <option value="timing">Timing</option>
                    <option value="general">General</option>
                  </select>
                  <textarea
                    name="feedback_note"
                    className="soft-control min-h-24 w-full resize-none py-3"
                    placeholder="What did the customer say?"
                    required
                  />
                  <Button type="submit" className="h-11 w-full rounded-full">
                    <MessageSquare className="size-4" />
                    Record feedback
                  </Button>
                </form>
              ) : null}
              <div className="mt-5 space-y-3">
                {quote.feedbackEntries.length ? (
                  quote.feedbackEntries.map((entry) => (
                    <div key={entry.id} className="soft-row px-4 py-3">
                      <div className="flex items-start justify-between gap-3">
                        <p className="text-sm font-semibold">
                          {formatFeedbackType(entry.feedback_type)}
                        </p>
                        <span className="shrink-0 text-xs text-muted-foreground">
                          {formatDateTime(entry.created_at)}
                        </span>
                      </div>
                      <p className="mt-2 whitespace-pre-line text-sm leading-6 text-muted-foreground">
                        {entry.note}
                      </p>
                      <p className="mt-2 text-xs text-muted-foreground">
                        {entry.user_name ?? "System"}
                      </p>
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-muted-foreground">
                    No customer feedback recorded yet.
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
                {quote.publicEvents.length ? (
                  <div className="rounded-[18px] border border-border bg-secondary p-4 text-secondary-foreground">
                    <p className="text-sm font-semibold">
                      Customer activity
                    </p>
                    <div className="mt-3 space-y-2">
                      {quote.publicEvents.map((event) => (
                        <div
                          key={event.id}
                          className="rounded-[14px] bg-white/80 px-3 py-2 text-xs"
                        >
                          <div className="flex items-center justify-between gap-3">
                            <span className="font-semibold">
                              {formatPublicEvent(event.event_type)}
                            </span>
                            <span className="text-muted-foreground">
                              {formatDateTime(event.created_at)}
                            </span>
                          </div>
                          <p className="mt-1 truncate text-muted-foreground">
                            {[event.request_ip, publicEventDetail(event.metadata)]
                              .filter(Boolean)
                              .join(" - ") || "Customer quote link"}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}
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
          {formatCurrency(item.markup_per_unit)} / {item.unit} | Sell{" "}
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
    changes_requested: "bg-orange-50 text-orange-700 ring-orange-100",
    approved: "bg-emerald-50 text-emerald-700 ring-emerald-100",
    rejected: "bg-rose-50 text-rose-700 ring-rose-100",
    sent: "bg-cyan-50 text-cyan-700 ring-cyan-100",
    viewed: "bg-indigo-50 text-indigo-700 ring-indigo-100",
    follow_up: "bg-violet-50 text-violet-700 ring-violet-100",
    won: "bg-lime-50 text-lime-700 ring-lime-100",
    lost: "bg-orange-50 text-orange-700 ring-orange-100",
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

function formatPublicEvent(eventType: string) {
  return eventType
    .split("_")
    .map(formatStatus)
    .join(" ");
}

function formatFeedbackType(feedbackType: string) {
  return feedbackType
    .split("_")
    .map(formatStatus)
    .join(" ");
}

function publicEventDetail(metadata: Record<string, unknown>) {
  const transactionId = metadata.transaction_id;
  const viewCount = metadata.view_count;
  const signerName = metadata.signer_name;

  if (typeof transactionId === "string" && transactionId) {
    return `Transaction ${transactionId}`;
  }

  if (typeof signerName === "string" && signerName) {
    return `Signed by ${signerName}`;
  }

  if (typeof viewCount === "number") {
    return `View ${viewCount}`;
  }

  return "";
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

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${value}T00:00:00.000Z`));
}

function formatAccountType(value: string) {
  return value === "contractor" ? "Contractor" : "Non-contractor";
}

function formatProjectStatus(value: string) {
  return value === "bid" ? "Bid" : "Existing job";
}

function emailStatusMessage(status: string) {
  if (status === "sent") {
    return "Quote email sent";
  }

  if (status === "skipped") {
    return "Email provider not configured; customer link created";
  }

  if (status === "failed") {
    return "Email delivery failed; customer link created";
  }

  return "Customer link created";
}

function creditApplicationStatusMessage(status?: string) {
  if (status === "sent") {
    return "Credit application email sent";
  }

  if (status === "skipped") {
    return "Credit application link created; Gmail was not connected";
  }

  if (status === "failed") {
    return "Credit application email failed; link created";
  }

  return "Credit application link created";
}
