export type MaterialTier = "R1" | "R2" | "R3" | "R4";
export type TruckRateKey = "floor" | "standard" | "target" | "premium" | "stretch";

export type QuoteProjectStatusOption = {
  value: string;
  label: string;
};

export type PricingConfig = {
  default_material_markup_pct: number;
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
  big_quote_threshold?: number;
  default_followup_max_attempts?: number;
  jobs_starting_soon_days?: number;
  follow_up_auto_send_enabled?: boolean;
  follow_up_sms_enabled?: boolean;
  project_status_options?: QuoteProjectStatusOption[];
  quote_recommendation_count?: number;
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
  unitConversions?: QuoteUnitConversion[];
  routeDurationSeconds?: number | null;
  routeDistanceMiles?: number | null;
  deadheadDurationSeconds?: number | null;
  truckingProfile?: TruckingProfile | null;
  materialUnitPriceOverride?: number | null;
  markupPctOverride?: number | null;
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
  markupSource: "default" | "quote_override";
  markupRuleId: string | null;
  materialUnitPrice: number;
  materialSubtotal: number;
  grossMarginPct: number | null;
  marginFloorPct: number | null;
  marginFloorWarning: boolean;
  quoteQuantityBasis: QuoteQuantityBasis;
  quoteQuantityFactor: number | null;
  truckCapacityQuantity: number;
  loadCount: number;
  truckingRatePerUnit: number;
  truckingRateKey: TruckRateKey;
  truckingHourlyRate: number;
  truckingProfileId: string | null;
  truckingProfileName: string | null;
  truckingRecommendation: TruckingRecommendation | null;
  truckingSubtotal: number;
  feesSubtotal: number;
  taxTotal: number;
  total: number;
};

export function calculateQuoteDraft({
  costPerUnit,
  quantity,
  unit,
  taxRate,
  pricingConfig,
  unitConversions = [],
  routeDurationSeconds = null,
  routeDistanceMiles = null,
  deadheadDurationSeconds = null,
  truckingProfile = null,
  materialUnitPriceOverride = null,
  markupPctOverride = null,
  truckRateOverride = null,
  materialMinimumOverride = null,
  truckingMinimumOverride = null,
  applyMaterialMinimum = true,
  paymentTerms = null,
  applyCreditCardSurcharge = true,
}: QuoteDraftCalculationInput): QuoteDraftCalculation {
  const effectiveMarkupPct = markupPctOverride !== null && Number.isFinite(markupPctOverride)
    ? Math.max(0, markupPctOverride)
    : pricingConfig.default_material_markup_pct;
  const isMarkupOverride = markupPctOverride !== null && effectiveMarkupPct !== pricingConfig.default_material_markup_pct;
  const markupPerUnit = costPerUnit * (effectiveMarkupPct / 100);
  const truckRateKey = getTruckRateKey(pricingConfig, truckRateOverride);
  const truckHourlyRate = getTruckHourlyRate(pricingConfig, truckRateKey);
  const unitConversion = resolveUnitConversion(unit, unitConversions);
  const suggestedMaterialUnitPrice = costPerUnit + markupPerUnit;
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
  const marginFloorPct = null;
  const marginFloorWarning = false;
  const loadPlan = chooseLoadPlan({
    quantity,
    unitConversion,
    truckingProfile,
  });
  const routeSeconds =
    routeDurationSeconds === null ? null : Math.max(0, routeDurationSeconds);
  const deadheadSeconds =
    deadheadDurationSeconds === null ? 0 : Math.max(0, deadheadDurationSeconds);
  const roundTripSeconds =
    routeSeconds === null ? null : routeSeconds * 2 + deadheadSeconds;
  const truckingRecommendation =
    truckingProfile && routeDistanceMiles !== null
      ? calculateTruckingRecommendation({
          oneWayMiles: Math.max(0, routeDistanceMiles),
          loadCount: loadPlan.loadCount,
          profile: truckingProfile,
        })
      : null;
  const effectiveTruckHourlyRate =
    truckingRecommendation?.hourlyRate ?? truckHourlyRate;
  const rawTruckingSubtotal =
    truckingRecommendation?.subtotal ??
    (roundTripSeconds === null
      ? effectiveTruckHourlyRate * loadPlan.loadCount
      : effectiveTruckHourlyRate * (roundTripSeconds / 3600) * loadPlan.loadCount);
  const truckingMinimum = resolveMinimumOverride(
    truckingMinimumOverride,
    pricingConfig.trucking_minimum ?? 0,
  );
  const truckingSubtotal = truckingRecommendation
    ? rawTruckingSubtotal
    : Math.max(rawTruckingSubtotal, truckingMinimum * loadPlan.loadCount);
  const truckingRatePerUnit = quantity > 0 ? truckingSubtotal / quantity : 0;
  const loadFeesSubtotal =
    (pricingConfig.fuel_surcharge_per_load +
      pricingConfig.environmental_fee_per_load) *
    loadPlan.loadCount;
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
    markupPct: roundMoney(effectiveMarkupPct),
    markupSource: isMarkupOverride ? "quote_override" : "default",
    markupRuleId: null,
    materialUnitPrice: roundMoney(materialUnitPrice),
    materialSubtotal: roundMoney(materialSubtotal),
    grossMarginPct:
      grossMarginPct === null
        ? null
        : Math.round((grossMarginPct + Number.EPSILON) * 10) / 10,
    marginFloorPct,
    marginFloorWarning,
    quoteQuantityBasis: unitConversion.quoteQuantityBasis,
    quoteQuantityFactor: unitConversion.quoteQuantityFactor,
    truckCapacityQuantity: roundQuantity(loadPlan.truckCapacityQuantity),
    loadCount: roundQuantity(loadPlan.loadCount),
    truckingRatePerUnit: roundMoney(truckingRatePerUnit),
    truckingRateKey: truckRateKey,
    truckingHourlyRate: roundMoney(effectiveTruckHourlyRate),
    truckingProfileId: truckingProfile?.id ?? null,
    truckingProfileName: truckingProfile?.name ?? null,
    truckingRecommendation,
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

function chooseLoadPlan({
  quantity,
  unitConversion,
  truckingProfile,
}: {
  quantity: number;
  unitConversion: QuoteUnitConversion;
  truckingProfile: TruckingProfile | null;
}): {
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
      truckCapacityQuantity: Math.max(convertedQuantity, 1),
      loadCount: Math.max(1, Math.ceil(convertedQuantity)),
    };
  }

  if (unitConversion.quoteQuantityBasis === "none") {
    return {
      truckCapacityQuantity: Math.max(convertedQuantity, 1),
      loadCount: 1,
    };
  }

  const capacity = Number(truckingProfile?.truckCapacity ?? 0);
  if (!Number.isFinite(capacity) || capacity <= 0) {
    return {
      truckCapacityQuantity: Math.max(convertedQuantity, 1),
      loadCount: 1,
    };
  }

  return {
    truckCapacityQuantity: capacity,
    loadCount: Math.max(1, Math.ceil(convertedQuantity / capacity)),
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
import {
  calculateTruckingRecommendation,
  type TruckingProfile,
  type TruckingRecommendation,
} from "@/lib/quotes/trucking";
