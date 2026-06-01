"use client";

import { useActionState } from "react";
import { Calculator, FilePlus2, MapPin, PackageOpen, UserRound } from "lucide-react";

import {
  createQuoteDraft,
  type CreateQuoteState,
} from "@/app/(dashboard)/quotes/new/actions";
import { Button } from "@/components/ui/button";
import type { NewQuoteContext } from "@/lib/quotes/new-quote";

const initialState: CreateQuoteState = {
  message: "",
  status: "idle",
};

export function QuoteDraftForm({ context }: { context: NewQuoteContext }) {
  const [state, formAction, isPending] = useActionState(
    createQuoteDraft,
    initialState,
  );

  return (
    <form action={formAction} className="grid gap-6 lg:grid-cols-[1fr_0.8fr]">
      <div className="space-y-6">
        <section className="glass-panel p-5 sm:p-6">
          <SectionHeader
            icon={UserRound}
            kicker="Customer"
            title="Who is this quote for?"
          />
          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <Field label="Existing customer">
              <select name="customer_id" className="soft-control w-full">
                <option value="">Create or select...</option>
                {context.customers.map((customer) => (
                  <option key={customer.id} value={customer.id}>
                    {customer.name}
                    {customer.contact_name ? ` - ${customer.contact_name}` : ""}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="New customer">
              <input
                name="customer_name"
                className="soft-control w-full"
                placeholder="Customer name"
              />
            </Field>
            <Field label="Contact name">
              <input
                name="contact_name"
                className="soft-control w-full"
                placeholder="Estimator contact"
              />
            </Field>
            <Field label="Contact email">
              <input
                name="contact_email"
                type="email"
                className="soft-control w-full"
                placeholder="name@example.com"
              />
            </Field>
            <Field label="Contact phone">
              <input
                name="contact_phone"
                className="soft-control w-full"
                placeholder="555-0101"
              />
            </Field>
          </div>
        </section>

        <section className="glass-panel p-5 sm:p-6">
          <SectionHeader
            icon={MapPin}
            kicker="Job Site"
            title="Where is the material going?"
          />
          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <Field label="Existing job site">
              <select name="job_site_id" className="soft-control w-full">
                <option value="">Create or select...</option>
                {context.jobSites.map((site) => (
                  <option key={site.id} value={site.id}>
                    {site.name} - {site.city}, {site.state}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="New site name">
              <input
                name="site_name"
                className="soft-control w-full"
                placeholder="Project or site name"
              />
            </Field>
            <Field label="Address">
              <input
                name="site_address"
                className="soft-control w-full"
                placeholder="Street address"
              />
            </Field>
            <Field label="City">
              <input
                name="site_city"
                className="soft-control w-full"
                placeholder="Los Angeles"
              />
            </Field>
            <Field label="County">
              <input
                name="site_county"
                className="soft-control w-full"
                placeholder="Los Angeles"
              />
            </Field>
            <Field label="State">
              <input
                name="site_state"
                className="soft-control w-full"
                defaultValue="CA"
                maxLength={2}
              />
            </Field>
            <Field label="Latitude">
              <input
                name="site_latitude"
                type="number"
                step="0.0000001"
                className="soft-control w-full"
              />
            </Field>
            <Field label="Longitude">
              <input
                name="site_longitude"
                type="number"
                step="0.0000001"
                className="soft-control w-full"
              />
            </Field>
          </div>
        </section>
      </div>

      <aside className="space-y-6">
        <section className="glass-panel p-5 sm:p-6">
          <SectionHeader
            icon={PackageOpen}
            kicker="Material"
            title="One-line draft estimate"
          />
          <div className="mt-5 space-y-4">
            <Field label="Material">
              <select name="material_id" className="soft-control w-full" required>
                <option value="">Select material...</option>
                {context.materials.map((material) => (
                  <option key={material.id} value={material.id}>
                    {material.supplier_name} - {material.name} ({material.tier})
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Quantity">
              <input
                name="quantity"
                type="number"
                min="0.01"
                step="0.01"
                className="soft-control w-full"
                placeholder="10"
                required
              />
            </Field>
            <Field label="Tax area">
              <select name="tax_rate_id" className="soft-control w-full" required>
                <option value="">Select tax area...</option>
                {context.taxRates.map((taxRate) => (
                  <option key={taxRate.id} value={taxRate.id}>
                    {taxRate.city}, {taxRate.state} -{" "}
                    {(taxRate.rate * 100).toFixed(2)}%
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Notes">
              <textarea
                name="notes"
                className="soft-control min-h-28 w-full resize-none py-3"
                placeholder="Internal notes for this draft"
              />
            </Field>
          </div>
        </section>

        <section className="glass-panel p-5 sm:p-6">
          <SectionHeader
            icon={Calculator}
            kicker="Calculation"
            title="Server-priced draft"
          />
          {context.sampleCalculation ? (
            <div className="mt-5 space-y-3">
              <SummaryRow
                label="Example material"
                value={formatCurrency(context.sampleCalculation.materialSubtotal)}
              />
              <SummaryRow
                label="Example trucking"
                value={formatCurrency(context.sampleCalculation.truckingSubtotal)}
              />
              <SummaryRow
                label="Example loads"
                value={`${context.sampleCalculation.loadCount.toFixed(0)}${
                  context.sampleCalculation.vehicleName
                    ? ` via ${context.sampleCalculation.vehicleName}`
                    : ""
                }`}
              />
              <SummaryRow
                label="Example fees"
                value={formatCurrency(context.sampleCalculation.feesSubtotal)}
              />
              <SummaryRow
                label="Example tax"
                value={formatCurrency(context.sampleCalculation.taxTotal)}
              />
              <SummaryRow
                label="Example total"
                value={formatCurrency(context.sampleCalculation.total)}
                strong
              />
            </div>
          ) : (
            <p className="mt-5 text-sm leading-6 text-muted-foreground">
              Load material, tax, and pricing config to preview calculated
              totals.
            </p>
          )}
          <Button
            type="submit"
            disabled={isPending || !context.quoteCreationEnabled}
            className="mt-6 h-11 w-full rounded-full"
          >
            <FilePlus2 className="size-4" />
            {isPending ? "Saving..." : "Save draft quote"}
          </Button>
          {state.message ? (
            <p className="mt-4 rounded-[16px] bg-rose-50 px-4 py-3 text-sm text-rose-700 ring-1 ring-rose-100">
              {state.message}
            </p>
          ) : null}
        </section>
      </aside>
    </form>
  );
}

function SectionHeader({
  icon: Icon,
  kicker,
  title,
}: {
  icon: typeof UserRound;
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

function SummaryRow({
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

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(value);
}
