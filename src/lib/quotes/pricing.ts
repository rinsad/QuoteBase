export type MaterialTier = "R1" | "R2" | "R3" | "R4";
export type TruckRateKey = "floor" | "standard" | "target" | "premium" | "stretch";

export type QuoteProjectStatusOption = {
  value: string;
  label: string;
};

export type PricingConfig = {
  tier_r1_min: number;
  tier_r1_max: number;
  tier_r2_min: number;
  tier_r2_max: number;
  tier_r3_min: number;
  tier_r3_max: number;
  tier_r4_min: number;
  tier_r4_max: number;
  truck_floor_rate: number;
  truck_standard_rate: number;
  truck_target_rate: number;
  truck_premium_rate: number;
  truck_stretch_rate: number;
  default_truck_rate: string;
  fuel_surcharge_per_load: number;
  environmental_fee_per_load: number;
  material_minimum?: number;
  trucking_minimum?: number;
  cc_surcharge_pct?: number;
  overhead_per_ton: number;
  big_quote_threshold?: number;
  default_followup_max_attempts?: number;
  jobs_starting_soon_days?: number;
  follow_up_auto_send_enabled?: boolean;
  follow_up_sms_enabled?: boolean;
  project_status_options?: QuoteProjectStatusOption[];
};

export type CatalogMarkupRule = {
  id: string;
  supplier_id: string | null;
  scope: "global" | "category" | "item";
  category: string | null;
  catalog_item_id: string | null;
  markup_type: "percent" | "dollar";
  markup_value: number;
  margin_floor_pct: number | null;
  priority: number;
  effective_from?: string | null;
  effective_to?: string | null;
};

export type CatalogPricedMaterial = {
  supplier_id: string;
  supplier_catalog_item_id: string | null;
  catalog_category: string | null;
};

export type VehicleCapacity = {
  id: string;
  name: string;
  capacity_tons: number;
  capacity_cy: number | null;
};

export type QuoteQuantityBasis = "ton" | "cy" | "load" | "count" | "none";

export type QuoteUnitConversion = {
  code: string;
  quoteQuantityBasis: QuoteQuantityBasis;
  quoteQuantityFactor: number | null;
};

export type QuoteDraftCalculationInput = {
  costPerUnit: number;
  quantity: number;
  tier: MaterialTier;
  unit: string;
  taxRate: number;
  pricingConfig: PricingConfig;
  vehicleTypes?: VehicleCapacity[];
  unitConversions?: QuoteUnitConversion[];
  routeDurationSeconds?: number | null;
  deadheadDurationSeconds?: number | null;
  materialUnitPriceOverride?: number | null;
  truckRateOverride?: TruckRateKey | null;
  materialMinimumOverride?: number | null;
  truckingMinimumOverride?: number | null;
  applyMaterialMinimum?: boolean;
  paymentTerms?: string | null;
  applyCreditCardSurcharge?: boolean;
  catalogMarkupRule?: CatalogMarkupRule | null;
};

export type QuoteDraftCalculation = {
  markupPerUnit: number;
  markupPct: number;
  markupSource: "tier" | "catalog";
  markupRuleId: string | null;
  materialUnitPrice: number;
  materialSubtotal: number;
  grossMarginPct: number | null;
  marginFloorPct: number | null;
  marginFloorWarning: boolean;
  vehicleTypeId: string | null;
  vehicleName: string | null;
  quoteQuantityBasis: QuoteQuantityBasis;
  quoteQuantityFactor: number | null;
  truckCapacityQuantity: number;
  loadCount: number;
  truckingRatePerUnit: number;
  truckingRateKey: TruckRateKey;
  truckingHourlyRate: number;
  truckingSubtotal: number;
  feesSubtotal: number;
  taxTotal: number;
  total: number;
};

