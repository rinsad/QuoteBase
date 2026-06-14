"use client";

import { useActionState, useMemo, useState } from "react";
import {
  Award,
  BrainCircuit,
  Calculator,
  FilePlus2,
  GitPullRequestArrow,
  MapPin,
  PackageOpen,
  Route,
  ShieldCheck,
  TrendingUp,
  UserRound,
} from "lucide-react";

import {
  createQuoteDraft,
  type CreateQuoteState,
} from "@/app/(dashboard)/quotes/new/actions";
import { Button } from "@/components/ui/button";
import {
  calculateQuoteDraft,
  type QuoteDraftCalculation,
} from "@/lib/quotes/pricing";
import type { NewQuoteContext } from "@/lib/quotes/new-quote";

const initialState: CreateQuoteState = {
  message: "",
  status: "idle",
  fieldErrors: {},
};
export function QuoteDraftForm({
  context,
  userRole,
}: {
  context: NewQuoteContext;
  userRole: "admin" | "account_manager" | "estimator";
}) {
  const [state, formAction, isPending] = useActionState(
    createQuoteDraft,
    initialState,
  );
  const [customerId, setCustomerId] = useState("");
  const [materialId, setMaterialId] = useState("");
  const [taxRateId, setTaxRateId] = useState("");
  const [quantity, setQuantity] = useState("");
  const [materialUnitPriceOverride, setMaterialUnitPriceOverride] =
    useState("");
  const [materialMinimumOverride, setMaterialMinimumOverride] = useState("");
  const [truckingMinimumOverride, setTruckingMinimumOverride] = useState("");
  const [truckRateOverride, setTruckRateOverride] = useState("");
  const [jobSiteId, setJobSiteId] = useState("");
  const [paymentTerms, setPaymentTerms] = useState("");
  const selectedJobSite = context.jobSites.find((site) => site.id === jobSiteId);
  const siteCity = selectedJobSite?.city ?? "";
  const siteCounty = selectedJobSite?.county ?? "";
  const siteState = selectedJobSite?.state ?? "";
  const selectedMaterial = context.materials.find(
    (material) => material.id === materialId,
  );
  const selectedTaxRate =
    context.taxRates.find((taxRate) => taxRate.id === taxRateId) ??
    findTaxRateForDelivery({
      taxRates: context.taxRates,
      city: siteCity,
      county: siteCounty,
      state: siteState,
    });
  const selectedCustomer = context.customers.find(
    (customer) => customer.id === customerId,
  );
  const filteredJobSites = customerId
    ? context.jobSites.filter((site) => site.customer_id === customerId)
    : context.jobSites;
  const quantityValue = Number(quantity);
  const materialUnitPriceOverrideValue = Number(materialUnitPriceOverride);
  const activeMaterialUnitPriceOverride =
    Number.isFinite(materialUnitPriceOverrideValue) &&
    materialUnitPriceOverrideValue > 0
      ? materialUnitPriceOverrideValue
      : null;
  const materialMinimumOverrideValue = Number(materialMinimumOverride);
  const activeMaterialMinimumOverride =
    materialMinimumOverride !== "" &&
    Number.isFinite(materialMinimumOverrideValue) &&
    materialMinimumOverrideValue >= 0
      ? materialMinimumOverrideValue
      : null;
  const truckingMinimumOverrideValue = Number(truckingMinimumOverride);
  const activeTruckingMinimumOverride =
    truckingMinimumOverride !== "" &&
    Number.isFinite(truckingMinimumOverrideValue) &&
    truckingMinimumOverrideValue >= 0
      ? truckingMinimumOverrideValue
      : null;
  const activeTruckRateOverride =
    userRole === "admin" && isTruckRateKey(truckRateOverride)
      ? truckRateOverride
      : null;
  const recommendation = useMemo(() => {
    if (
      !selectedMaterial ||
      !selectedTaxRate ||
      !context.pricingConfig ||
      !Number.isFinite(quantityValue) ||
      quantityValue <= 0
    ) {
      return null;
    }
    const pricingConfig = context.pricingConfig;

    const rankedOptions = context.materials
      .filter(
        (material) =>
          material.name === selectedMaterial.name &&
          material.unit === selectedMaterial.unit &&
          material.tier === selectedMaterial.tier,
      )
      .map((material) => ({
        material,
        calculation: calculateQuoteDraft({
          costPerUnit: material.cost_per_unit,
          quantity: quantityValue,
          tier: material.tier,
          unit: material.unit,
          taxRate: selectedTaxRate.rate,
          pricingConfig,
          vehicleTypes: context.vehicleTypes,
          materialUnitPriceOverride: activeMaterialUnitPriceOverride,
          truckRateOverride: activeTruckRateOverride,
          materialMinimumOverride: activeMaterialMinimumOverride,
          truckingMinimumOverride: activeTruckingMinimumOverride,
          paymentTerms,
        }),
      }))
      .sort((left, right) => {
        return (
          left.calculation.total - right.calculation.total ||
          left.calculation.materialSubtotal -
            right.calculation.materialSubtotal
        );
      });
    const selectedOption = rankedOptions.find(
      (option) => option.material.id === selectedMaterial.id,
    );
    const recommendedOption = rankedOptions[0] ?? selectedOption ?? null;

    if (!selectedOption || !recommendedOption) {
      return null;
    }

    return {
      selected: selectedOption,
      recommended: recommendedOption,
      alternatives: rankedOptions.slice(1, 3),
      isSelectedRecommended:
        selectedOption.material.id === recommendedOption.material.id,
    };
  }, [
    context.materials,
    context.pricingConfig,
    context.vehicleTypes,
    activeMaterialUnitPriceOverride,
    activeMaterialMinimumOverride,
    activeTruckingMinimumOverride,
    activeTruckRateOverride,
    quantityValue,
    paymentTerms,
    selectedMaterial,
    selectedTaxRate,
  ]);
  const liveCalculation = recommendation?.selected.calculation ?? null;
  const margin =
    liveCalculation && selectedMaterial && liveCalculation.materialSubtotal > 0
      ? ((liveCalculation.materialSubtotal -
          selectedMaterial.cost_per_unit * quantityValue) /
          liveCalculation.materialSubtotal) *
        100
      : null;
  function handleCustomerChange(nextCustomerId: string) {
    setCustomerId(nextCustomerId);
    const nextCustomer = context.customers.find(
      (customer) => customer.id === nextCustomerId,
    );
    setPaymentTerms(nextCustomer?.payment_terms ?? "");

    if (
      jobSiteId &&
      nextCustomerId &&
      selectedJobSite?.customer_id !== nextCustomerId
    ) {
      clearSelectedJobSite();
    }
  }

  function handleJobSiteChange(nextSiteId: string) {
    setJobSiteId(nextSiteId);
    const site = context.jobSites.find((item) => item.id === nextSiteId);

    if (!site) {
      return;
    }

    if (!customerId) {
      setCustomerId(site.customer_id);
      const siteCustomer = context.customers.find(
        (customer) => customer.id === site.customer_id,
      );
      setPaymentTerms(siteCustomer?.payment_terms ?? "");
    }

    setTaxRateId("");
  }

  function clearSelectedJobSite() {
    setJobSiteId("");
    setTaxRateId("");
  }

  return (
    <form
      action={formAction}
      className="grid gap-6 lg:grid-cols-[1fr_0.8fr]"
      noValidate
    >
      <div className="space-y-6">
        <section className="glass-panel p-5 sm:p-6">
          <SectionHeader
            icon={UserRound}
            kicker="Customer"
            title="Who is this quote for?"
          />
          <div className="mt-5 grid gap-4">
            <Field
              label="Customer"
              required
              error={state.fieldErrors.customer_id}
            >
              <select
                name="customer_id"
                className="soft-control w-full"
                value={customerId}
                onChange={(event) => handleCustomerChange(event.target.value)}
                aria-invalid={Boolean(state.fieldErrors.customer_id)}
                required
              >
                <option value="">Select customer...</option>
                {context.customers.map((customer) => (
                  <option key={customer.id} value={customer.id}>
                    {customer.company_name ?? customer.name}
                    {customer.contact_name ? ` - ${customer.contact_name}` : ""}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          {selectedCustomer ? (
            <div className="mt-5 rounded-[18px] border border-white/70 bg-white/65 p-4">
              <div className="grid gap-3 sm:grid-cols-3">
                <MiniMetric
                  label="Default address"
                  value={addressLine(selectedCustomer.address) || "Not saved"}
                />
                <MiniMetric
                  label="Payment terms"
                  value={selectedCustomer.payment_terms ?? "Not saved"}
                />
                <MiniMetric
                  label="History"
                  value={`${selectedCustomer.quote_history.length} recent quote${
                    selectedCustomer.quote_history.length === 1 ? "" : "s"
                  }`}
                />
              </div>
              {selectedCustomer.quote_history.length ? (
                <div className="mt-3 space-y-2">
                  {selectedCustomer.quote_history.map((quote) => (
                    <div
                      key={quote.id}
                      className="flex items-center justify-between gap-3 rounded-xl bg-white/70 px-3 py-2 text-xs"
                    >
                      <span className="font-medium">{quote.quote_number}</span>
                      <span className="text-muted-foreground">
                        {formatStatus(quote.status)} -{" "}
                        {formatCurrency(quote.total)}
                      </span>
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}
        </section>

        <section className="glass-panel p-5 sm:p-6">
          <SectionHeader
            icon={MapPin}
            kicker="Job Site"
            title="Where is the material going?"
          />
          <div className="mt-5 grid gap-4">
            <Field
              label="Job site"
              required
              error={state.fieldErrors.job_site_id}
            >
              <select
                name="job_site_id"
                className="soft-control w-full"
                value={jobSiteId}
                onChange={(event) => handleJobSiteChange(event.target.value)}
                aria-invalid={Boolean(state.fieldErrors.job_site_id)}
                required
              >
                <option value="">Select job site...</option>
                {filteredJobSites.map((site) => (
                  <option key={site.id} value={site.id}>
                    {site.name} - {site.city}, {site.state}
                  </option>
                ))}
              </select>
              <span className="mt-2 block text-xs leading-5 text-muted-foreground">
                {customerId
                  ? "Showing saved job sites for the selected customer."
                  : "Select a customer first to narrow saved job sites."}
              </span>
            </Field>
            {selectedJobSite ? (
              <div className="rounded-[18px] border border-white/70 bg-white/65 p-4">
                <div className="grid gap-3 sm:grid-cols-3">
                  <MiniMetric
                    label="Address"
                    value={addressLine(selectedJobSite.address) || "Not saved"}
                  />
                  <MiniMetric
                    label="Tax area"
                    value={[selectedJobSite.city, selectedJobSite.county]
                      .filter(Boolean)
                      .join(", ")}
                  />
                  <MiniMetric
                    label="Coordinates"
                    value={
                      selectedJobSite.latitude !== null &&
                      selectedJobSite.longitude !== null
                        ? `${formatCoordinateInput(
                            selectedJobSite.latitude,
                          )}, ${formatCoordinateInput(selectedJobSite.longitude)}`
                        : "Not saved"
                    }
                  />
                </div>
              </div>
            ) : null}
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
            <Field label="Material" required error={state.fieldErrors.material_id}>
              <select
                name="material_id"
                className="soft-control w-full"
                value={materialId}
                onChange={(event) => setMaterialId(event.target.value)}
                required
                aria-invalid={Boolean(state.fieldErrors.material_id)}
              >
                <option value="">Select material...</option>
                {context.materials.map((material) => (
                  <option key={material.id} value={material.id}>
                    {material.supplier_name} - {material.name} ({material.tier})
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Quantity" required error={state.fieldErrors.quantity}>
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
                aria-invalid={Boolean(state.fieldErrors.quantity)}
              />
            </Field>
            <Field
              label="Manual sell price override"
              optional
              error={state.fieldErrors.material_unit_price_override}
            >
              <input
                name="material_unit_price_override"
                type="number"
                min="0.01"
                step="0.01"
                className="soft-control w-full"
                placeholder="Optional price per unit"
                value={materialUnitPriceOverride}
                onChange={(event) =>
                  setMaterialUnitPriceOverride(event.target.value)
                }
                aria-invalid={Boolean(
                  state.fieldErrors.material_unit_price_override,
                )}
              />
              <span className="mt-2 block text-xs leading-5 text-muted-foreground">
                Leave blank to use the tier recommendation. Manual overrides
                are captured in the audit log.
              </span>
            </Field>
            {context.competitiveIntelligenceEnabled ? (
              <Field
                label="Competitor price"
                optional
                error={state.fieldErrors.competitor_price}
              >
                <input
                  name="competitor_price"
                  type="number"
                  min="0.01"
                  step="0.01"
                  className="soft-control w-full"
                  placeholder="Competitor quoted price"
                  aria-invalid={Boolean(state.fieldErrors.competitor_price)}
                />
              </Field>
            ) : null}
            <div className="grid gap-4 sm:grid-cols-2">
              <Field
                label="Material minimum override"
                optional
                error={state.fieldErrors.material_minimum_override}
              >
                <input
                  name="material_minimum_override"
                  type="number"
                  min="0"
                  step="0.01"
                  className="soft-control w-full"
                  placeholder="Default minimum"
                  value={materialMinimumOverride}
                  onChange={(event) =>
                    setMaterialMinimumOverride(event.target.value)
                  }
                  aria-invalid={Boolean(
                    state.fieldErrors.material_minimum_override,
                  )}
                />
              </Field>
              <Field
                label="Trucking minimum override"
                optional
                error={state.fieldErrors.trucking_minimum_override}
              >
                <input
                  name="trucking_minimum_override"
                  type="number"
                  min="0"
                  step="0.01"
                  className="soft-control w-full"
                  placeholder="Per truck/load"
                  value={truckingMinimumOverride}
                  onChange={(event) =>
                    setTruckingMinimumOverride(event.target.value)
                  }
                  aria-invalid={Boolean(
                    state.fieldErrors.trucking_minimum_override,
                  )}
                />
              </Field>
            </div>
            <span className="block text-xs leading-5 text-muted-foreground">
              Minimum overrides require the normal admin approval step and are
              captured in the audit log.
            </span>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field
                label="Manual route miles"
                optional
                error={state.fieldErrors.manual_route_distance_miles}
              >
                <input
                  name="manual_route_distance_miles"
                  type="number"
                  min="0"
                  step="0.01"
                  className="soft-control w-full"
                  placeholder="Plant to delivery"
                  aria-invalid={Boolean(
                    state.fieldErrors.manual_route_distance_miles,
                  )}
                />
              </Field>
              <Field
                label="Manual deadhead miles"
                optional
                error={state.fieldErrors.manual_deadhead_distance_miles}
              >
                <input
                  name="manual_deadhead_distance_miles"
                  type="number"
                  min="0"
                  step="0.01"
                  className="soft-control w-full"
                  placeholder="Yard to plant"
                  aria-invalid={Boolean(
                    state.fieldErrors.manual_deadhead_distance_miles,
                  )}
                />
              </Field>
            </div>
            <Field label="Tax area" optional>
              <select
                name="tax_rate_id"
                className="soft-control w-full"
                value={taxRateId}
                onChange={(event) => setTaxRateId(event.target.value)}
              >
                <option value="">
                  Auto by delivery city
                  {selectedTaxRate
                    ? ` - ${selectedTaxRate.city} ${(selectedTaxRate.rate * 100).toFixed(2)}%`
                    : ""}
                </option>
                {context.taxRates.map((taxRate) => (
                  <option key={taxRate.id} value={taxRate.id}>
                    {taxRate.city}, {taxRate.state} -{" "}
                    {(taxRate.rate * 100).toFixed(2)}%
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Notes" optional>
              <textarea
                name="notes"
                className="soft-control min-h-28 w-full resize-none py-3"
                placeholder="Internal notes for this draft"
              />
            </Field>
            {userRole === "admin" ? (
              <Field label="Trucking rate override" optional>
                <select
                  name="truck_rate_override"
                  className="soft-control w-full"
                  value={truckRateOverride}
                  onChange={(event) => setTruckRateOverride(event.target.value)}
                >
                  <option value="">Use configured default</option>
                  <option value="floor">Floor - admin override</option>
                  <option value="standard">Standard</option>
                  <option value="target">Target</option>
                  <option value="premium">Premium</option>
                  <option value="stretch">Stretch</option>
                </select>
              </Field>
            ) : null}
            {recommendation && !recommendation.isSelectedRecommended ? (
              <label className="flex items-start gap-3 rounded-[18px] bg-amber-50/80 p-4 text-sm text-amber-900 ring-1 ring-amber-100">
                <input
                  name="use_selected_plant"
                  type="checkbox"
                  className="mt-1 size-4"
                />
                <span>
                  Override plant selection and keep{" "}
                  {recommendation.selected.material.supplier_name}. The audit
                  log will record the override.
                </span>
              </label>
            ) : null}
          </div>
        </section>

        <section className="glass-panel p-5 sm:p-6">
          <SectionHeader
            icon={BrainCircuit}
            kicker="Quote Intelligence"
            title="Distributor pricing logic"
          />
          {liveCalculation && selectedMaterial && selectedTaxRate && recommendation ? (
            <div className="mt-5 space-y-4">
              <div className="rounded-[18px] border border-blue-100 bg-blue-50/70 p-4">
                <div className="flex items-center gap-3">
                  <div className="icon-well bg-white text-blue-700">
                    <TrendingUp className="size-5" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold">
                      Recommended sell price
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {formatCurrency(liveCalculation.materialUnitPrice)} /
                      {selectedMaterial.unit} after {selectedMaterial.tier}{" "}
                      dollar markup, overhead, trucking, fees, and tax rules.
                    </p>
                  </div>
                </div>
              </div>

              <RecommendationCard
                recommendation={recommendation}
                unit={selectedMaterial.unit}
              />
              <RuleCard
                tier={selectedMaterial.tier}
                markupPct={liveCalculation.markupPct}
                markupPerUnit={liveCalculation.markupPerUnit}
                pricingConfig={context.pricingConfig}
              />
              <SummaryRow
                label="Buy cost"
                value={`${formatCurrency(selectedMaterial.cost_per_unit)} / ${
                  selectedMaterial.unit
                }`}
              />
              <SummaryRow
                label="Sell price"
                value={`${formatCurrency(liveCalculation.materialUnitPrice)} / ${
                  selectedMaterial.unit
                }`}
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
                value={`${formatCurrency(
                  liveCalculation.truckingSubtotal,
                )} at ${formatCurrency(
                  liveCalculation.truckingHourlyRate,
                )}/hr ${formatLabel(liveCalculation.truckingRateKey)}`}
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
                  title="Approval packet"
                  text="The rep saves this as a draft with the applied rules, margin, supplier recommendation, trucking plan, and total ready for review."
                />
                <LogicCallout
                  icon={Route}
                  title="Routing logic"
                  text={loadRuleText(liveCalculation)}
                />
                <LogicCallout
                  icon={GitPullRequestArrow}
                  title="Next integration step"
                  text="This draft can be routed to Slack approval first, then sent through the built-in QuoteBase workflow."
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

type Recommendation = {
  selected: {
    material: NewQuoteContext["materials"][number];
    calculation: QuoteDraftCalculation;
  };
  recommended: {
    material: NewQuoteContext["materials"][number];
    calculation: QuoteDraftCalculation;
  };
  alternatives: Array<{
    material: NewQuoteContext["materials"][number];
    calculation: QuoteDraftCalculation;
  }>;
  isSelectedRecommended: boolean;
};

function RecommendationCard({
  recommendation,
  unit,
}: {
  recommendation: Recommendation;
  unit: string;
}) {
  const savings =
    recommendation.selected.calculation.total -
    recommendation.recommended.calculation.total;

  return (
    <div className="rounded-[18px] border border-emerald-100 bg-emerald-50/70 p-4">
      <div className="flex items-start gap-3">
        <div className="icon-well bg-white text-emerald-700">
          <Award className="size-5" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">Recommended supplier</p>
          <p className="mt-1 text-sm leading-6 text-muted-foreground">
            {recommendation.recommended.material.supplier_name} is the current
            best catalog match for this material, tier, unit, and quantity.
          </p>
          <div className="mt-3 grid gap-2">
            <MiniMetric
              label="Selected supplier"
              value={recommendation.selected.material.supplier_name}
            />
            <MiniMetric
              label="Selected total"
              value={formatCurrency(recommendation.selected.calculation.total)}
            />
            <MiniMetric
              label="Recommended total"
              value={formatCurrency(recommendation.recommended.calculation.total)}
            />
            <MiniMetric
              label="Recommended sell price"
              value={`${formatCurrency(
                recommendation.recommended.calculation.materialUnitPrice,
              )} / ${unit}`}
            />
            {!recommendation.isSelectedRecommended ? (
              <MiniMetric
                label="Override visibility"
                value={formatCurrency(Math.max(0, savings))}
              />
            ) : null}
          </div>
          {!recommendation.isSelectedRecommended ? (
            <p className="mt-3 rounded-xl bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-800 ring-1 ring-amber-100">
              The selected supplier is not the recommended option. Leave the
              override unchecked to use the recommendation, or check the
              override to keep the selected plant.
            </p>
          ) : null}
          {recommendation.alternatives.length ? (
            <p className="mt-3 text-xs leading-5 text-muted-foreground">
              Next option: {recommendation.alternatives[0].material.supplier_name} at{" "}
              {formatCurrency(recommendation.alternatives[0].calculation.total)}.
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function RuleCard({
  tier,
  markupPct,
  markupPerUnit,
  pricingConfig,
}: {
  tier: NewQuoteContext["materials"][number]["tier"];
  markupPct: number;
  markupPerUnit: number;
  pricingConfig: NewQuoteContext["pricingConfig"];
}) {
  const range = pricingConfig ? tierRange(tier, pricingConfig) : null;

  return (
    <div className="soft-row p-4">
      <p className="text-sm font-semibold">Pricing rules applied</p>
      <div className="mt-3 grid gap-2">
        <MiniMetric
          label={`${tier} dollar markup`}
          value={
            range
              ? `${formatCurrency(markupPerUnit)} / unit from ${formatCurrency(
                  range[0],
                )}-${formatCurrency(
                  range[1],
                )} / unit range`
              : `${formatCurrency(markupPct)} / unit`
          }
        />
        {pricingConfig ? (
          <>
            <MiniMetric
              label="Truck rate preset"
              value={pricingConfig.default_truck_rate}
            />
            <MiniMetric
              label="Per-load fees"
              value={formatCurrency(
                pricingConfig.fuel_surcharge_per_load +
                  pricingConfig.environmental_fee_per_load,
              )}
            />
          </>
        ) : null}
      </div>
    </div>
  );
}

function MiniMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl bg-white/70 px-3 py-2">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      <span className="text-xs font-semibold">{value}</span>
    </div>
  );
}

function addressLine(address: Record<string, unknown>): string {
  return typeof address.line1 === "string" ? address.line1 : "";
}

function formatCoordinateInput(value: number | null): string {
  return value === null ? "" : String(value);
}

function findTaxRateForDelivery({
  taxRates,
  city,
  county,
  state,
}: {
  taxRates: NewQuoteContext["taxRates"];
  city: string;
  county: string;
  state: string;
}) {
  const normalizedCity = city.trim().toLowerCase();
  const normalizedCounty = county.trim().toLowerCase();
  const normalizedState = state.trim().toLowerCase();

  if (!normalizedCity || !normalizedState) {
    return null;
  }

  return (
    taxRates.find(
      (taxRate) =>
        taxRate.city.toLowerCase() === normalizedCity &&
        taxRate.county.toLowerCase() === normalizedCounty &&
        taxRate.state.toLowerCase() === normalizedState,
    ) ??
    taxRates.find(
      (taxRate) =>
        taxRate.city.toLowerCase() === normalizedCity &&
        taxRate.state.toLowerCase() === normalizedState,
    ) ??
    null
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
  required = false,
  optional = false,
  error,
}: {
  label: string;
  children: React.ReactNode;
  required?: boolean;
  optional?: boolean;
  error?: string;
}) {
  return (
    <label className="block">
      <span className="flex items-center justify-between gap-3 text-sm font-medium text-muted-foreground">
        <span>{label}</span>
        {required ? (
          <span className="text-xs font-semibold text-rose-600">Required</span>
        ) : null}
        {optional ? (
          <span className="text-xs font-medium text-muted-foreground/70">
            Optional
          </span>
        ) : null}
      </span>
      <span className="mt-2 block">{children}</span>
      {error ? (
        <span className="mt-2 block text-xs text-rose-700">{error}</span>
      ) : null}
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

function tierRange(
  tier: NewQuoteContext["materials"][number]["tier"],
  pricingConfig: NonNullable<NewQuoteContext["pricingConfig"]>,
): [number, number] | null {
  const ranges = {
    R1: [pricingConfig.tier_r1_min, pricingConfig.tier_r1_max],
    R2: [pricingConfig.tier_r2_min, pricingConfig.tier_r2_max],
    R3: [pricingConfig.tier_r3_min, pricingConfig.tier_r3_max],
    R4: [pricingConfig.tier_r4_min, pricingConfig.tier_r4_max],
  } satisfies Record<NewQuoteContext["materials"][number]["tier"], [number, number]>;

  return ranges[tier];
}

function loadRuleText(calculation: QuoteDraftCalculation) {
  if (calculation.loadCount <= 1) {
    return "Single-load quotes prioritize the cleanest supplier fit and fast approval review.";
  }

  if (calculation.loadCount <= 3) {
    return "Multi-load quotes compare total delivered cost before approval routing.";
  }

  return "Large-load quotes emphasize material economics, trucking plan, and approval visibility.";
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

function isTruckRateKey(
  value: string,
): value is "floor" | "standard" | "target" | "premium" | "stretch" {
  return ["floor", "standard", "target", "premium", "stretch"].includes(value);
}

function formatLabel(value: string) {
  return value
    .split("_")
    .map((part) => part[0]?.toUpperCase() + part.slice(1))
    .join(" ");
}
