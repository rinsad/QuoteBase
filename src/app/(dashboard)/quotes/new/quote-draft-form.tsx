"use client";

import { useActionState, useMemo, useState, useTransition, type FormEvent } from "react";
import {
  Award,
  BrainCircuit,
  Check,
  ChevronDown,
  FilePlus2,
  MapPin,
  PackageOpen,
  Plus,
  Search,
  TrendingUp,
  UserRound,
  X,
} from "lucide-react";

import {
  createQuoteJobSite,
  createQuoteDraft,
  type CreateQuoteState,
  type QuoteJobSiteInlineOption,
} from "@/app/(dashboard)/quotes/new/actions";
import {
  MapboxAddressSearch,
  type MapboxAddressSelection,
} from "@/components/mapbox-address-search";
import { Button } from "@/components/ui/button";
import { DatePicker } from "@/components/ui/date-picker";
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
  postalCode: "",
  latitude: "",
  longitude: "",
  mapboxId: "",
};

type QuoteLineDraft = {
  id: string;
  materialId: string;
  quantity: number;
  materialUnitPriceOverride: number | null;
  material: NewQuoteContext["materials"][number];
  calculation: QuoteDraftCalculation;
};

type MaterialOption = NewQuoteContext["materials"][number];

type MaterialChoice = {
  key: string;
  material: MaterialOption;
  plantCount: number;
  supplierCount: number;
  categories: string[];
};

function formatMaterialOption(
  material: MaterialOption,
): string {
  return [
    material.catalog_sku ? `${material.catalog_sku} - ${material.name}` : material.name,
    `(${material.tier})`,
    material.unit,
  ]
    .filter(Boolean)
    .join(" - ");
}

function supplierCompanyName(
  material: MaterialOption,
): string {
  return material.supplier_parent_company ?? material.supplier_name;
}

function plantName(material: MaterialOption): string {
  return material.supplier_name;
}

function normalizeMaterialLabel(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}

function materialOptionLabels(
  material: MaterialOption,
): string[] {
  return [
    formatMaterialOption(material),
    `${material.name} - (${material.tier}) - ${material.unit}`,
    `${material.name} (${material.tier}) ${material.unit}`,
  ];
}

function buildMaterialChoices(materials: MaterialOption[]): MaterialChoice[] {
  const choices = new Map<
    string,
    {
      material: MaterialOption;
      plants: Set<string>;
      suppliers: Set<string>;
      categories: Set<string>;
    }
  >();

  for (const material of materials) {
    const key = materialChoiceKey(material);
    const current =
      choices.get(key) ??
      {
        material,
        plants: new Set<string>(),
        suppliers: new Set<string>(),
        categories: new Set<string>(),
      };

    current.plants.add(plantName(material));
    current.suppliers.add(supplierCompanyName(material));

    if (material.catalog_category) {
      current.categories.add(material.catalog_category);
    }

    if (material.cost_per_unit < current.material.cost_per_unit) {
      current.material = material;
    }

    choices.set(key, current);
  }

  return Array.from(choices.entries())
    .map(([key, choice]) => ({
      key,
      material: choice.material,
      plantCount: choice.plants.size,
      supplierCount: choice.suppliers.size,
      categories: Array.from(choice.categories).sort((a, b) =>
        a.localeCompare(b, "en-US", { sensitivity: "base" }),
      ),
    }))
    .sort((left, right) =>
      formatMaterialOption(left.material).localeCompare(
        formatMaterialOption(right.material),
        "en-US",
        { numeric: true, sensitivity: "base" },
      ),
    );
}

function materialChoiceKey(material: MaterialOption): string {
  return [
    normalizeMaterialLabel(material.name),
    normalizeMaterialLabel(material.unit),
    material.tier,
  ].join("|");
}