export function calculateQuoteDraft({
  costPerUnit,
  quantity,
  tier,
  unit,
  taxRate,
  pricingConfig,
  vehicleTypes = [],
  unitConversions = [],
  routeDurationSeconds = null,
  deadheadDurationSeconds = null,
  materialUnitPriceOverride = null,
  truckRateOverride = null,
  materialMinimumOverride = null,
  truckingMinimumOverride = null,
  applyMaterialMinimum = true,
  paymentTerms = null,
  applyCreditCardSurcharge = true,
  catalogMarkupRule = null,
}: QuoteDraftCalculationInput): QuoteDraftCalculation {
  const catalogMarkupPerUnit = catalogMarkupRule
    ? getCatalogMarkupPerUnit(costPerUnit, catalogMarkupRule)
    : null;
  const markupPerUnit =
    catalogMarkupPerUnit ?? getTierMarkupPerUnit(tier, pricingConfig);
  const truckRateKey = getTruckRateKey(pricingConfig, truckRateOverride);
  const truckHourlyRate = getTruckHourlyRate(pricingConfig, truckRateKey);
  const unitConversion = resolveUnitConversion(unit, unitConversions);
  const overheadPerUnit =
    unitConversion.quoteQuantityBasis === "ton" && unitConversion.quoteQuantityFactor
      ? pricingConfig.overhead_per_ton * unitConversion.quoteQuantityFactor
      : 0;
  const suggestedMaterialUnitPrice = costPerUnit + markupPerUnit + overheadPerUnit;
  const materialUnitPrice =
    materialUnitPriceOverride !== null &&
    Number.isFinite(materialUnitPriceOverride) &&
    materialUnitPriceOverride > 0
      ? materialUnitPriceOverride
      : suggestedMaterialUnitPrice;
  const materialMinimum = applyMaterialMinimum
    ? resolveMinimumOverride(
        materialMinimumOverride,
        pricingConfig.material_minimum ?? 0,
      )
    : 0;
  const materialSubtotal = Math.max(materialUnitPrice * quantity, materialMinimum);
  const grossMarginPct =
    materialSubtotal > 0
      ? ((materialSubtotal - costPerUnit * quantity) / materialSubtotal) * 100
      : null;
  const marginFloorPct =
    catalogMarkupRule?.margin_floor_pct === null ||
    catalogMarkupRule?.margin_floor_pct === undefined
      ? null
      : Number(catalogMarkupRule.margin_floor_pct);
  const marginFloorWarning =
    grossMarginPct !== null &&
    marginFloorPct !== null &&
    grossMarginPct < marginFloorPct;
  const vehiclePlan = chooseVehiclePlan({
    quantity,
    unitConversion,
    vehicleTypes,
  });
  const routeSeconds =
    routeDurationSeconds === null ? null : Math.max(0, routeDurationSeconds);
  const deadheadSeconds =
    deadheadDurationSeconds === null ? 0 : Math.max(0, deadheadDurationSeconds);
  const roundTripSeconds =
    routeSeconds === null ? null : routeSeconds * 2 + deadheadSeconds;
  const rawTruckingSubtotal =
    roundTripSeconds === null
      ? truckHourlyRate * vehiclePlan.loadCount
      : truckHourlyRate * (roundTripSeconds / 3600) * vehiclePlan.loadCount;
  const truckingMinimum = resolveMinimumOverride(
    truckingMinimumOverride,
    pricingConfig.trucking_minimum ?? 0,
  );
  const truckingSubtotal = Math.max(
    rawTruckingSubtotal,
    truckingMinimum * vehiclePlan.loadCount,
  );
  const truckingRatePerUnit = quantity > 0 ? truckingSubtotal / quantity : 0;
  const loadFeesSubtotal =
    (pricingConfig.fuel_surcharge_per_load +
      pricingConfig.environmental_fee_per_load) *
    vehiclePlan.loadCount;
  const creditCardSurcharge =
    applyCreditCardSurcharge && isCodPaymentTerms(paymentTerms)
      ? (materialSubtotal + truckingSubtotal + loadFeesSubtotal) *
        ((pricingConfig.cc_surcharge_pct ?? 0) / 100)
      : 0;
  const feesSubtotal = loadFeesSubtotal + creditCardSurcharge;
  const taxableSubtotal = materialSubtotal + truckingSubtotal + feesSubtotal;
  const taxTotal = taxableSubtotal * taxRate;

  return {
    markupPerUnit: roundMoney(markupPerUnit),
    // Legacy field name retained for older quote_items rows/API clients.
    markupPct: roundMoney(markupPerUnit),
    markupSource: catalogMarkupRule ? "catalog" : "tier",
    markupRuleId: catalogMarkupRule?.id ?? null,
    materialUnitPrice: roundMoney(materialUnitPrice),
    materialSubtotal: roundMoney(materialSubtotal),
    grossMarginPct:
      grossMarginPct === null
        ? null
        : Math.round((grossMarginPct + Number.EPSILON) * 10) / 10,
    marginFloorPct,
    marginFloorWarning,
    vehicleTypeId: vehiclePlan.vehicleTypeId,
    vehicleName: vehiclePlan.vehicleName,
    quoteQuantityBasis: unitConversion.quoteQuantityBasis,
    quoteQuantityFactor: unitConversion.quoteQuantityFactor,
    truckCapacityQuantity: roundQuantity(vehiclePlan.truckCapacityQuantity),
    loadCount: roundQuantity(vehiclePlan.loadCount),
    truckingRatePerUnit: roundMoney(truckingRatePerUnit),
    truckingRateKey: truckRateKey,
    truckingHourlyRate: roundMoney(truckHourlyRate),
    truckingSubtotal: roundMoney(truckingSubtotal),
    feesSubtotal: roundMoney(feesSubtotal),
    taxTotal: roundMoney(taxTotal),
    total: roundMoney(taxableSubtotal + taxTotal),
  };
}

