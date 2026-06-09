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
};
const DEFAULT_MAP_CENTER = { latitude: 34.0522, longitude: -118.2437 };
const MAP_TILE_SIZE = 256;

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
  const [siteName, setSiteName] = useState("");
  const [siteAddress, setSiteAddress] = useState("");
  const [siteCity, setSiteCity] = useState("");
  const [siteCounty, setSiteCounty] = useState("");
  const [siteState, setSiteState] = useState("CA");
  const [siteLatitude, setSiteLatitude] = useState("");
  const [siteLongitude, setSiteLongitude] = useState("");
  const [paymentTerms, setPaymentTerms] = useState("");
  const [mapZoom, setMapZoom] = useState(11);
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
  const selectedJobSite = context.jobSites.find((site) => site.id === jobSiteId);
  const siteNameSuggestions = useMemo(
    () => uniqueStrings(context.jobSites.map((site) => site.name)),
    [context.jobSites],
  );
  const citySuggestions = useMemo(
    () =>
      uniqueStrings([
        ...context.jobSites.map((site) => site.city),
        ...context.taxRates.map((taxRate) => taxRate.city),
      ]),
    [context.jobSites, context.taxRates],
  );
  const countySuggestions = useMemo(
    () =>
      uniqueStrings([
        ...context.jobSites.map((site) => site.county),
        ...context.taxRates.map((taxRate) => taxRate.county),
      ]),
    [context.jobSites, context.taxRates],
  );
  const stateSuggestions = useMemo(
    () =>
      uniqueStrings([
        ...context.jobSites.map((site) => site.state),
        ...context.taxRates.map((taxRate) => taxRate.state),
        "CA",
        "NV",
        "AZ",
        "OR",
      ]),
    [context.jobSites, context.taxRates],
  );
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
  const mapCenter = coordinateFromInputs(siteLatitude, siteLongitude);

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
    }

    setSiteName(site.name);
    setSiteAddress(addressLine(site.address));
    setSiteCity(site.city);
    setSiteCounty(site.county);
    setSiteState(site.state);
    setSiteLatitude(formatCoordinateInput(site.latitude));
    setSiteLongitude(formatCoordinateInput(site.longitude));
    setTaxRateId("");
  }

  function clearSelectedJobSite() {
    setJobSiteId("");
    setSiteName("");
    setSiteAddress("");
    setSiteCity("");
    setSiteCounty("");
    setSiteState("CA");
    setSiteLatitude("");
    setSiteLongitude("");
    setTaxRateId("");
  }

  function handleCoordinatePick(latitude: number, longitude: number) {
    setSiteLatitude(latitude.toFixed(7));
    setSiteLongitude(longitude.toFixed(7));
  }

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
              <select
                name="customer_id"
                className="soft-control w-full"
                value={customerId}
                onChange={(event) => handleCustomerChange(event.target.value)}
              >
                <option value="">Create or select...</option>
                {context.customers.map((customer) => (
                  <option key={customer.id} value={customer.id}>
                    {customer.company_name ?? customer.name}
                    {customer.contact_name ? ` - ${customer.contact_name}` : ""}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Company">
              <input
                name="company_name"
                className="soft-control w-full"
                placeholder="Company name"
                defaultValue={selectedCustomer?.company_name ?? ""}
              />
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
                defaultValue={selectedCustomer?.phone ?? ""}
              />
            </Field>
            <Field label="Customer address">
              <input
                name="customer_address"
                className="soft-control w-full"
                placeholder="Billing or default delivery address"
                defaultValue={addressLine(selectedCustomer?.address ?? {})}
              />
            </Field>
            <Field label="Payment terms">
              <input
                name="payment_terms"
                value={paymentTerms}
                onChange={(event) => setPaymentTerms(event.target.value)}
                className="soft-control w-full"
                placeholder="Net 30, COD, account terms"
              />
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
          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <Field label="Existing job site">
              <select
                name="job_site_id"
                className="soft-control w-full"
                value={jobSiteId}
                onChange={(event) => handleJobSiteChange(event.target.value)}
              >
                <option value="">Create or select...</option>
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
            <Field label="New site name">
              <input
                name="site_name"
                className="soft-control w-full"
                placeholder="Project or site name"
                value={siteName}
                onChange={(event) => setSiteName(event.target.value)}
                list="job-site-name-options"
              />
            </Field>
            <Field label="Address">
              <input
                name="site_address"
                className="soft-control w-full"
                placeholder="Start typing a street address"
                value={siteAddress}
                onChange={(event) => setSiteAddress(event.target.value)}
              />
            </Field>
            <Field label="City">
              <input
                name="site_city"
                className="soft-control w-full"
                placeholder="Los Angeles"
                value={siteCity}
                onChange={(event) => setSiteCity(event.target.value)}
                list="job-site-city-options"
              />
            </Field>
            <Field label="County">
              <input
                name="site_county"
                className="soft-control w-full"
                placeholder="Los Angeles"
                value={siteCounty}
                onChange={(event) => setSiteCounty(event.target.value)}
                list="job-site-county-options"
              />
            </Field>
            <Field label="State">
              <input
                name="site_state"
                className="soft-control w-full"
                value={siteState}
                onChange={(event) =>
                  setSiteState(event.target.value.toUpperCase().slice(0, 2))
                }
                list="job-site-state-options"
                maxLength={2}
              />
            </Field>
            <Field label="Latitude">
              <input
                name="site_latitude"
                type="number"
                step="0.0000001"
                className="soft-control w-full"
                placeholder="Auto-fill or paste from map"
                value={siteLatitude}
                onChange={(event) => setSiteLatitude(event.target.value)}
              />
            </Field>
            <Field label="Longitude">
              <input
                name="site_longitude"
                type="number"
                step="0.0000001"
                className="soft-control w-full"
                placeholder="Auto-fill or paste from map"
                value={siteLongitude}
                onChange={(event) => setSiteLongitude(event.target.value)}
              />
            </Field>
            <div className="sm:col-span-2">
              <CoordinateMapPicker
                center={mapCenter ?? DEFAULT_MAP_CENTER}
                hasSelectedCoordinates={mapCenter !== null}
                zoom={mapZoom}
                onZoomChange={setMapZoom}
                onPick={handleCoordinatePick}
                note={
                  selectedJobSite
                    ? "Saved coordinates were applied. Click the map if this quote should use a different drop point."
                    : "Click the map to set latitude and longitude for trucking distance and routing logic."
                }
              />
            </div>
          </div>
          <datalist id="job-site-name-options">
            {siteNameSuggestions.map((name) => (
              <option key={name} value={name} />
            ))}
          </datalist>
          <datalist id="job-site-city-options">
            {citySuggestions.map((city) => (
              <option key={city} value={city} />
            ))}
          </datalist>
          <datalist id="job-site-county-options">
            {countySuggestions.map((county) => (
              <option key={county} value={county} />
            ))}
          </datalist>
          <datalist id="job-site-state-options">
            {stateSuggestions.map((state) => (
              <option key={state} value={state} />
            ))}
          </datalist>
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
            <Field label="Manual sell price override">
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
              />
              <span className="mt-2 block text-xs leading-5 text-muted-foreground">
                Leave blank to use the tier recommendation. Manual overrides
                are captured in the audit log.
              </span>
            </Field>
            {context.competitiveIntelligenceEnabled ? (
              <Field label="Competitor price">
                <input
                  name="competitor_price"
                  type="number"
                  min="0.01"
                  step="0.01"
                  className="soft-control w-full"
                  placeholder="Competitor quoted price"
                />
              </Field>
            ) : null}
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Material minimum override">
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
                />
              </Field>
              <Field label="Trucking minimum override">
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
                />
              </Field>
            </div>
            <span className="block text-xs leading-5 text-muted-foreground">
              Minimum overrides require the normal admin approval step and are
              captured in the audit log.
            </span>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Manual route miles">
                <input
                  name="manual_route_distance_miles"
                  type="number"
                  min="0"
                  step="0.01"
                  className="soft-control w-full"
                  placeholder="Plant to delivery"
                />
              </Field>
              <Field label="Manual deadhead miles">
                <input
                  name="manual_deadhead_distance_miles"
                  type="number"
                  min="0"
                  step="0.01"
                  className="soft-control w-full"
                  placeholder="Yard to plant"
                />
              </Field>
            </div>
            <Field label="Tax area">
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
            <Field label="Notes">
              <textarea
                name="notes"
                className="soft-control min-h-28 w-full resize-none py-3"
                placeholder="Internal notes for this draft"
              />
            </Field>
            {userRole === "admin" ? (
              <Field label="Trucking rate override">
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

function CoordinateMapPicker({
  center,
  hasSelectedCoordinates,
  zoom,
  onZoomChange,
  onPick,
  note,
}: {
  center: Coordinate;
  hasSelectedCoordinates: boolean;
  zoom: number;
  onZoomChange: (zoom: number) => void;
  onPick: (latitude: number, longitude: number) => void;
  note: string;
}) {
  const worldCenter = latLngToWorld(center, zoom);
  const centerTileX = Math.floor(worldCenter.x / MAP_TILE_SIZE);
  const centerTileY = Math.floor(worldCenter.y / MAP_TILE_SIZE);
  const tiles = [-2, -1, 0, 1, 2].flatMap((xOffset) =>
    [-2, -1, 0, 1, 2].map((yOffset) => {
      const tileX = centerTileX + xOffset;
      const tileY = centerTileY + yOffset;

      return {
        key: `${zoom}-${tileX}-${tileY}`,
        x: tileX,
        y: tileY,
        left: tileX * MAP_TILE_SIZE - worldCenter.x,
        top: tileY * MAP_TILE_SIZE - worldCenter.y,
      };
    }),
  );

  function handleMapClick(event: React.MouseEvent<HTMLDivElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    const picked = worldToLatLng(
      worldCenter.x + event.clientX - (rect.left + rect.width / 2),
      worldCenter.y + event.clientY - (rect.top + rect.height / 2),
      zoom,
    );

    onPick(picked.latitude, picked.longitude);
  }

  return (
    <div className="soft-row overflow-hidden p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="font-semibold">Coordinate picker</p>
          <p className="mt-1 text-sm text-muted-foreground">{note}</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="grid size-9 place-items-center rounded-full bg-white text-sm font-semibold ring-1 ring-border"
            onClick={() => onZoomChange(Math.max(6, zoom - 1))}
            aria-label="Zoom out"
          >
            -
          </button>
          <span className="text-xs font-semibold text-muted-foreground">
            {zoom}x
          </span>
          <button
            type="button"
            className="grid size-9 place-items-center rounded-full bg-white text-sm font-semibold ring-1 ring-border"
            onClick={() => onZoomChange(Math.min(18, zoom + 1))}
            aria-label="Zoom in"
          >
            +
          </button>
        </div>
      </div>
      <div
        className="relative mt-4 h-[280px] cursor-crosshair overflow-hidden rounded-[18px] bg-slate-100 ring-1 ring-border"
        onClick={handleMapClick}
      >
        {tiles.map((tile) => (
          <div
            key={tile.key}
            className="absolute size-64 bg-cover bg-center"
            style={{
              left: `calc(50% + ${tile.left}px)`,
              top: `calc(50% + ${tile.top}px)`,
              backgroundImage: `url("${mapTileUrl(tile.x, tile.y, zoom)}")`,
            }}
          />
        ))}
        <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(rgba(24,33,47,0.08)_1px,transparent_1px),linear-gradient(90deg,rgba(24,33,47,0.08)_1px,transparent_1px)] bg-[size:32px_32px]" />
        <div
          className={`pointer-events-none absolute left-1/2 top-1/2 grid size-10 -translate-x-1/2 -translate-y-full place-items-center rounded-full bg-blue-700 text-white shadow-xl ring-4 ring-white ${
            hasSelectedCoordinates ? "" : "opacity-70"
          }`}
        >
          <MapPin className="size-5" />
        </div>
        <div className="pointer-events-none absolute bottom-3 left-3 rounded-full bg-white/90 px-3 py-1 text-xs font-medium text-muted-foreground shadow-sm">
          {center.latitude.toFixed(5)}, {center.longitude.toFixed(5)}
        </div>
        <div className="pointer-events-none absolute bottom-3 right-3 rounded-full bg-white/90 px-3 py-1 text-[11px] font-medium text-muted-foreground shadow-sm">
          OpenStreetMap
        </div>
      </div>
    </div>
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

function uniqueStrings(values: string[]): string[] {
  return Array.from(
    new Set(
      values
        .map((value) => value.trim())
        .filter((value) => value.length > 0),
    ),
  ).sort((left, right) => left.localeCompare(right));
}

function addressLine(address: Record<string, unknown>): string {
  return typeof address.line1 === "string" ? address.line1 : "";
}

function formatCoordinateInput(value: number | null): string {
  return value === null ? "" : String(value);
}

type Coordinate = {
  latitude: number;
  longitude: number;
};

function coordinateFromInputs(
  latitudeInput: string,
  longitudeInput: string,
): Coordinate | null {
  const latitude = Number(latitudeInput);
  const longitude = Number(longitudeInput);

  if (
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude) ||
    latitude < -90 ||
    latitude > 90 ||
    longitude < -180 ||
    longitude > 180
  ) {
    return null;
  }

  return { latitude, longitude };
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

function latLngToWorld(coordinate: Coordinate, zoom: number) {
  const scale = MAP_TILE_SIZE * 2 ** zoom;
  const sinLatitude = Math.sin((coordinate.latitude * Math.PI) / 180);

  return {
    x: ((coordinate.longitude + 180) / 360) * scale,
    y:
      (0.5 -
        Math.log((1 + sinLatitude) / (1 - sinLatitude)) / (4 * Math.PI)) *
      scale,
  };
}

function worldToLatLng(x: number, y: number, zoom: number): Coordinate {
  const scale = MAP_TILE_SIZE * 2 ** zoom;
  const longitude = (x / scale) * 360 - 180;
  const latitudeRadians = Math.atan(
    Math.sinh(Math.PI - (2 * Math.PI * y) / scale),
  );

  return {
    latitude: (latitudeRadians * 180) / Math.PI,
    longitude: normalizeLongitude(longitude),
  };
}

function mapTileUrl(tileX: number, tileY: number, zoom: number): string {
  const tileCount = 2 ** zoom;
  const wrappedX = ((tileX % tileCount) + tileCount) % tileCount;
  const clampedY = Math.max(0, Math.min(tileCount - 1, tileY));

  return `https://tile.openstreetmap.org/${zoom}/${wrappedX}/${clampedY}.png`;
}

function normalizeLongitude(longitude: number): number {
  return ((((longitude + 180) % 360) + 360) % 360) - 180;
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
