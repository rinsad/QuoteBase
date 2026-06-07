"use client";

import { useActionState, useMemo, useState } from "react";
import {
  BrainCircuit,
  Calculator,
  FilePlus2,
  GitPullRequestArrow,
  MapPin,
  PackageOpen,
  ShieldCheck,
  TrendingUp,
  UserRound,
} from "lucide-react";

import {
  createQuoteDraft,
  type CreateQuoteState,
} from "@/app/(dashboard)/quotes/new/actions";
import { Button } from "@/components/ui/button";
import { calculateQuoteDraft } from "@/lib/quotes/pricing";
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
  const [materialId, setMaterialId] = useState("");
  const [taxRateId, setTaxRateId] = useState("");
  const [quantity, setQuantity] = useState("");
  const selectedMaterial = context.materials.find(
    (material) => material.id === materialId,
  );
  const selectedTaxRate = context.taxRates.find(
    (taxRate) => taxRate.id === taxRateId,
  );
  const quantityValue = Number(quantity);
  const liveCalculation = useMemo(() => {
    if (
      !selectedMaterial ||
      !selectedTaxRate ||
      !context.pricingConfig ||
      !Number.isFinite(quantityValue) ||
      quantityValue <= 0
    ) {
      return null;
    }

    return calculateQuoteDraft({
      costPerUnit: selectedMaterial.cost_per_unit,
      quantity: quantityValue,
      tier: selectedMaterial.tier,
      unit: selectedMaterial.unit,
      taxRate: selectedTaxRate.rate,
      pricingConfig: context.pricingConfig,
      vehicleTypes: context.vehicleTypes,
    });
  }, [
    context.pricingConfig,
    context.vehicleTypes,
    quantityValue,
    selectedMaterial,
    selectedTaxRate,
  ]);
  const margin =
    liveCalculation && selectedMaterial && liveCalculation.materialSubtotal > 0
      ? ((liveCalculation.materialSubtotal -
          selectedMaterial.cost_per_unit * quantityValue) /
          liveCalculation.materialSubtotal) *
        100
      : null;

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
              <select
                name="material_id"
                className="soft-control w-full"
                value={materialId}
                onChange={(event) => setMaterialId(event.target.value)}
                required
              >
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
                value={quantity}
                onChange={(event) => setQuantity(event.target.value)}
                required
              />
            </Field>
            <Field label="Tax area">
              <select
                name="tax_rate_id"
                className="soft-control w-full"
                value={taxRateId}
                onChange={(event) => setTaxRateId(event.target.value)}
                required
              >
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
            icon={BrainCircuit}
            kicker="Pricing Logic"
            title="John's distributor rules"
          />
          {liveCalculation && selectedMaterial && selectedTaxRate ? (
            <div className="mt-5 space-y-4">
              <div className="rounded-[18px] border border-blue-100 bg-blue-50/70 p-4">
                <div className="flex items-center gap-3">
                  <div className="icon-well bg-white text-blue-700">
                    <TrendingUp className="size-5" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold">
                      {selectedMaterial.tier} markup applied
                    </p>
                    <p className="text-sm text-muted-foreground">
                      Buy at {formatCurrency(selectedMaterial.cost_per_unit)} /
                      {selectedMaterial.unit}; sell at{" "}
                      {formatCurrency(liveCalculation.materialUnitPrice)} /
                      {selectedMaterial.unit}.
                    </p>
                  </div>
                </div>
              </div>

              <SummaryRow
                label="Markup"
                value={`${liveCalculation.markupPct.toFixed(2)}%`}
              />
              <SummaryRow
                label="Material revenue"
                value={formatCurrency(liveCalculation.materialSubtotal)}
              />
              <SummaryRow
                label="Gross material margin"
                value={margin === null ? "Pending" : `${margin.toFixed(1)}%`}
              />
              <SummaryRow
                label="Truck plan"
                value={`${liveCalculation.loadCount.toFixed(0)} load${
                  liveCalculation.loadCount === 1 ? "" : "s"
                }${
                  liveCalculation.vehicleName
                    ? ` via ${liveCalculation.vehicleName}`
                    : ""
                }`}
              />
              <SummaryRow
                label="Trucking"
                value={formatCurrency(liveCalculation.truckingSubtotal)}
              />
              <SummaryRow
                label="Fuel/environmental fees"
                value={formatCurrency(liveCalculation.feesSubtotal)}
              />
              <SummaryRow
                label={`Tax (${(selectedTaxRate.rate * 100).toFixed(2)}%)`}
                value={formatCurrency(liveCalculation.taxTotal)}
              />
              <SummaryRow
                label="Draft quote total"
                value={formatCurrency(liveCalculation.total)}
                strong
              />

              <div className="grid gap-3">
                <LogicCallout
                  icon={ShieldCheck}
                  title="Approval rule"
                  text="The rep can save this as a draft; John reviews the calculated total before it becomes customer-facing."
                />
                <LogicCallout
                  icon={GitPullRequestArrow}
                  title="Integration path"
                  text="This draft is ready to route to Slack approval now, and later to Quoter, Pipedrive, or QuoteBase CRM."
                />
              </div>
            </div>
          ) : (
            <p className="mt-5 text-sm leading-6 text-muted-foreground">
              Select a material, quantity, and tax area to see the markup,
              trucking, fees, margin, and approval logic before saving.
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

function LogicCallout({
  icon: Icon,
  title,
  text,
}: {
  icon: typeof Calculator;
  title: string;
  text: string;
}) {
  return (
    <div className="soft-row flex gap-3 p-4">
      <Icon className="mt-0.5 size-4 shrink-0 text-blue-700" />
      <div>
        <p className="text-sm font-semibold">{title}</p>
        <p className="mt-1 text-sm leading-6 text-muted-foreground">{text}</p>
      </div>
    </div>
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