export function resolveCatalogMarkupRule(
  material: CatalogPricedMaterial,
  rules: CatalogMarkupRule[],
): CatalogMarkupRule | null {
  const normalizedCategory = normalizeRuleText(material.catalog_category);
  const matches = rules
    .map((rule) => {
      const specificity = getRuleSpecificity({
        rule,
        material,
        normalizedCategory,
      });

      return specificity === null ? null : { rule, specificity };
    })
    .filter(
      (value): value is { rule: CatalogMarkupRule; specificity: number } =>
        value !== null,
    )
    .sort((left, right) => {
      return (
        left.specificity - right.specificity ||
        left.rule.priority - right.rule.priority ||
        Number(Boolean(right.rule.supplier_id)) -
          Number(Boolean(left.rule.supplier_id))
      );
    });

  return matches[0]?.rule ?? null;
}

export function normalizeCatalogMarkupRules(
  rules: CatalogMarkupRule[],
): CatalogMarkupRule[] {
  const today = new Date().toISOString().slice(0, 10);

  return rules
    .map((rule) => ({
      id: rule.id,
      supplier_id: rule.supplier_id,
      scope: rule.scope,
      category: rule.category,
      catalog_item_id: rule.catalog_item_id,
      markup_type: rule.markup_type,
      markup_value: Number(rule.markup_value),
      margin_floor_pct:
        rule.margin_floor_pct === null ? null : Number(rule.margin_floor_pct),
      priority: Number(rule.priority),
      effective_from: rule.effective_from ?? null,
      effective_to: rule.effective_to ?? null,
    }))
    .filter(
      (rule) =>
        ["global", "category", "item"].includes(rule.scope) &&
        ["percent", "dollar"].includes(rule.markup_type) &&
        Number.isFinite(rule.markup_value) &&
        rule.markup_value >= 0 &&
        isRuleEffective(rule, today),
    );
}

