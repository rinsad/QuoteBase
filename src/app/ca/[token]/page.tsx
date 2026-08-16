import { CalendarDays, CheckCircle2, FileSignature, ShieldCheck } from "lucide-react";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";

import { submitCreditApplication } from "@/app/ca/[token]/actions";
import { DatePicker } from "@/components/ui/date-picker";
import { getCreditApplicationByToken } from "@/lib/quotes/credit-applications";

export default async function CreditApplicationPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ error?: string; submitted?: string }>;
}) {
  const [{ token }, query] = await Promise.all([params, searchParams]);

  if (!/^[A-Za-z0-9_-]{32,256}$/.test(token)) {
    notFound();
  }

  const application = await getCreditApplicationByToken(token);

  if (!application) {
    notFound();
  }

  if (query.submitted === "1" || application.status === "submitted") {
    return (
      <main className="min-h-screen bg-[linear-gradient(135deg,#f8fbff_0%,#eef5fb_46%,#e9f6f3_100%)] px-4 py-8 text-slate-950">
        <section className="mx-auto max-w-2xl rounded-[28px] border border-white/80 bg-white p-8 shadow-[0_24px_80px_rgba(59,91,152,0.14)]">
          <div className="inline-flex size-12 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-700">
            <CheckCircle2 className="size-6" />
          </div>
          <h1 className="mt-6 text-3xl font-semibold">
            Credit application submitted
          </h1>
          <p className="mt-3 leading-7 text-slate-600">
            Thank you. {application.branding.company_name} has received the
            electronic credit application for quote {application.quote_number}.
          </p>
        </section>
      </main>
    );
  }

  const submitAction = submitCreditApplication.bind(null, token);

  return (
    <main className="min-h-screen bg-[linear-gradient(135deg,#f8fbff_0%,#eef5fb_46%,#e9f6f3_100%)] px-4 py-8 text-slate-950">
      <form
        action={submitAction}
        className="mx-auto max-w-5xl overflow-hidden rounded-[28px] border border-white/80 bg-white shadow-[0_24px_80px_rgba(59,91,152,0.14)]"
      >
        <header className="border-b border-slate-200 bg-[linear-gradient(90deg,rgba(255,255,255,0.96),rgba(234,246,255,0.82))] p-8">
          <div className="flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="text-sm font-semibold uppercase text-sky-700">
                {application.branding.company_name}
              </p>
              <h1 className="mt-3 text-4xl font-semibold">
                Credit application
              </h1>
              <p className="mt-3 max-w-2xl leading-7 text-slate-600">
                Complete this application for {application.customer.name} after
                accepting quote {application.quote_number}.
              </p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white/80 p-4 text-sm">
              <InfoLine
                icon={CalendarDays}
                label="Expires"
                value={formatDate(application.expires_at)}
              />
            </div>
          </div>
        </header>

        {query.error ? (
          <div className="mx-8 mt-8 rounded-[18px] border border-rose-100 bg-rose-50 p-4 text-sm font-medium text-rose-800">
            {query.error}
          </div>
        ) : null}

        <div className="space-y-8 p-8">
          <FormSection
            icon={FileSignature}
            title="Company information"
            description="Tell us who the credit account is for."
          >
            <Field name="company_name" label="Company name" required />
            <Field name="office_address" label="Office address" required wide />
            <Field name="mailing_address" label="Mailing address" wide />
            <Field name="office_telephone" label="Office telephone" required />
            <Field name="fax" label="Fax" />
            <SelectField
              name="business_type"
              label="Business type"
              required
              options={["Sole", "Partnership", "Corporation", "LLC"]}
            />
            <Field name="federal_tax_id" label="Federal tax ID" />
            <Field name="contractor_license" label="Contractor license number" />
            <Field
              name="business_email"
              label="Business email"
              type="email"
              required
            />
            <Field name="company_website" label="Company website" />
            <Field name="dun_bradstreet" label="Dun & Bradstreet number" />
            <Field name="in_business_since" label="In business since" />
          </FormSection>

          <FormSection
            icon={ShieldCheck}
            title="Ordering preferences"
            description="These details help the team handle orders correctly."
          >
            <SelectField
              name="uses_po_number"
              label="Use PO numbers?"
              options={["Yes", "No"]}
            />
            <SelectField
              name="uses_job_number"
              label="Use job numbers?"
              options={["Yes", "No"]}
            />
            <Field
              name="purchasing_agents"
              label="Authorized purchasing agents"
              wide
            />
            <Field
              name="purchasing_agent_emails"
              label="Purchasing agent emails"
              wide
            />
            <Field name="order_frequency" label="Order frequency" />
            <Field
              name="common_materials"
              label="Common sand/gravel materials ordered"
              wide
            />
            <TextAreaField
              name="special_procedures"
              label="Special procedures"
              wide
            />
          </FormSection>

          <FormSection
            icon={FileSignature}
            title="Principals"
            description="Add up to two principals. Use last 4 digits only for SSN."
          >
            {[1, 2].map((index) => (
              <fieldset
                key={index}
                className="grid gap-4 rounded-[18px] border border-slate-200 p-4 md:col-span-2 md:grid-cols-2"
              >
                <legend className="px-2 text-sm font-semibold text-slate-600">
                  Principal {index}
                </legend>
                <Field name={`principal_${index}_name`} label="Name" />
                <Field name={`principal_${index}_title`} label="Title" />
                <Field name={`principal_${index}_telephone`} label="Telephone" />
                <Field name={`principal_${index}_ssn_last4`} label="SSN last 4" />
                <Field
                  name={`principal_${index}_home_address`}
                  label="Home address"
                  wide
                />
              </fieldset>
            ))}
          </FormSection>

          <FormSection
            icon={ShieldCheck}
            title="Bank and credit"
            description="Use last 4 digits only for account number."
          >
            <Field name="bank_name" label="Company bank name" />
            <Field name="bank_address" label="Bank address" />
            <Field name="bank_account_last4" label="Bank account last 4" />
            <Field name="bank_contact_title" label="Bank contact/title" />
            <Field
              name="credit_requirement_monthly"
              label="Credit requirement per month"
              required
            />
            <SelectField
              name="subject_to_sales_tax"
              label="Subject to sales tax?"
              options={["Yes", "No"]}
            />
            <Field name="resale_number" label="Resale number" />
          </FormSection>

          <FormSection
            icon={FileSignature}
            title="Trade references"
            description="The original account application asks for five trade references."
          >
            {[1, 2, 3, 4, 5].map((index) => (
              <fieldset
                key={index}
                className="grid gap-4 rounded-[18px] border border-slate-200 p-4 md:col-span-2 md:grid-cols-5"
              >
                <legend className="px-2 text-sm font-semibold text-slate-600">
                  Reference {index}
                </legend>
                <Field name={`trade_${index}_name`} label="Name" compact />
                <Field name={`trade_${index}_telephone`} label="Telephone" compact />
                <Field name={`trade_${index}_fax`} label="Fax" compact />
                <Field
                  name={`trade_${index}_average_balance`}
                  label="Average balance"
                  compact
                />
                <Field name={`trade_${index}_contact`} label="Contact" compact />
              </fieldset>
            ))}
          </FormSection>

          <FormSection
            icon={ShieldCheck}
            title="Terms and signature"
            description="Typed signature records the signer, title, timestamp, IP, and browser details."
          >
            <SelectField
              name="sued_by_vendors"
              label="Has the company ever been sued by vendors?"
              options={["No", "Yes"]}
            />
            <TextAreaField
              name="vendor_lawsuit_explanation"
              label="If yes, explain"
              wide
            />
            <Field
              name="credit_terms_initials_page_1"
              label="Credit terms initials - page 1"
              required
            />
            <Field
              name="credit_terms_initials_page_2"
              label="Credit terms initials - page 2"
              required
            />
            <Field
              name="credit_terms_initials_page_3"
              label="Credit terms initials - page 3"
              required
            />
            <Field name="signature_name" label="Signature name" required />
            <Field name="signature_title" label="Title" required />
            <Field name="personal_guaranty_name" label="Personal guaranty name" />
            <Field
              name="personal_guaranty_signature"
              label="Personal guaranty signature"
            />
            <Field
              name="personal_guaranty_date"
              label="Personal guaranty date"
              type="date"
            />
          </FormSection>
        </div>

        <footer className="border-t border-slate-200 bg-slate-50 p-8">
          <button
            type="submit"
            className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-full bg-emerald-600 px-6 text-sm font-semibold text-white shadow-[0_14px_32px_rgba(5,150,105,0.24)] transition hover:bg-emerald-700 sm:w-auto"
          >
            <CheckCircle2 className="size-4" />
            Submit credit application
          </button>
        </footer>
      </form>
    </main>
  );
}

