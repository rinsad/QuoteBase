"use client";

import { useActionState, useMemo, useState, useTransition } from "react";
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
  createQuoteJobSite,
  createQuoteDraft,
  type CreateQuoteState,
  type QuoteJobSiteInlineOption,
} from "@/app/(dashboard)/quotes/new/actions";
import { Button } from "@/components/ui/button";
import {
  calculateQuoteDraft,
  type CatalogMarkupRule,
  type QuoteDraftCalculation,
} from "@/lib/quotes/pricing";
import type { NewQuoteContext } from "@/lib/quotes/new-quote";

const initialState: CreateQuoteState = {
  message: "",
  status: "idle",
  fieldErrors: {},
};

const initialJobSiteState = {
  name: "",
  line1: "",
  city: "",
  county: "",
  state: "CA",
};

type QuoteLineDraft = {
  id: string;
  materialId: string;
  quantity: number;
  materialUnitPriceOverride: number | null;
  material: NewQuoteContext["materials"][number];
  calculation: QuoteDraftCalculation;
};

function formatMaterialOption(
  material: NewQuoteContext["materials"][number],
): string {
  return [
    material.catalog_sku ? `${material.catalog_sku} - ${material.name}` : material.name,
    `(${material.tier})`,
    supplierCompanyName(material),
    plantName(material),
  ]
    .filter(Boolean)
    .join(" - ");
}

function supplierCompanyName(
  material: NewQuoteContext["materials"][number],
): string {
  return material.supplier_parent_company ?? material.supplier_name;
}

function plantName(material: NewQuoteContext["materials"][number]): string {
  return material.supplier_name;
}

function normalizeMaterialLabel(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}