function getTierMarkupPerUnit(
  tier: MaterialTier,
  pricingConfig: PricingConfig,
): number {
  const tiers = {
    R1: [pricingConfig.tier_r1_min, pricingConfig.tier_r1_max],
    R2: [pricingConfig.tier_r2_min, pricingConfig.tier_r2_max],
    R3: [pricingConfig.tier_r3_min, pricingConfig.tier_r3_max],
    R4: [pricingConfig.tier_r4_min, pricingConfig.tier_r4_max],
  } satisfies Record<MaterialTier, [number, number]>;

  const [min, max] = tiers[tier];

  return (min + max) / 2;
}

function getCatalogMarkupPerUnit(
  costPerUnit: number,
  rule: CatalogMarkupRule,
): number {
  if (rule.markup_type === "percent") {
    return costPerUnit * (rule.markup_value / 100);
  }

  return rule.markup_value;
}

function getRuleSpecificity({
  rule,
  material,
  normalizedCategory,
}: {
  rule: CatalogMarkupRule;
  material: CatalogPricedMaterial;
  normalizedCategory: string;
}): number | null {
  if (rule.supplier_id && rule.supplier_id !== material.supplier_id) {
    return null;
  }

  if (
    rule.scope === "item" &&
    rule.catalog_item_id &&
    rule.catalog_item_id === material.supplier_catalog_item_id
  ) {
    return 0;
  }

  if (
    rule.scope === "category" &&
    normalizeRuleText(rule.category) &&
    normalizeRuleText(rule.category) === normalizedCategory
  ) {
    return 1;
  }

  if (rule.scope === "global") {
    return rule.supplier_id ? 2 : 3;
  }

  return null;
}

function normalizeRuleText(value: string | null | undefined): string {
  return value?.trim().toLowerCase() ?? "";
}

function isRuleEffective(rule: CatalogMarkupRule, today: string): boolean {
  return (
    (!rule.effective_from || rule.effective_from <= today) &&
    (!rule.effective_to || rule.effective_to >= today)
  );
}

function getTruckRateKey(
  pricingConfig: PricingConfig,
  truckRateOverride: TruckRateKey | null,
): TruckRateKey {
  const allowedRates: TruckRateKey[] = [
    "floor",
    "standard",
    "target",
    "premium",
    "stretch",
  ];

  if (truckRateOverride && allowedRates.includes(truckRateOverride)) {
    return truckRateOverride;
  }

  const defaultableRates: TruckRateKey[] = [
    "standard",
    "target",
    "premium",
    "stretch",
  ];

  return defaultableRates.includes(pricingConfig.default_truck_rate as TruckRateKey)
    ? (pricingConfig.default_truck_rate as TruckRateKey)
    : "target";
}

function getTruckHourlyRate(
  pricingConfig: PricingConfig,
  truckRateKey: TruckRateKey,
): number {
  const rates: Record<TruckRateKey, number> = {
    floor: pricingConfig.truck_floor_rate,
    standard: pricingConfig.truck_standard_rate,
    target: pricingConfig.truck_target_rate,
    premium: pricingConfig.truck_premium_rate,
    stretch: pricingConfig.truck_stretch_rate,
  };

  return rates[truckRateKey];
}

function resolveMinimumOverride(
  overrideValue: number | null,
  configuredMinimum: number,
): number {
  if (
    overrideValue !== null &&
    Number.isFinite(overrideValue) &&
    overrideValue >= 0
  ) {
    return overrideValue;
  }

  return configuredMinimum;
}

export function isCodPaymentTerms(paymentTerms: string | null | undefined): boolean {
  const terms = paymentTerms?.trim();

  return !terms || /\bcod\b/i.test(terms);
}