export function QuoteDraftForm({
  context,
}: {
  context: NewQuoteContext;
}) {
  const [state, formAction, isPending] = useActionState(
    createQuoteDraft,
    initialState,
  );
  const defaultQuoteDate = localDateInputValue(new Date());
  const defaultExpiresAt = localDateInputValue(addDays(new Date(), 30));
  const [quoteDate, setQuoteDate] = useState(defaultQuoteDate);
  const [expiresAt, setExpiresAt] = useState(defaultExpiresAt);
  const [customerId, setCustomerId] = useState("");
  const [customerSearch, setCustomerSearch] = useState("");
  const [isCustomerPickerOpen, setIsCustomerPickerOpen] = useState(false);
  const [customers, setCustomers] = useState(context.customers);
  const [isAddCustomerOpen, setIsAddCustomerOpen] = useState(false);
  const [customerFeedback, setCustomerFeedback] = useState<string | null>(null);
  const [isSavingCustomer, startSavingCustomer] = useTransition();
  const [jobSites, setJobSites] = useState(context.jobSites);
  const [materialId, setMaterialId] = useState("");
  const [taxRateId, setTaxRateId] = useState("");
  const [quantity, setQuantity] = useState("");
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
  const materialChoices = useMemo(
    () => buildMaterialChoices(context.materials),
    [context.materials],
  );
  const filteredCustomers = useMemo(() => {
    const query = normalizeMaterialLabel(customerSearch);
    if (!query) return customers;

    return customers.filter((customer) =>
      [customer.company_name, customer.name, customer.contact_name, customer.email, crmProviderLabel(customer.crm_provider)]
        .filter(Boolean)
        .some((value) => normalizeMaterialLabel(String(value)).includes(query)),
    );
  }, [customers, customerSearch]);
  const normalizedMaterialSearch = normalizeMaterialLabel(materialSearch);
  const typedMaterialMatch = normalizedMaterialSearch
    ? materialChoices.find(
        (choice) =>
          materialOptionLabels(choice.material).some(
            (label) => normalizeMaterialLabel(label) === normalizedMaterialSearch,
          ),
      )
    : undefined;
  const effectiveMaterialId = materialId || typedMaterialMatch?.material.id || "";
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
  const selectedCustomer = customers.find(
    (customer) => customer.id === customerId,
  );
  const calculationTaxRate = selectedTaxRate?.rate ?? 0;
  const filteredMaterials = useMemo(() => {
    const term = materialSearch.trim().toLowerCase();

    if (!term) {
      return materialChoices;
    }

    return materialChoices.filter((choice) =>
      [
        choice.material.catalog_sku,
        choice.material.name,
        choice.material.catalog_category,
        choice.material.tier,
        choice.material.unit,
        ...choice.categories,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(term),
    );
  }, [materialChoices, materialSearch]);
  const materialSuggestions = filteredMaterials.slice(0, 8);
  const filteredJobSites = customerId
    ? jobSites.filter((site) => site.customer_id === customerId)
    : jobSites;
  const quantityValue = Number(quantity);
  const recommendation = useMemo(() => {
    if (
      !selectedMaterial ||
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
          taxRate: calculationTaxRate,
          pricingConfig,
          vehicleTypes: context.vehicleTypes,
          unitConversions: context.unitConversions,
          routeDurationSeconds: estimateRouteDurationSeconds({
            material,
            jobSite: selectedJobSite ?? null,
          }),
          routeDistanceMiles: estimatedRouteMiles(material, selectedJobSite),
          truckingProfile: material.trucking_profile,
          paymentTerms,
          catalogMarkupRule: material.catalog_markup_rule,
        }),
      }))
      .sort((left, right) => {
        const leftDistance = estimatedRouteMiles(left.material, selectedJobSite);
        const rightDistance = estimatedRouteMiles(right.material, selectedJobSite);

        return (
          (leftDistance ?? Number.MAX_SAFE_INTEGER) -
            (rightDistance ?? Number.MAX_SAFE_INTEGER) ||
          left.calculation.truckingSubtotal -
            right.calculation.truckingSubtotal ||
          left.calculation.total - right.calculation.total
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
    };
  }, [
    context.materials,
    context.pricingConfig,
    context.unitConversions,
    context.vehicleTypes,
    calculationTaxRate,
    quantityValue,
    paymentTerms,
    selectedMaterial,
    selectedJobSite,
  ]);
  const selectedLineOption = recommendation?.recommended ?? null;
  const liveCalculation = selectedLineOption?.calculation ?? null;
  const currentLineDraft =
    selectedMaterial &&
    selectedLineOption &&
    liveCalculation &&
    Number.isFinite(quantityValue) &&
    quantityValue > 0
      ? {
          id: "current",
          materialId: selectedLineOption.material.id,
          quantity: quantityValue,
          materialUnitPriceOverride: null,
          material: selectedLineOption.material,
          calculation: liveCalculation,
        }
      : null;
  const submitLines = useMemo(
    () =>
      quoteLines.map((line) =>
        context.pricingConfig
          ? {
              ...line,
              calculation: calculateQuoteDraft({
                costPerUnit: line.material.cost_per_unit,
                quantity: line.quantity,
                tier: line.material.tier,
                unit: line.material.unit,
                taxRate: calculationTaxRate,
                pricingConfig: context.pricingConfig,
                vehicleTypes: context.vehicleTypes,
                unitConversions: context.unitConversions,
                routeDurationSeconds: estimateRouteDurationSeconds({
                  material: line.material,
                  jobSite: selectedJobSite ?? null,
                }),
                routeDistanceMiles: estimatedRouteMiles(
                  line.material,
                  selectedJobSite,
                ),
                truckingProfile: line.material.trucking_profile,
                paymentTerms,
                catalogMarkupRule: line.material.catalog_markup_rule,
              }),
            }
          : line,
      ),
    [
      calculationTaxRate,
      context.pricingConfig,
      context.unitConversions,
      context.vehicleTypes,
      paymentTerms,
      quoteLines,
      selectedJobSite,
    ],
  );
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
      title: "Choose the job site",
      summary: selectedJobSite
        ? `${selectedJobSite.name} - ${selectedJobSite.city}, ${selectedJobSite.state}`
        : "Not selected",
      complete: Boolean(jobSiteId),
    },
    {
      key: "materials",
      kicker: "Step 3",
      title: "Add materials",
      summary:
        hasQuoteLineReady
          ? `${submitLines.length} line${submitLines.length === 1 ? "" : "s"}`
          : selectedMaterial
            ? `Add ${selectedMaterial.name}`
            : "Not selected",
      complete: hasQuoteLineReady,
    },
    {
      key: "pricing",
      kicker: "Step 4",
      title: "Confirm tax and pricing",
      summary: hasQuoteLineReady
        ? formatCurrency(draftTotals.total)
        : "Waiting for inputs",
      complete: Boolean(hasQuoteLineReady && selectedTaxRate),
    },
    {
      key: "review",
      kicker: "Step 5",
      title: "Review and save",
      summary: hasQuoteLineReady
        ? `${formatCurrency(draftTotals.total)} draft`
        : "Complete prior steps",
      complete: Boolean(hasQuoteLineReady && selectedTaxRate),
    },
  ];
  const currentStep = steps[activeStep] ?? steps[0];
  const progressPct = ((activeStep + 1) / steps.length) * 100;
  const canAdvance = currentStep.complete;
  const quoteLineBlocker = !selectedMaterial
    ? hasQuoteLineReady
      ? "Search another material above to add another line, or continue to tax and pricing."
      : "Choose a material from the suggestions to continue."
    : !Number.isFinite(quantityValue) || quantityValue <= 0
      ? "Enter a quantity greater than zero to continue."
      : !context.pricingConfig
          ? "Pricing configuration is missing. Open Admin > Pricing to save the default pricing setup."
          : !recommendation
            ? "This material is selected, but QuoteBase could not calculate supplier pricing for its tier, unit, and cost."
            : null;
  const stepBlocker =
    activeStep === 1 && !jobSiteId
      ? "Choose or create a job site to continue."
      : activeStep === 2 && !hasQuoteLineReady
        ? currentLineDraft
          ? "Add one of the pricing options to the quote before continuing."
          : (quoteLineBlocker ?? "Add at least one material to continue.")
        : activeStep === 3 && !selectedTaxRate
          ? "Choose a tax area to continue."
      : null;

  function goToStep(nextStep: number) {
    setActiveStep(Math.min(Math.max(nextStep, 0), steps.length - 1));
  }

  function handleCustomerChange(nextCustomerId: string) {
    setCustomerId(nextCustomerId);
    const nextCustomer = customers.find(
      (customer) => customer.id === nextCustomerId,
    );
    setCustomerSearch(nextCustomer ? customerDisplayLabel(nextCustomer) : "");
    setPaymentTerms(nextCustomer?.payment_terms ?? "COD");

    if (
      jobSiteId &&
      nextCustomerId &&
      selectedJobSite?.customer_id !== nextCustomerId
    ) {
      clearSelectedJobSite();
    }
  }

  function handleCreateCustomer(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    setCustomerFeedback(null);
    startSavingCustomer(async () => {
      const response = await fetch("/api/customers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(Object.fromEntries(formData.entries())),
      });
      const payload: unknown = await response.json();
      const createdCustomer = readCreatedQuoteCustomer(payload);
      if (!response.ok || !createdCustomer) {
        setCustomerFeedback(readApiError(payload) || "Could not save customer.");
        return;
      }
      setCustomers((current) => [createdCustomer, ...current.filter((customer) => customer.id !== createdCustomer.id)]);
      setCustomerId(createdCustomer.id);
      setCustomerSearch(customerDisplayLabel(createdCustomer));
      setPaymentTerms(createdCustomer.payment_terms ?? "COD");
      setIsCustomerPickerOpen(false);
      setIsAddCustomerOpen(false);
      form.reset();
    });
  }

  function handleJobSiteChange(nextSiteId: string) {
    setJobSiteId(nextSiteId);
    const site = jobSites.find((item) => item.id === nextSiteId);

    if (!site) {
      return;
    }

    if (!customerId) {
      setCustomerId(site.customer_id);
      const siteCustomer = customers.find(
        (customer) => customer.id === site.customer_id,
      );
      setPaymentTerms(siteCustomer?.payment_terms ?? "COD");
    }

    setTaxRateId("");
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
    formData.set("postal_code", newJobSite.postalCode);
    formData.set("latitude", newJobSite.latitude);
    formData.set("longitude", newJobSite.longitude);
    formData.set("mapbox_id", newJobSite.mapboxId);

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

  function handleJobSiteAddressSelect(selection: MapboxAddressSelection) {
    setNewJobSite((current) => ({
      ...current,
      name: current.name || selection.street || selection.label,
      line1: selection.street,
      city: selection.city,
      county: selection.county,
      state: selection.state || current.state,
      postalCode: selection.postalCode,
      latitude: String(selection.latitude),
      longitude: String(selection.longitude),
      mapboxId: selection.mapboxId,
    }));
    setJobSiteFeedback(null);
  }

  function addLineForOption(
    option: Recommendation["options"][number],
  ) {
    setQuoteLines((lines) => [
      ...lines,
      {
        id:
          typeof crypto !== "undefined" && "randomUUID" in crypto
            ? crypto.randomUUID()
            : `${Date.now()}-${lines.length}`,
        materialId: option.material.id,
        quantity: quantityValue,
        materialUnitPriceOverride: null,
        material: option.material,
        calculation: option.calculation,
      },
    ]);
    setMaterialId("");
    setMaterialSearch("");
    setQuantity("");
    setIsMaterialPickerOpen(false);
  }

  function resetCurrentMaterial() {
    setMaterialId("");
    setMaterialSearch("");
    setQuantity("");
    setIsMaterialPickerOpen(false);
  }

  function removeLine(lineId: string) {
    if (lineId === "current") {
      resetCurrentMaterial();
      return;
    }

    setQuoteLines((lines) => lines.filter((line) => line.id !== lineId));
  }

  function handleMaterialSearchChange(value: string) {
    setMaterialSearch(value);
    setMaterialId("");
    setIsMaterialPickerOpen(value.trim().length > 0);
  }

  function selectMaterial(material: NewQuoteContext["materials"][number]) {
    setMaterialId(material.id);
    setMaterialSearch(formatMaterialOption(material));
    setIsMaterialPickerOpen(false);
  }

  return (
    <>
    <form
      action={formAction}
      className="grid gap-6 lg:grid-cols-[0.72fr_0.28fr]"
      noValidate
    >
      <input type="hidden" name="line_items" value={submitLineItemsJson} />
      <input type="hidden" name="use_selected_plant" value="on" />
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
            <div className="flex justify-end">
              <Button
                type="button"
                variant="outline"
                className="h-9 rounded-full"
                onClick={() => {
                  setCustomerFeedback(null);
                  setIsCustomerPickerOpen(false);
                  setIsAddCustomerOpen(true);
                }}
              >
                <Plus className="size-4" />
                Add customer
              </Button>
            </div>
            <Field
              label="Customer"
              required
              error={state.fieldErrors.customer_id}
            >
              <div
                className="relative"
                onBlur={(event) => {
                  if (!event.currentTarget.contains(event.relatedTarget)) setIsCustomerPickerOpen(false);
                }}
              >
                <input type="hidden" name="customer_id" value={customerId} readOnly required />
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                  <input
                    type="text"
                    className="soft-control w-full px-10"
                    value={customerSearch}
                    placeholder="Type a customer name, contact, email, or CRM..."
                    role="combobox"
                    aria-expanded={isCustomerPickerOpen}
                    aria-controls="quote-customer-options"
                    aria-invalid={Boolean(state.fieldErrors.customer_id)}
                    autoComplete="off"
                    onFocus={() => setIsCustomerPickerOpen(true)}
                    onChange={(event) => {
                      const nextSearch = event.target.value;
                      if (customerId) handleCustomerChange("");
                      setCustomerSearch(nextSearch);
                      setIsCustomerPickerOpen(true);
                    }}
                  />
                  <ChevronDown className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                </div>
                {isCustomerPickerOpen ? (
                  <div id="quote-customer-options" role="listbox" className="absolute z-40 mt-2 max-h-72 w-full overflow-y-auto rounded-xl border border-border bg-popover p-1.5 text-popover-foreground shadow-xl">
                    {filteredCustomers.length ? filteredCustomers.map((customer) => (
                      <button
                        key={customer.id}
                        type="button"
                        role="option"
                        aria-selected={customer.id === customerId}
                        className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left hover:bg-secondary"
                        onClick={() => {
                          handleCustomerChange(customer.id);
                          setIsCustomerPickerOpen(false);
                        }}
                      >
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-semibold">{customerDisplayLabel(customer)}</span>
                          <span className="block truncate text-xs text-muted-foreground">{crmProviderLabel(customer.crm_provider)}{customer.email ? ` · ${customer.email}` : ""}</span>
                        </span>
                        {customer.id === customerId ? <Check className="size-4 text-primary" /> : null}
                      </button>
                    )) : (
                      <p className="px-3 py-5 text-center text-sm text-muted-foreground">No matching customers in QuoteBase or configured CRMs.</p>
                    )}
                  </div>
                ) : null}
              </div>
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field
                label="Quote date"
                required
                error={state.fieldErrors.quote_date}
              >
                <DatePicker
                  name="quote_date"
                  className="soft-control w-full"
                  value={quoteDate}
                  onChange={(nextQuoteDate) => {

                    setQuoteDate(nextQuoteDate);
                    setExpiresAt(
                      nextQuoteDate
                        ? localDateInputValue(addDaysFromInput(nextQuoteDate, 30))
                        : "",
                    );
                  }}
                  aria-invalid={Boolean(state.fieldErrors.quote_date)}
                  required
                />
              </Field>
              <Field
                label="Expires at"
                required
                error={state.fieldErrors.expires_at}
              >
                <DatePicker
                  name="expires_at"
                  className="soft-control w-full"
                  value={expiresAt}
                  onChange={setExpiresAt}
                  aria-invalid={Boolean(state.fieldErrors.expires_at)}
                  required
                />
              </Field>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field
                label="Customer Type"
                required
                error={state.fieldErrors.account_type}
              >
                <select
                  name="account_type"
                  className="soft-control w-full"
                  defaultValue={context.customerTypes.find((type) => type.code === "contractor")?.code ?? context.customerTypes[0]?.code ?? ""}
                  aria-invalid={Boolean(state.fieldErrors.account_type)}
                  required
                >
                  {context.customerTypes.map((customerType) => (
                    <option key={customerType.id} value={customerType.code}>
                      {customerType.name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field
                label="Project status"
                required
                error={state.fieldErrors.project_status}
              >
                <select
                  name="project_status"
                  className="soft-control w-full"
                  defaultValue={context.projectStatusOptions[0]?.value ?? "bid"}
                  aria-invalid={Boolean(state.fieldErrors.project_status)}
                  required
                >
                  {context.projectStatusOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field
                label="Job start"
                optional
                error={state.fieldErrors.job_start_date}
              >
                <DatePicker
                  name="job_start_date"
                  className="soft-control w-full"
                  aria-invalid={Boolean(state.fieldErrors.job_start_date)}
                />
              </Field>
              <Field
                label="Job end"
                optional
                error={state.fieldErrors.job_end_date}
              >
                <DatePicker
                  name="job_end_date"
                  className="soft-control w-full"
                  aria-invalid={Boolean(state.fieldErrors.job_end_date)}
                />
              </Field>
            </div>
          </div>
        </section>

        <section className={stepPanelClass(activeStep === 1)}>
          <SectionHeader
            icon={MapPin}
            kicker="Job Site"
            title="Select or create the delivery job site"
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
                  {mode === "saved" ? "Existing job site" : "Create new job site"}
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
                    : "Select a customer first to choose or create a job site."}
                </span>
              </Field>
            ) : (
              <div className="rounded-[18px] border border-white/70 bg-white/65 p-4">
                <p className="mb-4 text-sm leading-6 text-muted-foreground">
                  Create a job site for this quote. After it is saved, it will be
                  selected automatically and used for trucking distance.
                </p>
                <div className="mb-4">
                  <MapboxAddressSearch
                    label="Delivery address search"
                    placeholder="Search job site or delivery address with Mapbox..."
                    disabled={!customerId || isSavingJobSite}
                    onSelect={handleJobSiteAddressSelect}
                  />
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field
                    label="Site name"
                    required
                    error={jobSiteFeedback?.fieldErrors.name}
                  >
                    <input
                      className="soft-control w-full cursor-default bg-muted/40"
                      value={newJobSite.name}
                      readOnly
                      disabled={!customerId || isSavingJobSite}
                    />
                  </Field>
                  <Field
                    label="Address line"
                    error={jobSiteFeedback?.fieldErrors.line1}
                  >
                    <input
                      className="soft-control w-full cursor-default bg-muted/40"
                      value={newJobSite.line1}
                      readOnly
                      disabled={!customerId || isSavingJobSite}
                    />
                  </Field>
                  <Field
                    label="City"
                    required
                    error={jobSiteFeedback?.fieldErrors.city}
                  >
                    <input
                      className="soft-control w-full cursor-default bg-muted/40"
                      value={newJobSite.city}
                      readOnly
                      disabled={!customerId || isSavingJobSite}
                    />
                  </Field>
                  <Field
                    label="County"
                    required
                    error={jobSiteFeedback?.fieldErrors.county}
                  >
                    <input
                      className="soft-control w-full cursor-default bg-muted/40"
                      value={newJobSite.county}
                      readOnly
                      disabled={!customerId || isSavingJobSite}
                    />
                  </Field>
                  <Field
                    label="State"
                    required
                    error={jobSiteFeedback?.fieldErrors.state}
                  >
                    <input
                      className="soft-control w-full cursor-default bg-muted/40"
                      value={newJobSite.state}
                      readOnly
                      disabled={!customerId || isSavingJobSite}
                      maxLength={2}
                    />
                  </Field>
                  <Field label="ZIP" optional>
                    <input
                      className="soft-control w-full cursor-default bg-muted/40"
                      value={newJobSite.postalCode}
                      readOnly
                      disabled={!customerId || isSavingJobSite}
                    />
                  </Field>
                  <Field
                    label="Latitude"
                    optional
                    error={jobSiteFeedback?.fieldErrors.latitude}
                  >
                    <input
                      className="soft-control w-full cursor-default bg-muted/40"
                      type="number"
                      step="0.0000001"
                      value={newJobSite.latitude}
                      readOnly
                      disabled={!customerId || isSavingJobSite}
                    />
                  </Field>
                  <Field
                    label="Longitude"
                    optional
                    error={jobSiteFeedback?.fieldErrors.longitude}
                  >
                    <input
                      className="soft-control w-full cursor-default bg-muted/40"
                      type="number"
                      step="0.0000001"
                      value={newJobSite.longitude}
                      readOnly
                      disabled={!customerId || isSavingJobSite}
                    />
                  </Field>
                </div>
                <div className="mt-4 flex flex-wrap items-center gap-3">
                  <Button
                    type="button"
                    className="rounded-full"
                    disabled={
                      !customerId || !newJobSite.mapboxId || isSavingJobSite
                    }
                    onClick={saveNewJobSite}
                  >
                    {isSavingJobSite ? "Saving..." : "Save and use job site"}
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
            kicker="Materials"
            title="Add materials and choose supplier options"
          />
          <div className="mt-5 grid gap-4">
            {!selectedJobSite ? (
              <div className="soft-row p-4 text-sm leading-6 text-muted-foreground">
                Choose or create the delivery job site first so QuoteBase can
                calculate trucking before ranking supplier plants.
              </div>
            ) : null}
            <Field
              label={hasQuoteLineReady ? "Next material" : "Material"}
              required={!hasQuoteLineReady}
              error={state.fieldErrors.material_id}
            >
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
                <input type="hidden" name="material_id" value="" />
                <input
                  type="search"
                  className="soft-control w-full"
                  placeholder={
                    hasQuoteLineReady
                      ? "Search another material to add"
                      : "Search by SKU, material, or category"
                  }
                  value={materialSearch}
                  onFocus={() =>
                    setIsMaterialPickerOpen(materialSearch.trim().length > 0)
                  }
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
                      materialSuggestions.map((choice) => (
                        <button
                          key={choice.key}
                          type="button"
                          role="option"
                          aria-selected={choice.material.id === materialId}
                          className="w-full rounded-[14px] px-3 py-3 text-left transition hover:bg-secondary focus:bg-secondary focus:outline-none"
                          onMouseDown={(event) => event.preventDefault()}
                          onClick={() => selectMaterial(choice.material)}
                        >
                          <span className="block text-sm font-semibold text-foreground">
                            {formatMaterialOption(choice.material)}
                          </span>
                          <span className="mt-1 block text-xs text-muted-foreground">
                            {[
                              choice.categories[0],
                              `${choice.supplierCount} supplier${
                                choice.supplierCount === 1 ? "" : "s"
                              }`,
                              `${choice.plantCount} plant${
                                choice.plantCount === 1 ? "" : "s"
                              } available`,
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
            {selectedMaterial ? (
              <div className="rounded-[18px] border border-emerald-100 bg-emerald-50/70 p-4 text-sm text-emerald-900">
                <p className="font-semibold">Material selected</p>
                <p className="mt-1 leading-6">
                  {[
                    selectedMaterial.catalog_sku
                      ? `SKU ${selectedMaterial.catalog_sku}`
                      : null,
                    selectedMaterial.name,
                    selectedMaterial.tier,
                    selectedMaterial.unit,
                    selectedMaterial.catalog_category,
                  ]
                    .filter(Boolean)
                    .join(" - ")}
                </p>
              </div>
            ) : null}
            {selectedMaterial && !selectedJobSite ? (
              <div className="soft-row p-4 text-sm leading-6 text-muted-foreground">
                Select or add a job site so QuoteBase can calculate trucking and
                rank supplier plants.
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
                selectedJobSite={selectedJobSite ?? null}
                recommendationCount={context.pricingConfig?.quote_recommendation_count ?? 3}
                onAddOption={addLineForOption}
              />
            ) : (
              <div
                className={`soft-row p-4 text-sm leading-6 ${
                  hasQuoteLineReady
                    ? "text-primary"
                    : "text-muted-foreground"
                }`}
              >
                {quoteLineBlocker ??
                  "QuoteBase is preparing supplier catalog options for this line."}
              </div>
            )}
            {submitLines.length ? (
              <QuoteLinesTable lines={submitLines} onRemoveLine={removeLine} />
            ) : null}
            {state.fieldErrors.line_items ? (
              <p className="rounded-[16px] bg-rose-50 px-4 py-3 text-sm text-rose-700 ring-1 ring-rose-100">
                {state.fieldErrors.line_items}
              </p>
            ) : null}
          </div>
        </section>

        <section className={stepPanelClass(activeStep === 3)}>
          <SectionHeader
            icon={BrainCircuit}
            kicker="Quote Intelligence"
            title="Confirm tax and pricing"
          />
          <div className="mt-5">
            <Field label="Tax area" required>
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
          </div>
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
            </div>
          ) : (
            <p className="mt-5 text-sm leading-6 text-muted-foreground">
              Select a material, quantity, and tax area to see the markup,
              trucking, fees, margin, and approval logic before saving.
            </p>
          )}
        </section>

        <section className={stepPanelClass(activeStep === 4)}>
          <SectionHeader
            icon={FilePlus2}
            kicker="Save"
            title="Review and save the draft quote"
          />
          <div className="mt-5 space-y-4">
            {submitLines.length ? (
              <QuoteLinesTable lines={submitLines} onRemoveLine={removeLine} />
            ) : null}
            <SummaryRow
              label="Draft quote total"
              value={formatCurrency(draftTotals.total)}
              strong
            />
            <Field label="Notes" optional>
              <textarea
                name="notes"
                className="soft-control min-h-28 w-full resize-none py-3"
                placeholder="Internal notes for this draft"
              />
            </Field>
            <Button
              type="submit"
              disabled={
                isPending ||
                !context.quoteCreationEnabled ||
                !hasQuoteLineReady ||
                !selectedTaxRate
              }
              className="h-11 w-full rounded-full"
            >
              <FilePlus2 className="size-4" />
              {isPending ? "Saving..." : "Save draft quote"}
            </Button>
            {state.message ? (
              <p className="rounded-[16px] bg-rose-50 px-4 py-3 text-sm text-rose-700 ring-1 ring-rose-100">
                {state.message}
              </p>
            ) : null}
          </div>
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
            {stepBlocker ? (
              <p className="max-w-sm text-right text-xs font-medium text-muted-foreground">
                {stepBlocker}
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
    {isAddCustomerOpen ? (
      <div className="fixed inset-0 z-[200] flex items-start justify-center overflow-y-auto bg-foreground/45 p-4 pt-[8vh] backdrop-blur-sm">
        <form
          className="glass-panel w-full max-w-2xl p-5 shadow-2xl sm:p-6"
          role="dialog"
          aria-modal="true"
          aria-labelledby="add-quote-customer-title"
          onSubmit={handleCreateCustomer}
        >
          <div className="flex items-start justify-between gap-4 border-b border-border pb-4">
            <div>
              <p className="text-sm font-medium text-muted-foreground">Quote customer</p>
              <h2 id="add-quote-customer-title" className="mt-1 text-2xl font-semibold">Add customer</h2>
              <p className="mt-2 text-sm text-muted-foreground">The new customer will be selected automatically.</p>
            </div>
            <Button type="button" variant="ghost" size="icon" aria-label="Close add customer" onClick={() => setIsAddCustomerOpen(false)}>
              <X className="size-4" />
            </Button>
          </div>
          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <ModalField label="Customer name" name="name" required />
            <ModalField label="Company" name="company_name" />
            <ModalField label="Contact name" name="contact_name" />
            <ModalField label="Email" name="email" type="email" />
            <ModalField label="Phone" name="phone" />
            <ModalField label="Address" name="address" />
            <label>
              <span className="text-sm font-medium text-muted-foreground">Payment terms</span>
              <select name="payment_terms" defaultValue="COD" className="soft-control mt-2 w-full">
                <option value="COD">COD</option>
                <option value="Net30">Net30</option>
              </select>
            </label>
          </div>
          {customerFeedback ? <p className="mt-4 text-sm font-medium text-destructive">{customerFeedback}</p> : null}
          <div className="mt-6 flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setIsAddCustomerOpen(false)}>Cancel</Button>
            <Button type="submit" disabled={isSavingCustomer}>{isSavingCustomer ? "Saving..." : "Save and select"}</Button>
          </div>
        </form>
      </div>
    ) : null}
    </>
  );
}

function ModalField({ label, name, type = "text", required = false }: { label: string; name: string; type?: "text" | "email"; required?: boolean }) {
  return <label><span className="text-sm font-medium text-muted-foreground">{label}{required ? <span className="ml-1 text-destructive">Required</span> : null}</span><input name={name} type={type} required={required} maxLength={type === "email" ? 254 : 240} className="soft-control mt-2 w-full" /></label>;
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
};

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
  selectedJobSite,
  recommendationCount,
  onAddOption,
}: {
  recommendation: Recommendation;
  selectedJobSite: NewQuoteContext["jobSites"][number] | null;
  recommendationCount: number;
  onAddOption: (option: Recommendation["options"][number]) => void;
}) {
  const topOptions = recommendation.options.slice(0, recommendationCount);

  if (!recommendationCount) {
    return null;
  }

  return (
    <div className="rounded-[18px] border border-white/70 bg-white/65 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold">Best pricing options</p>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">
            Closest supplier, plant, and material matches ranked by distance
            first, then trucking cost.
          </p>
        </div>
        <span className="soft-chip bg-[#ecf2ed] text-[#3d6652] ring-[#d7ded5]">
          {topOptions.length} best option
          {topOptions.length === 1 ? "" : "s"}
        </span>
      </div>

      <div className="mt-4 space-y-3">
        {topOptions.map((option, index) => {
          const isRecommended =
            option.material.id === recommendation.recommended.material.id;
          const routeMiles = estimatedRouteMiles(
            option.material,
            selectedJobSite,
          );

          return (
            <div
              key={option.material.id}
              className={`rounded-[16px] border border-border p-4 ${
                isRecommended ? "bg-secondary" : "bg-card/80"
              }`}
            >
              <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(440px,0.95fr)_auto] lg:items-center">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-full bg-white/80 px-2.5 py-1 text-xs font-semibold text-muted-foreground ring-1 ring-border">
                      {isRecommended ? "Use" : `#${index + 1}`}
                    </span>
                    <h3 className="break-words text-sm font-semibold">
                      {supplierCompanyName(option.material)} /{" "}
                      {plantName(option.material)}
                    </h3>
                    {isRecommended ? (
                      <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700 ring-1 ring-emerald-100">
                        Recommended
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-2 break-words text-sm font-medium">
                    {option.material.name}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {option.material.catalog_category ?? "Catalog material"} -{" "}
                    {option.material.tier} - {option.material.unit}
                    {option.material.catalog_sku
                      ? ` - SKU ${option.material.catalog_sku}`
                      : ""}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {option.calculation.loadCount.toFixed(0)} load
                    {option.calculation.loadCount === 1 ? "" : "s"}
                    {option.calculation.vehicleName
                      ? ` via ${option.calculation.vehicleName}`
                      : ""}
                  </p>
                </div>

                <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                  <OptionMetric label="Distance" value={formatDistance(routeMiles)} />
                  <OptionMetric
                    label="Supplier unit cost"
                    value={formatCurrency(option.material.cost_per_unit)}
                  />
                  <OptionMetric
                    label="Recommended trucking"
                    value={
                      option.calculation.truckingRecommendation
                        ? `${formatCurrency(option.calculation.truckingRecommendation.ratePerCapacityUnit)}/${option.calculation.quoteQuantityBasis === "cy" ? "CY" : "ton"}`
                        : formatCurrency(option.calculation.truckingSubtotal)
                    }
                    strong
                  />
                </div>
                <Button
                  type="button"
                  className="h-10 rounded-full"
                  onClick={() => onAddOption(option)}
                >
                  <FilePlus2 className="size-4" />
                  Add
                </Button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function OptionMetric({
  label,
  value,
  strong = false,
}: {
  label: string;
  value: string;
  strong?: boolean;
}) {
  return (
    <div className="rounded-xl bg-white/70 px-3 py-2 ring-1 ring-border">
      <p className="text-[11px] font-semibold uppercase text-muted-foreground">
        {label}
      </p>
      <p
        title={value}
        className={`mt-1 break-words font-mono text-xs leading-5 ${
          strong ? "font-semibold text-foreground" : "text-foreground"
        }`}
      >
        {value}
      </p>
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

function formatDistance(value: number | null): string {
  return value === null ? "--" : `${value.toFixed(1)} mi`;
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
            {plantName(recommendation.recommended.material)} is the supplier
            and plant QuoteBase will use for this line based on catalog cost,
            load plan, trucking, fees, and tax.
          </p>
          <div className="mt-3 grid gap-2">
            <MiniMetric
              label="Chosen supplier"
              value={supplierCompanyName(recommendation.recommended.material)}
            />
            <MiniMetric
              label="Chosen plant"
              value={plantName(recommendation.recommended.material)}
            />
            <MiniMetric
              label="Chosen total"
              value={formatCurrency(recommendation.recommended.calculation.total)}
            />
            <MiniMetric
              label="Sell price"
              value={`${formatCurrency(
                recommendation.recommended.calculation.materialUnitPrice,
              )} / ${unit}`}
            />
          </div>
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

function addDays(date: Date, days: number): Date {
  const next = new Date(date);

  next.setDate(next.getDate() + days);
  return next;
}

function addDaysFromInput(value: string, days: number): Date {
  const [year, month, day] = value.split("-").map(Number);
  const date =
    Number.isInteger(year) && Number.isInteger(month) && Number.isInteger(day)
      ? new Date(year, month - 1, day)
      : new Date();

  return addDays(date, days);
}

function localDateInputValue(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function readCreatedQuoteCustomer(payload: unknown): NewQuoteContext["customers"][number] | null {
  if (!isRecord(payload) || !isRecord(payload.data) || !isRecord(payload.data.customer)) return null;
  const customer = payload.data.customer;
  if (typeof customer.id !== "string" || typeof customer.name !== "string") return null;
  return {
    id: customer.id,
    name: customer.name,
    company_name: typeof customer.company_name === "string" ? customer.company_name : null,
    contact_name: typeof customer.contact_name === "string" ? customer.contact_name : null,
    phone: typeof customer.phone === "string" ? customer.phone : null,
    email: typeof customer.email === "string" ? customer.email : null,
    address: isRecord(customer.address) ? customer.address : {},
    payment_terms: typeof customer.payment_terms === "string" ? customer.payment_terms : "COD",
    crm_provider: "quotebase",
    quote_history: [],
  };
}

function readApiError(payload: unknown): string {
  return isRecord(payload) && isRecord(payload.error) && typeof payload.error.message === "string" ? payload.error.message : "";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function customerDisplayLabel(customer: NewQuoteContext["customers"][number]): string {
  const company = customer.company_name ?? customer.name;
  return customer.contact_name ? `${company} - ${customer.contact_name}` : company;
}

function crmProviderLabel(provider: NewQuoteContext["customers"][number]["crm_provider"]): string {
  const labels = {
    quotebase: "QuoteBase",
    pipedrive: "Pipedrive",
    salesforce: "Salesforce",
    hubspot: "HubSpot",
    zoho: "Zoho",
  } satisfies Record<NewQuoteContext["customers"][number]["crm_provider"], string>;

  return labels[provider];
}
