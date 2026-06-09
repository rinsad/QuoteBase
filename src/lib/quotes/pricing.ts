export type MaterialTier = "R1" | "R2" | "R3" | "R4";
export type TruckRateKey = "floor" | "standard" | "target" | "premium" | "stretch";

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
};

export type VehicleCapacity = {
  id: string;
  name: string;
  capacity_tons: number;
  capacity_cy: number | null;
};

export type QuoteDraftCalculationInput = {
  costPerUnit: number;
  quantity: number;
  tier: MaterialTier;
  unit: string;
  taxRate: number;
  pricingConfig: PricingConfig;
  vehicleTypes?: VehicleCapacity[];
  routeDurationSeconds?: number | null;
  deadheadDurationSeconds?: number | null;
  materialUnitPriceOverride?: number | null;
  truckRateOverride?: TruckRateKey | null;
  materialMinimumOverride?: number | null;
  truckingMinimumOverride?: number | null;
  applyMaterialMinimum?: boolean;
  paymentTerms?: string | null;
  applyCreditCardSurcharge?: boolean;
};

export type QuoteDraftCalculation = {
  markupPerUnit: number;
  markupPct: number;
  materialUnitPrice: number;
  materialSubtotal: number;
  vehicleTypeId: string | null;
  vehicleName: string | null;
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
  routeDurationSeconds = null,
  deadheadDurationSeconds = null,
  materialUnitPriceOverride = null,
  truckRateOverride = null,
  materialMinimumOverride = null,
  truckingMinimumOverride = null,
  applyMaterialMinimum = true,
  paymentTerms = null,
  applyCreditCardSurcharge = true,
}: QuoteDraftCalculationInput): QuoteDraftCalculation {
  const markupPerUnit = getTierMarkupPerUnit(tier, pricingConfig);
  const truckRateKey = getTruckRateKey(pricingConfig, truckRateOverride);
  const truckHourlyRate = getTruckHourlyRate(pricingConfig, truckRateKey);
  const overheadPerUnit = unit === "ton" ? pricingConfig.overhead_per_ton : 0;
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
  const vehiclePlan = chooseVehiclePlan({ quantity, unit, vehicleTypes });
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
    materialUnitPrice: roundMoney(materialUnitPrice),
    materialSubtotal: roundMoney(materialSubtotal),
    vehicleTypeId: vehiclePlan.vehicleTypeId,
    vehicleName: vehiclePlan.vehicleName,
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
  return /\bcod\b/i.test(paymentTerms ?? "");
}

function chooseVehiclePlan({
  quantity,
  unit,
  vehicleTypes,
}: {
  quantity: number;
  unit: string;
  vehicleTypes: VehicleCapacity[];
}): {
  vehicleTypeId: string | null;
  vehicleName: string | null;
  loadCount: number;
} {
  if (unit === "load") {
    return {
      vehicleTypeId: null,
      vehicleName: null,
      loadCount: Math.max(1, Math.ceil(quantity)),
    };
  }

  const compatibleVehicles = vehicleTypes
    .map((vehicle) => ({
      ...vehicle,
      capacity:
        unit === "cy"
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
      loadCount: 1,
    };
  }

  return {
    vehicleTypeId: selected.id,
    vehicleName: selected.name,
    loadCount: Math.max(1, Math.ceil(quantity / selected.capacity)),
  };
}

function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function roundQuantity(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}