function FormSection({
  icon: Icon,
  title,
  description,
  children,
}: {
  icon: typeof FileSignature;
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-[24px] border border-slate-200 bg-white p-5">
      <div className="flex items-start gap-4">
        <div className="inline-flex size-11 shrink-0 items-center justify-center rounded-2xl bg-sky-50 text-sky-700">
          <Icon className="size-5" />
        </div>
        <div>
          <h2 className="text-xl font-semibold">{title}</h2>
          <p className="mt-1 text-sm leading-6 text-slate-600">{description}</p>
        </div>
      </div>
      <div className="mt-5 grid gap-4 md:grid-cols-2">{children}</div>
    </section>
  );
}

function Field({
  name,
  label,
  type = "text",
  required = false,
  wide = false,
  compact = false,
}: {
  name: string;
  label: string;
  type?: string;
  required?: boolean;
  wide?: boolean;
  compact?: boolean;
}) {
  return (
    <label className={wide ? "block md:col-span-2" : "block"}>
      <span className="text-sm font-medium text-slate-600">
        {label}
        {required ? <span className="text-rose-600"> *</span> : null}
      </span>
      {type === "date" ? (
        <DatePicker
          name={name}
          required={required}
          className={`mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm outline-none transition focus:border-sky-400 focus:ring-4 focus:ring-sky-100 ${compact ? "h-10" : "h-12"}`}
        />
      ) : (
        <input
          name={name}
          type={type}
          required={required}
          className={`mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm outline-none transition focus:border-sky-400 focus:ring-4 focus:ring-sky-100 ${compact ? "h-10" : "h-12"}`}
        />
      )}
    </label>
  );
}

function TextAreaField({
  name,
  label,
  wide = false,
}: {
  name: string;
  label: string;
  wide?: boolean;
}) {
  return (
    <label className={wide ? "block md:col-span-2" : "block"}>
      <span className="text-sm font-medium text-slate-600">{label}</span>
      <textarea
        name={name}
        rows={4}
        className="mt-2 w-full resize-none rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-sky-400 focus:ring-4 focus:ring-sky-100"
      />
    </label>
  );
}

function SelectField({
  name,
  label,
  options,
  required = false,
}: {
  name: string;
  label: string;
  options: string[];
  required?: boolean;
}) {
  return (
    <label className="block">
      <span className="text-sm font-medium text-slate-600">
        {label}
        {required ? <span className="text-rose-600"> *</span> : null}
      </span>
      <select
        name={name}
        required={required}
        className="mt-2 h-12 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm outline-none transition focus:border-sky-400 focus:ring-4 focus:ring-sky-100"
        defaultValue=""
      >
        <option value="" disabled={required}>
          Select...
        </option>
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    </label>
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
      <p className="mt-1 inline-flex items-center gap-2 font-semibold">
        <Icon className="size-4 text-sky-700" />
        {value}
      </p>
    </div>
  );
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  }).format(new Date(value));
}
