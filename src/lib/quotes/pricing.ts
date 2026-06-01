export type MaterialTier = "R1" | "R2" | "R3" | "R4";

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
};

export type QuoteDraftCalculation = {
  markupPct: number;
  materialUnitPrice: number;
  materialSubtotal: number;
  vehicleTypeId: string | null;
  vehicleName: string | null;
  loadCount: number;
  truckingRatePerUnit: number;
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
}: QuoteDraftCalculationInput): QuoteDraftCalculation {
  const markupPct = getTierMarkupPct(tier, pricingConfig);
  const truckRatePerLoad = getDefaultTruckRate(pricingConfig);
  const overheadPerUnit = unit === "ton" ? pricingConfig.overhead_per_ton : 0;
  const materialUnitPrice = costPerUnit * (1 + markupPct / 100) + overheadPerUnit;
  const materialSubtotal = Math.max(
    materialUnitPrice * quantity,
    pricingConfig.material_minimum ?? 0,
  );
  const vehiclePlan = chooseVehiclePlan({ quantity, unit, vehicleTypes });
  const rawTruckingSubtotal = truckRatePerLoad * vehiclePlan.loadCount;
  const truckingSubtotal = Math.max(
    rawTruckingSubtotal,
    pricingConfig.trucking_minimum ?? 0,
  );
  const truckingRatePerUnit = quantity > 0 ? truckingSubtotal / quantity : 0;
  const feesSubtotal =
    (pricingConfig.fuel_surcharge_per_load +
      pricingConfig.environmental_fee_per_load) *
    vehiclePlan.loadCount;
  const taxableSubtotal = materialSubtotal + truckingSubtotal + feesSubtotal;
  const taxTotal = taxableSubtotal * taxRate;

  return {
    markupPct: roundMoney(markupPct),
    materialUnitPrice: roundMoney(materialUnitPrice),
    materialSubtotal: roundMoney(materialSubtotal),
    vehicleTypeId: vehiclePlan.vehicleTypeId,
    vehicleName: vehiclePlan.vehicleName,
    loadCount: roundQuantity(vehiclePlan.loadCount),
    truckingRatePerUnit: roundMoney(truckingRatePerUnit),
    truckingSubtotal: roundMoney(truckingSubtotal),
    feesSubtotal: roundMoney(feesSubtotal),
    taxTotal: roundMoney(taxTotal),
    total: roundMoney(taxableSubtotal + taxTotal),
  };
}

function getTierMarkupPct(
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

function getDefaultTruckRate(pricingConfig: PricingConfig): number {
  const rates: Record<string, number> = {
    floor: pricingConfig.truck_floor_rate,
    standard: pricingConfig.truck_standard_rate,
    target: pricingConfig.truck_target_rate,
    premium: pricingConfig.truck_premium_rate,
    stretch: pricingConfig.truck_stretch_rate,
  };

  return rates[pricingConfig.default_truck_rate] ?? pricingConfig.truck_target_rate;
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