function chooseVehiclePlan({
  quantity,
  unitConversion,
  vehicleTypes,
}: {
  quantity: number;
  unitConversion: QuoteUnitConversion;
  vehicleTypes: VehicleCapacity[];
}): {
  vehicleTypeId: string | null;
  vehicleName: string | null;
  truckCapacityQuantity: number;
  loadCount: number;
} {
  const convertedQuantity =
    unitConversion.quoteQuantityFactor === null
      ? quantity
      : quantity * unitConversion.quoteQuantityFactor;

  if (
    unitConversion.quoteQuantityBasis === "load" ||
    unitConversion.quoteQuantityBasis === "count"
  ) {
    return {
      vehicleTypeId: null,
      vehicleName: null,
      truckCapacityQuantity: convertedQuantity,
      loadCount: Math.max(1, Math.ceil(convertedQuantity)),
    };
  }

  if (unitConversion.quoteQuantityBasis === "none") {
    return {
      vehicleTypeId: null,
      vehicleName: null,
      truckCapacityQuantity: convertedQuantity,
      loadCount: 1,
    };
  }

  const compatibleVehicles = vehicleTypes
    .map((vehicle) => ({
      ...vehicle,
      capacity:
        unitConversion.quoteQuantityBasis === "cy"
          ? Number(vehicle.capacity_cy ?? 0)
          : Number(vehicle.capacity_tons),
    }))
    .filter((vehicle) => vehicle.capacity > 0)
    .sort((a, b) => b.capacity - a.capacity);
  const selected = compatibleVehicles[0];

  if (!selected) {
    return {
      vehicleTypeId: null,
      vehicleName: null,
      truckCapacityQuantity: convertedQuantity,
      loadCount: 1,
    };
  }

  return {
    vehicleTypeId: selected.id,
    vehicleName: selected.name,
    truckCapacityQuantity: convertedQuantity,
    loadCount: Math.max(1, Math.ceil(convertedQuantity / selected.capacity)),
  };
}

function resolveUnitConversion(
  unit: string,
  unitConversions: QuoteUnitConversion[],
): QuoteUnitConversion {
  const configured = unitConversions.find(
    (conversion) => conversion.code === unit,
  );

  if (configured) {
    return configured;
  }

  return DEFAULT_UNIT_CONVERSIONS[unit] ?? {
    code: unit,
    quoteQuantityBasis: "none",
    quoteQuantityFactor: null,
  };
}

const DEFAULT_UNIT_CONVERSIONS: Record<string, QuoteUnitConversion> = {
  ton: { code: "ton", quoteQuantityBasis: "ton", quoteQuantityFactor: 1 },
  metric_ton: {
    code: "metric_ton",
    quoteQuantityBasis: "ton",
    quoteQuantityFactor: 1.10231131,
  },
  lbs: { code: "lbs", quoteQuantityBasis: "ton", quoteQuantityFactor: 0.0005 },
  oz: { code: "oz", quoteQuantityBasis: "ton", quoteQuantityFactor: 0.00003125 },
  kg: { code: "kg", quoteQuantityBasis: "ton", quoteQuantityFactor: 0.00110231 },
  g: { code: "g", quoteQuantityBasis: "ton", quoteQuantityFactor: 0.0000011 },
  cy: { code: "cy", quoteQuantityBasis: "cy", quoteQuantityFactor: 1 },
  cubic_foot: {
    code: "cubic_foot",
    quoteQuantityBasis: "cy",
    quoteQuantityFactor: 0.03703704,
  },
  gallon: {
    code: "gallon",
    quoteQuantityBasis: "cy",
    quoteQuantityFactor: 0.00495113,
  },
  liter: {
    code: "liter",
    quoteQuantityBasis: "cy",
    quoteQuantityFactor: 0.00130795,
  },
  m3: { code: "m3", quoteQuantityBasis: "cy", quoteQuantityFactor: 1.30795062 },
  load: { code: "load", quoteQuantityBasis: "load", quoteQuantityFactor: 1 },
  bag: { code: "bag", quoteQuantityBasis: "count", quoteQuantityFactor: 1 },
  each: { code: "each", quoteQuantityBasis: "count", quoteQuantityFactor: 1 },
};

function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function roundQuantity(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}