function materialOptionLabels(
  material: NewQuoteContext["materials"][number],
): string[] {
  return [
    formatMaterialOption(material),
    `${material.name} - (${material.tier}) - ${supplierCompanyName(material)} - ${plantName(material)}`,
    `${material.name} (${material.tier}) - ${supplierCompanyName(material)} - ${plantName(material)}`,
  ];
}

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
  const [jobSites, setJobSites] = useState(context.jobSites);
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
  const [activeStep, setActiveStep] = useState(0);
  const [quoteLines, setQuoteLines] = useState<QuoteLineDraft[]>([]);
  const [materialSearch, setMaterialSearch] = useState("");
  const [isMaterialPickerOpen, setIsMaterialPickerOpen] = useState(false);
  const [jobSiteMode, setJobSiteMode] = useState<"saved" | "new">("saved");
  const [newJobSite, setNewJobSite] = useState(initialJobSiteState);
  const [jobSiteFeedback, setJobSiteFeedback] = useState<{
    status: "success" | "error";
    message: string;
    fieldErrors: Record<string, string>;
  } | null>(null);
  const [isSavingJobSite, startSavingJobSite] = useTransition();
  const selectedJobSite = jobSites.find((site) => site.id === jobSiteId);
  const siteCity = selectedJobSite?.city ?? "";
  const siteCounty = selectedJobSite?.county ?? "";
  const siteState = selectedJobSite?.state ?? "";
  const normalizedMaterialSearch = normalizeMaterialLabel(materialSearch);
  const typedMaterialMatch = normalizedMaterialSearch
    ? context.materials.find(
        (material) =>
          materialOptionLabels(material).some(
            (label) => normalizeMaterialLabel(label) === normalizedMaterialSearch,
          ),
      )
    : undefined;
  const effectiveMaterialId = materialId || typedMaterialMatch?.id || "";
  const selectedMaterial = context.materials.find(
    (material) => material.id === effectiveMaterialId,
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
  const closestPlantOptions = useMemo(() => {
    if (!selectedMaterial || !selectedJobSite) {
      return [];
    }

    return context.materials
      .filter(
        (material) =>
          material.name === selectedMaterial.name &&
          material.unit === selectedMaterial.unit &&
          material.tier === selectedMaterial.tier,
      )
      .map((material) => ({
        material,
        routeMiles: estimatedRouteMiles(material, selectedJobSite),
      }))
      .sort((left, right) => {
        if (left.routeMiles === null && right.routeMiles === null) {
          return left.material.cost_per_unit - right.material.cost_per_unit;
        }

        if (left.routeMiles === null) {
          return 1;
        }

        if (right.routeMiles === null) {
          return -1;
        }

        return (
          left.routeMiles - right.routeMiles ||
          left.material.cost_per_unit - right.material.cost_per_unit
        );
      });
  }, [context.materials, selectedMaterial, selectedJobSite]);
  const filteredMaterials = useMemo(() => {
    const term = materialSearch.trim().toLowerCase();

    if (!term) {
      return context.materials;
    }

    return context.materials.filter((material) =>
      [
        material.catalog_sku,
        material.name,
        material.catalog_category,
        material.supplier_parent_company,
        material.supplier_name,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(term),
    );
  }, [context.materials, materialSearch]);
  const materialSuggestions = filteredMaterials.slice(0, 8);
  const filteredJobSites = customerId
    ? jobSites.filter((site) => site.customer_id === customerId)
    : jobSites;
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
          routeDurationSeconds: estimateRouteDurationSeconds({
            material,
            jobSite: selectedJobSite ?? null,
          }),
          materialUnitPriceOverride: activeMaterialUnitPriceOverride,
          truckRateOverride: activeTruckRateOverride,
          materialMinimumOverride: activeMaterialMinimumOverride,
          truckingMinimumOverride: activeTruckingMinimumOverride,
          paymentTerms,
          catalogMarkupRule: material.catalog_markup_rule,
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
      options: rankedOptions,
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
    selectedJobSite,
  ]);
  const liveCalculation = recommendation?.selected.calculation ?? null;
  const currentLineDraft =
    selectedMaterial &&
    liveCalculation &&
    Number.isFinite(quantityValue) &&
    quantityValue > 0
      ? {
          id: "current",
          materialId: selectedMaterial.id,
          quantity: quantityValue,
          materialUnitPriceOverride: activeMaterialUnitPriceOverride,
          material: selectedMaterial,
          calculation: liveCalculation,
        }
      : null;
  const submitLines = [...quoteLines, ...(currentLineDraft ? [currentLineDraft] : [])];
  const hasQuoteLineReady = submitLines.length > 0;
  const submitLineItemsJson = JSON.stringify(
    submitLines.map((line) => ({
      materialId: line.materialId,
      quantity: line.quantity,
      materialUnitPriceOverride: line.materialUnitPriceOverride,
    })),
  );
  const draftTotals = calculateLineTotals(submitLines);
  const totalMarginPct =
    draftTotals.materialSubtotal > 0
      ? ((draftTotals.materialSubtotal - draftTotals.materialCost) /
          draftTotals.materialSubtotal) *
        100
      : null;
  const hasMarginWarning = submitLines.some(
    (line) => line.calculation.marginFloorWarning,
  );
  const steps = [
    {
      key: "customer",
      kicker: "Step 1",
      title: "Choose the customer",
      summary: selectedCustomer
        ? (selectedCustomer.company_name ?? selectedCustomer.name)
        : "Not selected",
      complete: Boolean(customerId),
    },
    {
      key: "site",
      kicker: "Step 2",
      title: "Confirm the job site",
      summary: selectedJobSite
        ? `${selectedJobSite.name} - ${selectedJobSite.city}, ${selectedJobSite.state}`
        : "Not selected",
      complete: Boolean(jobSiteId),
    },
    {
      key: "material",
      kicker: "Step 3",
      title: "Pick material and quantity",
      summary:
        hasQuoteLineReady
          ? `${submitLines.length} line${submitLines.length === 1 ? "" : "s"}`
          : "Not selected",
      complete: hasQuoteLineReady,
    },
    {
      key: "pricing",
      kicker: "Step 4",
      title: "Tune pricing options",
      summary: hasQuoteLineReady
        ? formatCurrency(draftTotals.total)
        : "Waiting for inputs",
      complete: hasQuoteLineReady,
    },
    {
      key: "review",
      kicker: "Step 5",
      title: "Review and save",
      summary: hasQuoteLineReady
        ? `${formatCurrency(draftTotals.total)} draft`
        : "Complete prior steps",
      complete: hasQuoteLineReady,
    },
  ];
  const currentStep = steps[activeStep] ?? steps[0];
  const progressPct = ((activeStep + 1) / steps.length) * 100;
  const canAdvance = currentStep.complete || activeStep >= 3;
  const quoteLineBlocker = !selectedMaterial
    ? "Choose a material from the suggestions to continue."
    : !Number.isFinite(quantityValue) || quantityValue <= 0
      ? "Enter a quantity greater than zero to continue."
      : !selectedTaxRate
        ? "Choose a tax area or job site with a matching tax area to continue."
        : !context.pricingConfig
          ? "Pricing configuration is missing. Open Admin > Pricing to save the default pricing setup."
          : !recommendation
            ? "This material is selected, but QuoteBase could not calculate supplier pricing for its tier, unit, and cost."
            : null;
  const materialStepBlocker =
    activeStep === 2 && !hasQuoteLineReady ? quoteLineBlocker : null;

  function goToStep(nextStep: number) {
    setActiveStep(Math.min(Math.max(nextStep, 0), steps.length - 1));
  }

  function handleCustomerChange(nextCustomerId: string) {
    setCustomerId(nextCustomerId);
    const nextCustomer = context.customers.find(
      (customer) => customer.id === nextCustomerId,
    );
    setPaymentTerms(nextCustomer?.payment_terms ?? "COD");

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
    const site = jobSites.find((item) => item.id === nextSiteId);

    if (!site) {
      return;
    }

    if (!customerId) {
      setCustomerId(site.customer_id);
      const siteCustomer = context.customers.find(
        (customer) => customer.id === site.customer_id,
      );
      setPaymentTerms(siteCustomer?.payment_terms ?? "COD");
    }

    setTaxRateId("");
  }

  function handleNewJobSiteField(
    field: keyof typeof initialJobSiteState,
    value: string,
  ) {
    setNewJobSite((current) => ({
      ...current,
      [field]: field === "state" ? value.toUpperCase().slice(0, 2) : value,
    }));
    setJobSiteFeedback(null);
  }

  function saveNewJobSite() {
    if (!customerId) {
      setJobSiteFeedback({
        status: "error",
        message: "Select a customer before adding a job site.",
        fieldErrors: { customer_id: "Select a customer first." },
      });
      return;
    }

    const formData = new FormData();
    formData.set("customer_id", customerId);
    formData.set("name", newJobSite.name);
    formData.set("line1", newJobSite.line1);
    formData.set("city", newJobSite.city);
    formData.set("county", newJobSite.county);
    formData.set("state", newJobSite.state);

    startSavingJobSite(async () => {
      const result = await createQuoteJobSite(formData);

      if (result.status === "error") {
        setJobSiteFeedback(result);
        return;
      }

      setJobSites((sites) => upsertJobSiteOption(sites, result.jobSite));
      setJobSiteFeedback({
        status: "success",
        message: result.message,
        fieldErrors: {},
      });
      setNewJobSite(initialJobSiteState);
      setJobSiteMode("saved");
      setJobSiteId(result.jobSite.id);
      setTaxRateId("");
    });
  }

  function clearSelectedJobSite() {
    setJobSiteId("");
    setTaxRateId("");
  }

  function addCurrentLine() {
    if (!currentLineDraft) {
      return;
    }

    setQuoteLines((lines) => [
      ...lines,
      {
        ...currentLineDraft,
        id:
          typeof crypto !== "undefined" && "randomUUID" in crypto
            ? crypto.randomUUID()
            : `${Date.now()}-${lines.length}`,
      },
    ]);
    setMaterialId("");
    setMaterialSearch("");
    setQuantity("");
    setMaterialUnitPriceOverride("");
  }

  function removeLine(lineId: string) {
    if (lineId === "current") {
      setMaterialId("");
      setMaterialSearch("");
      setQuantity("");
      setMaterialUnitPriceOverride("");
      return;
    }

    setQuoteLines((lines) => lines.filter((line) => line.id !== lineId));
  }

  function handleMaterialSearchChange(value: string) {
    setMaterialSearch(value);
    setMaterialId("");
    setIsMaterialPickerOpen(true);
  }

  function selectMaterial(material: NewQuoteContext["materials"][number]) {
    setMaterialId(material.id);
    setMaterialSearch(formatMaterialOption(material));
    setIsMaterialPickerOpen(false);
  }

  function selectMaterialById(nextMaterialId: string) {
    const material = context.materials.find(
      (option) => option.id === nextMaterialId,
    );

    if (material) {
      selectMaterial(material);
      return;
    }

    setMaterialId(nextMaterialId);
  }

  return (
    <form
      action={formAction}
      className="grid gap-6 lg:grid-cols-[0.72fr_0.28fr]"
      noValidate
    >
      <input type="hidden" name="line_items" value={submitLineItemsJson} />
      <div className="lg:col-span-2">
        <div className="glass-panel overflow-hidden">
          <div className="h-1.5 bg-secondary">
            <div
              className="h-full bg-primary transition-all duration-300"
              style={{ width: `${progressPct}%` }}
            />
          </div>
          <div className="grid gap-6 p-5 sm:p-6 lg:grid-cols-[1fr_auto] lg:items-center">
            <div>
              <p className="text-sm font-medium text-muted-foreground">
                {currentStep.kicker} of {steps.length}
              </p>
              <h2 className="mt-1 text-2xl font-semibold">
                {currentStep.title}
              </h2>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
                Build the quote one decision at a time. The pricing engine keeps
                updating in the background as soon as enough inputs are ready.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {steps.map((step, index) => (
                <button
                  key={step.key}
                  type="button"
                  onClick={() => goToStep(index)}
                  className={`rounded-full px-3 py-2 text-xs font-semibold ring-1 transition ${
                    index === activeStep
                      ? "bg-primary text-primary-foreground ring-primary"
                      : step.complete
                        ? "bg-emerald-50 text-emerald-700 ring-emerald-100"
                        : "bg-card text-muted-foreground ring-border"
                  }`}
                >
                  {index + 1}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="min-w-0 space-y-6">
        <section className={stepPanelClass(activeStep === 0)}>
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
                  value={selectedCustomer.payment_terms ?? "COD"}
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

        <section className={stepPanelClass(activeStep === 1)}>
          <SectionHeader
            icon={MapPin}
            kicker="Job Site"
            title="Where is the material going?"
          />
          <div className="mt-5 grid gap-4">
            <div className="inline-grid w-full grid-cols-2 rounded-full bg-secondary/70 p-1 sm:w-fit">
              {(["saved", "new"] as const).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => setJobSiteMode(mode)}
                  className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
                    jobSiteMode === mode
                      ? "bg-primary text-primary-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {mode === "saved" ? "Saved site" : "New site"}
                </button>
              ))}
            </div>
            <input type="hidden" name="job_site_id" value={jobSiteId} />
            {jobSiteMode === "saved" ? (
              <Field
                label="Job site"
                required
                error={state.fieldErrors.job_site_id}
              >
                <select
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
            ) : (
              <div className="rounded-[18px] border border-white/70 bg-white/65 p-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field
                    label="Site name"
                    required
                    error={jobSiteFeedback?.fieldErrors.name}
                  >
                    <input
                      className="soft-control w-full"
                      value={newJobSite.name}
                      onChange={(event) =>
                        handleNewJobSiteField("name", event.target.value)
                      }
                      disabled={!customerId || isSavingJobSite}
                    />
                  </Field>
                  <Field
                    label="Address line"
                    error={jobSiteFeedback?.fieldErrors.line1}
                  >
                    <input
                      className="soft-control w-full"
                      value={newJobSite.line1}
                      onChange={(event) =>
                        handleNewJobSiteField("line1", event.target.value)
                      }
                      disabled={!customerId || isSavingJobSite}
                    />
                  </Field>
                  <Field
                    label="City"
                    required
                    error={jobSiteFeedback?.fieldErrors.city}
                  >
                    <input
                      className="soft-control w-full"
                      value={newJobSite.city}
                      onChange={(event) =>
                        handleNewJobSiteField("city", event.target.value)
                      }
                      disabled={!customerId || isSavingJobSite}
                    />
                  </Field>
                  <Field
                    label="County"
                    required
                    error={jobSiteFeedback?.fieldErrors.county}
                  >
                    <input
                      className="soft-control w-full"
                      value={newJobSite.county}
                      onChange={(event) =>
                        handleNewJobSiteField("county", event.target.value)
                      }
                      disabled={!customerId || isSavingJobSite}
                    />
                  </Field>
                  <Field
                    label="State"
                    required
                    error={jobSiteFeedback?.fieldErrors.state}
                  >
                    <input
                      className="soft-control w-full"
                      value={newJobSite.state}
                      onChange={(event) =>
                        handleNewJobSiteField("state", event.target.value)
                      }
                      disabled={!customerId || isSavingJobSite}
                      maxLength={2}
                    />
                  </Field>
                </div>
                <div className="mt-4 flex flex-wrap items-center gap-3">
                  <Button
                    type="button"
                    className="rounded-full"
                    disabled={!customerId || isSavingJobSite}
                    onClick={saveNewJobSite}
                  >
                    {isSavingJobSite ? "Saving..." : "Add job site"}
                  </Button>
                  {jobSiteFeedback ? (
                    <p
                      className={`text-sm font-medium ${
                        jobSiteFeedback.status === "success"
                          ? "text-primary"
                          : "text-rose-700"
                      }`}
                    >
                      {jobSiteFeedback.message}
                    </p>
                  ) : null}
                </div>
              </div>
            )}
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

        <section className={stepPanelClass(activeStep === 2)}>
          <SectionHeader
            icon={PackageOpen}
            kicker="Supplier Sourcing"
            title="Source the material"
          />
          <div className="mt-5 space-y-4">
            <Field label="Material" required error={state.fieldErrors.material_id}>
              <div
                className="relative"
                onBlur={(event) => {
                  const nextFocus = event.relatedTarget;

                  if (
                    !(nextFocus instanceof Node) ||
                    !event.currentTarget.contains(nextFocus)
                  ) {
                    setIsMaterialPickerOpen(false);
                  }
                }}
              >
                <input
                  type="hidden"
                  name="material_id"
                  value={effectiveMaterialId}
                />
                <input
                  type="search"
                  className="soft-control w-full"
                  placeholder="Search by SKU, material, category, or supplier"
                  value={materialSearch}
                  onFocus={() => setIsMaterialPickerOpen(true)}
                  onChange={(event) =>
                    handleMaterialSearchChange(event.target.value)
                  }
                  role="combobox"
                  aria-autocomplete="list"
                  aria-controls="material-suggestions"
                  aria-expanded={isMaterialPickerOpen}
                  aria-invalid={Boolean(state.fieldErrors.material_id)}
                />
                {isMaterialPickerOpen ? (
                  <div
                    id="material-suggestions"
                    role="listbox"
                    className="absolute left-0 right-0 z-20 mt-2 max-h-80 overflow-auto rounded-[18px] border border-border bg-card p-2 shadow-xl"
                  >
                    {materialSuggestions.length ? (
                      materialSuggestions.map((material) => (
                        <button
                          key={material.id}
                          type="button"
                          role="option"
                          aria-selected={material.id === materialId}
                          className="w-full rounded-[14px] px-3 py-3 text-left transition hover:bg-secondary focus:bg-secondary focus:outline-none"
                          onMouseDown={(event) => event.preventDefault()}
                          onClick={() => selectMaterial(material)}
                        >
                          <span className="block text-sm font-semibold text-foreground">
                            {formatMaterialOption(material)}
                          </span>
                          <span className="mt-1 block text-xs text-muted-foreground">
                            {[
                              material.catalog_category,
                              material.supplier_catalog_item_id
                                ? "Price book"
                                : "Manual material",
                            ]
                              .filter(Boolean)
                              .join(" - ")}
                          </span>
                        </button>
                      ))
                    ) : (
                      <div className="px-3 py-4 text-sm text-muted-foreground">
                        No matching materials found.
                      </div>
                    )}
                  </div>
                ) : null}
              </div>
            </Field>
            {selectedMaterial?.supplier_catalog_item_id ? (
              <div className="rounded-[18px] border border-emerald-100 bg-emerald-50/70 p-4 text-sm text-emerald-900">
                <p className="font-semibold">Price book item selected</p>
                <p className="mt-1 leading-6">
                  {[
                    selectedMaterial.catalog_sku
                      ? `SKU ${selectedMaterial.catalog_sku}`
                      : null,
                    selectedMaterial.catalog_category,
                    supplierCompanyName(selectedMaterial),
                    plantName(selectedMaterial),
                  ]
                    .filter(Boolean)
                    .join(" - ")}
                </p>
              </div>
            ) : null}
            {selectedMaterial && selectedJobSite ? (
              <ClosestPlantTable
                options={closestPlantOptions}
                selectedMaterialId={selectedMaterial.id}
                selectedJobSite={selectedJobSite}
                onSelectMaterial={selectMaterialById}
              />
            ) : selectedMaterial ? (
              <div className="soft-row p-4 text-sm leading-6 text-muted-foreground">
                Select or add a job site to calculate closest plants.
              </div>
            ) : null}
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
                required={!submitLines.length}
                aria-invalid={Boolean(state.fieldErrors.quantity)}
              />
            </Field>
            {recommendation && selectedMaterial ? (
              <SupplierSourcingTable
                recommendation={recommendation}
                selectedMaterialId={selectedMaterial.id}
                selectedJobSite={selectedJobSite ?? null}
                onSelectMaterial={selectMaterialById}
              />
            ) : (
              <div className="soft-row p-4 text-sm leading-6 text-muted-foreground">
                {quoteLineBlocker ??
                  "QuoteBase is preparing supplier catalog options for this line."}
              </div>
            )}
            <div className="flex flex-wrap items-center gap-3">
              <Button
                type="button"
                variant="outline"
                className="rounded-full"
                disabled={!currentLineDraft}
                onClick={addCurrentLine}
              >
                <FilePlus2 className="size-4" />
                Add line
              </Button>
              <span className="text-xs leading-5 text-muted-foreground">
                Save will include added lines plus the current valid line.
              </span>
            </div>
            {submitLines.length ? (
              <QuoteLinesTable lines={submitLines} onRemoveLine={removeLine} />
            ) : null}
            {state.fieldErrors.line_items ? (
              <p className="rounded-[16px] bg-rose-50 px-4 py-3 text-sm text-rose-700 ring-1 ring-rose-100">
                {state.fieldErrors.line_items}
              </p>
            ) : null}
            <details className="rounded-[18px] border border-border bg-card/70 p-4">
              <summary className="cursor-pointer text-sm font-semibold">
                Advanced pricing
              </summary>
              <div className="mt-4 space-y-4">
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
                {userRole === "admin" ? (
                  <Field label="Trucking rate override" optional>
                    <select
                      name="truck_rate_override"
                      className="soft-control w-full"
                      value={truckRateOverride}
                      onChange={(event) =>
                        setTruckRateOverride(event.target.value)
                      }
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
                      {plantName(recommendation.selected.material)}. The
                      audit log will record the override.
                    </span>
                  </label>
                ) : null}
              </div>
            </details>
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
          </div>
        </section>

        <section className={stepPanelClass(activeStep >= 3)}>
          <SectionHeader
            icon={BrainCircuit}
            kicker="Quote Intelligence"
            title="Distributor pricing logic"
          />
          {submitLines.length && selectedTaxRate ? (
            <div className="mt-5 space-y-4">
              <div className="rounded-[18px] border border-blue-100 bg-blue-50/70 p-4">
                <div className="flex items-center gap-3">
                  <div className="icon-well bg-white text-blue-700">
                    <TrendingUp className="size-5" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold">
                      Quote total
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {formatCurrency(draftTotals.total)} across{" "}
                      {submitLines.length} line
                      {submitLines.length === 1 ? "" : "s"}, including material,
                      trucking, fees, and tax rules.
                    </p>
                  </div>
                </div>
              </div>

              {recommendation && selectedMaterial && liveCalculation ? (
                <>
                  <RecommendationCard
                    recommendation={recommendation}
                    unit={selectedMaterial.unit}
                  />
                  <RuleCard
                    tier={selectedMaterial.tier}
                    markupPct={liveCalculation.markupPct}
                    markupPerUnit={liveCalculation.markupPerUnit}
                    markupSource={liveCalculation.markupSource}
                    markupRule={selectedMaterial.catalog_markup_rule}
                    pricingConfig={context.pricingConfig}
                  />
                </>
              ) : null}
              <SummaryRow
                label="Material cost"
                value={formatCurrency(draftTotals.materialCost)}
              />
              <SummaryRow
                label="Material revenue"
                value={formatCurrency(draftTotals.materialSubtotal)}
              />
              <SummaryRow
                label="Total material margin"
                value={
                  totalMarginPct === null ? "Pending" : `${totalMarginPct.toFixed(1)}%`
                }
              />
              {hasMarginWarning ? (
                <p className="rounded-[16px] bg-amber-50 px-4 py-3 text-sm font-medium text-amber-800 ring-1 ring-amber-100">
                  One or more lines are below their configured margin floor.
                </p>
              ) : null}
              <SummaryRow
                label="Total loads"
                value={`${draftTotals.loadCount.toFixed(0)} load${
                  draftTotals.loadCount === 1 ? "" : "s"
                }`}
              />
              <SummaryRow
                label="Trucking"
                value={formatCurrency(draftTotals.truckingSubtotal)}
              />
              <SummaryRow
                label="Fuel/environmental fees"
                value={formatCurrency(draftTotals.feesSubtotal)}
              />
              <SummaryRow
                label={`Tax (${(selectedTaxRate.rate * 100).toFixed(2)}%)`}
                value={formatCurrency(draftTotals.taxTotal)}
              />
              <SummaryRow
                label="Draft quote total"
                value={formatCurrency(draftTotals.total)}
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
                  text={loadRuleTextForLines(submitLines)}
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
        <div className="flex items-center justify-between gap-3">
          <Button
            type="button"
            variant="outline"
            className="rounded-full"
            disabled={activeStep === 0}
            onClick={() => goToStep(activeStep - 1)}
          >
            Back
          </Button>
          <div className="flex flex-col items-end gap-2">
            {materialStepBlocker ? (
              <p className="max-w-sm text-right text-xs font-medium text-muted-foreground">
                {materialStepBlocker}
              </p>
            ) : null}
            {activeStep < steps.length - 1 ? (
              <Button
                type="button"
                className="rounded-full"
                disabled={!canAdvance}
                onClick={() => goToStep(activeStep + 1)}
              >
                Continue
              </Button>
            ) : null}
          </div>
        </div>
      </div>

      <aside className="space-y-4 lg:sticky lg:top-6 lg:self-start">
        <section className="glass-panel p-5">
          <p className="text-sm font-semibold">Quote progress</p>
          <div className="mt-4 space-y-3">
            {steps.map((step, index) => (
              <button
                key={step.key}
                type="button"
                onClick={() => goToStep(index)}
                className={`w-full rounded-[16px] border px-4 py-3 text-left transition ${
                  index === activeStep
                    ? "border-primary bg-primary/10"
                    : "border-border bg-card/70 hover:bg-secondary/70"
                }`}
              >
                <span className="block text-xs font-medium uppercase text-muted-foreground">
                  {step.kicker}
                </span>
                <span className="mt-1 block text-sm font-semibold">
                  {step.title}
                </span>
                <span className="mt-1 block truncate text-xs text-muted-foreground">
                  {step.summary}
                </span>
              </button>
            ))}
          </div>
        </section>
        <section className="glass-panel p-5">
          <p className="text-sm font-semibold">Live total</p>
          <p className="mt-3 text-3xl font-semibold">
            {submitLines.length ? formatCurrency(draftTotals.total) : "--"}
          </p>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            {submitLines.length
              ? `${submitLines.length} quote line${submitLines.length === 1 ? "" : "s"} ready`
              : "Complete material and quantity to calculate the draft."}
          </p>
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

function stepPanelClass(isActive: boolean): string {
  return `glass-panel p-5 sm:p-6 ${isActive ? "block" : "hidden"}`;
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
  options: Array<{
    material: NewQuoteContext["materials"][number];
    calculation: QuoteDraftCalculation;
  }>;
  alternatives: Array<{
    material: NewQuoteContext["materials"][number];
    calculation: QuoteDraftCalculation;
  }>;
  isSelectedRecommended: boolean;
};

function ClosestPlantTable({
  options,
  selectedMaterialId,
  selectedJobSite,
  onSelectMaterial,
}: {
  options: Array<{
    material: NewQuoteContext["materials"][number];
    routeMiles: number | null;
  }>;
  selectedMaterialId: string;
  selectedJobSite: NewQuoteContext["jobSites"][number];
  onSelectMaterial: (materialId: string) => void;
}) {
  const hasKnownDistance = options.some((option) => option.routeMiles !== null);

  return (
    <div className="rounded-[18px] border border-white/70 bg-white/65 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold">Closest plants</p>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">
            Calculated from {selectedJobSite.name} using saved plant and job site
            coordinates.
          </p>
        </div>
        <span className="soft-chip bg-[#ecf2ed] text-[#3d6652] ring-[#d7ded5]">
          {options.length} plant{options.length === 1 ? "" : "s"}
        </span>
      </div>

      {options.length ? (
        <div className="mt-4 overflow-hidden rounded-[16px] ring-1 ring-border">
          <div className="grid grid-cols-[minmax(140px,1fr)_minmax(150px,1fr)_auto_auto_auto] gap-3 bg-muted/70 px-3 py-2 text-xs font-semibold text-muted-foreground">
            <span>Supplier</span>
            <span>Plant</span>
            <span className="text-right">Distance</span>
            <span className="text-right">Buy</span>
            <span className="text-right">Action</span>
          </div>
          {options.slice(0, 5).map((option, index) => {
            const isSelected = option.material.id === selectedMaterialId;

            return (
              <button
              key={option.material.id}
              type="button"
              onClick={() => onSelectMaterial(option.material.id)}
                className={`grid w-full grid-cols-[minmax(140px,1fr)_minmax(150px,1fr)_auto_auto_auto] items-center gap-3 border-t border-border px-3 py-3 text-left text-sm transition hover:bg-secondary/70 ${
                  isSelected ? "bg-secondary" : "bg-card/70"
                }`}
              >
                <span className="min-w-0">
                  <span className="block truncate font-semibold">
                    {supplierCompanyName(option.material)}
                  </span>
                  <span className="mt-1 block truncate text-xs text-muted-foreground">
                    {option.material.catalog_category ?? "Catalog material"}
                  </span>
                </span>
                <span className="min-w-0">
                  <span className="flex min-w-0 items-center gap-2">
                    <span className="truncate font-semibold">
                      {plantName(option.material)}
                    </span>
                    {index === 0 && option.routeMiles !== null ? (
                      <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[11px] font-semibold text-blue-700 ring-1 ring-blue-100">
                        Closest
                      </span>
                    ) : null}
                    {isSelected ? (
                      <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700 ring-1 ring-emerald-100">
                        Selected
                      </span>
                    ) : null}
                  </span>
                  <span className="mt-1 block truncate text-xs text-muted-foreground">
                    {option.material.catalog_sku
                      ? `SKU ${option.material.catalog_sku}`
                      : "Price book plant"}
                  </span>
                </span>
                <span className="font-mono text-xs">
                  {option.routeMiles === null
                    ? "--"
                    : `${option.routeMiles.toFixed(1)} mi`}
                </span>
                <span className="font-mono text-xs font-semibold">
                  {formatCurrency(option.material.cost_per_unit)}
                </span>
                <span
                  className={`justify-self-end rounded-full px-3 py-1 text-xs font-semibold ${
                    isSelected
                      ? "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100"
                      : "bg-primary text-primary-foreground"
                  }`}
                >
                  {isSelected ? "Selected" : "Choose"}
                </span>
              </button>
            );
          })}
        </div>
      ) : (
        <p className="mt-4 rounded-[16px] bg-card/70 px-4 py-3 text-sm text-muted-foreground ring-1 ring-border">
          No plants carry this exact material, tier, and unit yet.
        </p>
      )}

      {!hasKnownDistance && options.length ? (
        <p className="mt-3 text-xs leading-5 text-muted-foreground">
          Add coordinates to the job site and supplier plants to rank by miles.
        </p>
      ) : null}
    </div>
  );
}

function QuoteLinesTable({
  lines,
  onRemoveLine,
}: {
  lines: QuoteLineDraft[];
  onRemoveLine: (lineId: string) => void;
}) {
  return (
    <div className="overflow-hidden rounded-[18px] border border-border bg-card/80">
      <div className="grid grid-cols-[1fr_auto_auto_auto] gap-3 bg-muted/70 px-4 py-3 text-xs font-semibold text-muted-foreground">
        <span>Quote lines</span>
        <span className="text-right">Qty</span>
        <span className="text-right">Margin</span>
        <span className="text-right">Total</span>
      </div>
      <div className="divide-y divide-border">
        {lines.map((line) => (
          <div
            key={line.id}
            className="grid grid-cols-[1fr_auto_auto_auto] items-center gap-3 px-4 py-3 text-sm"
          >
            <div className="min-w-0">
              <div className="flex min-w-0 items-center gap-2">
                <p className="truncate font-semibold">{line.material.name}</p>
                {line.id === "current" ? (
                  <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[11px] font-semibold text-blue-700 ring-1 ring-blue-100">
                    Current
                  </span>
                ) : null}
                {line.calculation.marginFloorWarning ? (
                  <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-800 ring-1 ring-amber-100">
                    Low margin
                  </span>
                ) : null}
              </div>
              <p className="mt-1 truncate text-xs text-muted-foreground">
                {line.material.catalog_sku ? `${line.material.catalog_sku} - ` : ""}
                {supplierCompanyName(line.material)} / {plantName(line.material)} -
                sell{" "}
                {formatCurrency(line.calculation.materialUnitPrice)} /{" "}
                {line.material.unit}
              </p>
            </div>
            <span className="font-mono text-xs">
              {line.quantity} {line.material.unit}
            </span>
            <span className="font-mono text-xs">
              {line.calculation.grossMarginPct === null
                ? "--"
                : `${line.calculation.grossMarginPct.toFixed(1)}%`}
            </span>
            <div className="flex items-center justify-end gap-2">
              <span className="font-mono text-xs font-semibold">
                {formatCurrency(line.calculation.total)}
              </span>
              <button
                type="button"
                onClick={() => onRemoveLine(line.id)}
                className="rounded-full px-2 py-1 text-xs font-semibold text-rose-700 transition hover:bg-rose-50"
              >
                Remove
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function SupplierSourcingTable({
  recommendation,
  selectedMaterialId,
  selectedJobSite,
  onSelectMaterial,
}: {
  recommendation: Recommendation;
  selectedMaterialId: string;
  selectedJobSite: NewQuoteContext["jobSites"][number] | null;
  onSelectMaterial: (materialId: string) => void;
}) {
  return (
    <div className="rounded-[18px] border border-white/70 bg-white/65 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold">Supplier options</p>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">
            Ranked by the same catalog cost, markup, load plan, trucking, fee,
            and tax rules used when the draft is saved.
          </p>
        </div>
        <span className="soft-chip bg-[#ecf2ed] text-[#3d6652] ring-[#d7ded5]">
          {recommendation.options.length} option
          {recommendation.options.length === 1 ? "" : "s"}
        </span>
      </div>

      <div className="mt-4 overflow-hidden rounded-[16px] ring-1 ring-border">
        <div className="grid grid-cols-[minmax(130px,1fr)_minmax(150px,1fr)_auto_auto_auto_auto] gap-3 bg-muted/70 px-3 py-2 text-xs font-semibold text-muted-foreground">
          <span>Supplier</span>
          <span>Plant</span>
          <span className="text-right">Distance</span>
          <span className="text-right">Buy</span>
          <span className="text-right">Total</span>
          <span className="text-right">Action</span>
        </div>
        {recommendation.options.slice(0, 5).map((option, index) => {
          const isSelected = option.material.id === selectedMaterialId;
          const isRecommended =
            option.material.id === recommendation.recommended.material.id;
          const routeMiles = estimatedRouteMiles(
            option.material,
            selectedJobSite,
          );

          return (
            <button
              key={option.material.id}
              type="button"
              onClick={() => onSelectMaterial(option.material.id)}
              className={`grid w-full grid-cols-[minmax(130px,1fr)_minmax(150px,1fr)_auto_auto_auto_auto] items-center gap-3 border-t border-border px-3 py-3 text-left text-sm transition hover:bg-secondary/70 ${
                isSelected ? "bg-secondary" : "bg-card/70"
              }`}
            >
              <span className="min-w-0">
                <span className="block truncate font-semibold">
                  {supplierCompanyName(option.material)}
                </span>
                <span className="mt-1 block truncate text-xs text-muted-foreground">
                  {option.material.catalog_category ?? "Catalog material"}
                </span>
              </span>
              <span className="min-w-0">
                <span className="flex min-w-0 items-center gap-2">
                  <span className="truncate font-semibold">
                    {plantName(option.material)}
                  </span>
                  {isRecommended ? (
                    <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700 ring-1 ring-emerald-100">
                      Recommended
                    </span>
                  ) : null}
                  {isSelected && !isRecommended ? (
                    <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-700 ring-1 ring-amber-100">
                      Selected
                    </span>
                  ) : null}
                </span>
                <span className="mt-1 block text-xs text-muted-foreground">
                  {option.calculation.loadCount.toFixed(0)} load
                  {option.calculation.loadCount === 1 ? "" : "s"}
                  {option.calculation.vehicleName
                    ? ` via ${option.calculation.vehicleName}`
                    : ""}
                  {index > 0 ? `- option ${index + 1}` : ""}
                </span>
              </span>
              <span className="font-mono text-xs">
                {routeMiles === null ? "--" : `${routeMiles.toFixed(1)} mi`}
              </span>
              <span className="font-mono text-xs">
                {formatCurrency(option.material.cost_per_unit)}
              </span>
              <span className="font-mono text-xs font-semibold">
                {formatCurrency(option.calculation.total)}
              </span>
              <span
                className={`justify-self-end rounded-full px-3 py-1 text-xs font-semibold ${
                  isSelected
                    ? "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100"
                    : "bg-primary text-primary-foreground"
                }`}
              >
                {isSelected ? "Selected" : "Choose"}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function estimateRouteDurationSeconds({
  material,
  jobSite,
}: {
  material: NewQuoteContext["materials"][number];
  jobSite: NewQuoteContext["jobSites"][number] | null;
}): number | null {
  const miles = estimatedRouteMiles(material, jobSite);

  if (miles === null) {
    return null;
  }

  return Math.round((miles / 35) * 3600);
}

function estimatedRouteMiles(
  material: NewQuoteContext["materials"][number],
  jobSite?: NewQuoteContext["jobSites"][number] | null,
): number | null {
  if (
    !jobSite ||
    material.supplier_latitude === null ||
    material.supplier_longitude === null ||
    jobSite.latitude === null ||
    jobSite.longitude === null
  ) {
    return null;
  }

  const straightLineMiles = haversineMiles(
    material.supplier_latitude,
    material.supplier_longitude,
    jobSite.latitude,
    jobSite.longitude,
  );

  return straightLineMiles * 1.25;
}

function haversineMiles(
  fromLatitude: number,
  fromLongitude: number,
  toLatitude: number,
  toLongitude: number,
): number {
  const earthRadiusMiles = 3958.8;
  const latitudeDelta = toRadians(toLatitude - fromLatitude);
  const longitudeDelta = toRadians(toLongitude - fromLongitude);
  const fromLatitudeRadians = toRadians(fromLatitude);
  const toLatitudeRadians = toRadians(toLatitude);
  const haversine =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(fromLatitudeRadians) *
      Math.cos(toLatitudeRadians) *
      Math.sin(longitudeDelta / 2) ** 2;

  return (
    2 *
    earthRadiusMiles *
    Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine))
  );
}

function toRadians(value: number): number {
  return (value * Math.PI) / 180;
}

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
    <div className="rounded-[18px] border border-border bg-secondary p-4 text-secondary-foreground">
      <div className="flex items-start gap-3">
        <div className="icon-well bg-background text-primary">
          <Award className="size-5" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">Recommended supplier</p>
          <p className="mt-1 text-sm leading-6 text-muted-foreground">
            {supplierCompanyName(recommendation.recommended.material)} /{" "}
            {plantName(recommendation.recommended.material)} is the current best
            catalog match for this material, tier, unit, and quantity.
          </p>
          <div className="mt-3 grid gap-2">
            <MiniMetric
              label="Selected supplier"
              value={supplierCompanyName(recommendation.selected.material)}
            />
            <MiniMetric
              label="Selected plant"
              value={plantName(recommendation.selected.material)}
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
              Next option:{" "}
              {supplierCompanyName(recommendation.alternatives[0].material)} /{" "}
              {plantName(recommendation.alternatives[0].material)} at{" "}
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
  markupSource,
  markupRule,
  pricingConfig,
}: {
  tier: NewQuoteContext["materials"][number]["tier"];
  markupPct: number;
  markupPerUnit: number;
  markupSource: QuoteDraftCalculation["markupSource"];
  markupRule: CatalogMarkupRule | null;
  pricingConfig: NewQuoteContext["pricingConfig"];
}) {
  const range = pricingConfig ? tierRange(tier, pricingConfig) : null;
  const ruleLabel =
    markupSource === "catalog" && markupRule
      ? formatCatalogRuleLabel(markupRule)
      : null;

  return (
    <div className="soft-row p-4">
      <p className="text-sm font-semibold">Pricing rules applied</p>
      <div className="mt-3 grid gap-2">
        <MiniMetric
          label={markupSource === "catalog" ? "Price book markup" : `${tier} dollar markup`}
          value={
            ruleLabel
              ? `${formatCurrency(markupPerUnit)} / unit from ${ruleLabel}`
              : range
              ? `${formatCurrency(markupPerUnit)} / unit from ${formatCurrency(
                  range[0],
                )}-${formatCurrency(
                  range[1],
                )} / unit range`
              : `${formatCurrency(markupPct)} / unit`
          }
        />
        {markupRule?.margin_floor_pct !== null &&
        markupRule?.margin_floor_pct !== undefined ? (
          <MiniMetric
            label="Margin floor"
            value={`${Number(markupRule.margin_floor_pct).toFixed(1)}%`}
          />
        ) : null}
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

function upsertJobSiteOption(
  sites: NewQuoteContext["jobSites"],
  nextSite: QuoteJobSiteInlineOption,
): NewQuoteContext["jobSites"] {
  const existingIndex = sites.findIndex((site) => site.id === nextSite.id);

  if (existingIndex === -1) {
    return [...sites, nextSite];
  }

  return sites.map((site, index) => (index === existingIndex ? nextSite : site));
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

function formatCatalogRuleLabel(rule: CatalogMarkupRule): string {
  const value =
    rule.markup_type === "percent"
      ? `${rule.markup_value}% markup`
      : `${formatCurrency(rule.markup_value)} / unit`;
  const scope =
    rule.scope === "item"
      ? "item rule"
      : rule.scope === "category"
        ? "category rule"
        : "global rule";

  return `${value} ${scope}`;
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

function loadRuleTextForLines(lines: QuoteLineDraft[]) {
  const loadCount = lines.reduce(
    (sum, line) => sum + line.calculation.loadCount,
    0,
  );

  return loadRuleText({
    loadCount,
  } as QuoteDraftCalculation);
}

function calculateLineTotals(lines: QuoteLineDraft[]) {
  return lines.reduce(
    (sum, line) => ({
      materialCost:
        sum.materialCost + line.material.cost_per_unit * line.quantity,
      materialSubtotal:
        sum.materialSubtotal + line.calculation.materialSubtotal,
      truckingSubtotal:
        sum.truckingSubtotal + line.calculation.truckingSubtotal,
      feesSubtotal: sum.feesSubtotal + line.calculation.feesSubtotal,
      taxTotal: sum.taxTotal + line.calculation.taxTotal,
      total: sum.total + line.calculation.total,
      loadCount: sum.loadCount + line.calculation.loadCount,
    }),
    {
      materialCost: 0,
      materialSubtotal: 0,
      truckingSubtotal: 0,
      feesSubtotal: 0,
      taxTotal: 0,
      total: 0,
      loadCount: 0,
    },
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

function isTruckRateKey(
  value: string,
): value is "floor" | "standard" | "target" | "premium" | "stretch" {
  return ["floor", "standard", "target", "premium", "stretch"].includes(value);
}
