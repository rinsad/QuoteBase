export type TruckingTimeAdjustmentBand = {
  underMiles: number;
  hours: number;
};

export type TruckingProfile = {
  id: string;
  name: string;
  averageSpeedMph: number;
  hourlyRate: number;
  roundTripFactor: number;
  timeAdjustmentBands: TruckingTimeAdjustmentBand[];
};

export type TruckingRecommendation = {
  oneWayMiles: number;
  roundTripMiles: number;
  averageSpeedMph: number;
  baseTravelHours: number;
  timeAdjustmentHours: number;
  adjustedTravelHours: number;
  hourlyRate: number;
  truckCapacity: number;
  costPerLoad: number;
  ratePerCapacityUnit: number;
  loadCount: number;
  subtotal: number;
};

export function calculateTruckingRecommendation({
  oneWayMiles,
  truckCapacity,
  loadCount,
  profile,
}: {
  oneWayMiles: number;
  truckCapacity: number;
  loadCount: number;
  profile: TruckingProfile;
}): TruckingRecommendation {
  const safeMiles = requireNonNegativeFinite(oneWayMiles, "one-way miles");
  const safeCapacity = requirePositiveFinite(truckCapacity, "truck capacity");
  const safeLoadCount = requirePositiveFinite(loadCount, "load count");
  const averageSpeedMph = requirePositiveFinite(
    profile.averageSpeedMph,
    "average speed",
  );
  const roundTripFactor = requirePositiveFinite(
    profile.roundTripFactor,
    "round-trip factor",
  );
  const hourlyRate = requireNonNegativeFinite(profile.hourlyRate, "hourly rate");
  const roundTripMiles = safeMiles * roundTripFactor;
  const baseTravelHours = roundTripMiles / averageSpeedMph;
  const timeAdjustmentHours = resolveTimeAdjustment(
    safeMiles,
    profile.timeAdjustmentBands,
  );
  const adjustedTravelHours = baseTravelHours + timeAdjustmentHours;
  const costPerLoad = adjustedTravelHours * hourlyRate;

  return {
    oneWayMiles: roundQuantity(safeMiles),
    roundTripMiles: roundQuantity(roundTripMiles),
    averageSpeedMph: roundQuantity(averageSpeedMph),
    baseTravelHours: roundQuantity(baseTravelHours),
    timeAdjustmentHours: roundQuantity(timeAdjustmentHours),
    adjustedTravelHours: roundQuantity(adjustedTravelHours),
    hourlyRate: roundMoney(hourlyRate),
    truckCapacity: roundQuantity(safeCapacity),
    costPerLoad: roundMoney(costPerLoad),
    ratePerCapacityUnit: roundMoney(costPerLoad / safeCapacity),
    loadCount: roundQuantity(safeLoadCount),
    subtotal: roundMoney(costPerLoad * safeLoadCount),
  };
}

export function normalizeTruckingProfile(record: {
  id: string;
  name: string;
  average_speed_mph: number;
  hourly_rate: number;
  round_trip_factor: number;
  time_adjustment_bands: unknown;
}): TruckingProfile {
  return {
    id: record.id,
    name: record.name,
    averageSpeedMph: Number(record.average_speed_mph),
    hourlyRate: Number(record.hourly_rate),
    roundTripFactor: Number(record.round_trip_factor),
    timeAdjustmentBands: normalizeTimeAdjustmentBands(
      record.time_adjustment_bands,
    ),
  };
}

export function normalizeTimeAdjustmentBands(
  value: unknown,
): TruckingTimeAdjustmentBand[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((band) => {
      if (!band || typeof band !== "object") {
        return null;
      }

      const source = band as Record<string, unknown>;
      const underMiles = Number(source.under_miles ?? source.underMiles);
      const hours = Number(source.hours);

      return Number.isFinite(underMiles) &&
        underMiles > 0 &&
        Number.isFinite(hours) &&
        hours >= 0
        ? { underMiles, hours }
        : null;
    })
    .filter((band): band is TruckingTimeAdjustmentBand => band !== null)
    .sort((left, right) => left.underMiles - right.underMiles);
}

function resolveTimeAdjustment(
  oneWayMiles: number,
  bands: TruckingTimeAdjustmentBand[],
): number {
  return bands.find((band) => oneWayMiles < band.underMiles)?.hours ?? 0;
}

function requirePositiveFinite(value: number, label: string): number {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${label} must be greater than zero.`);
  }

  return value;
}

function requireNonNegativeFinite(value: number, label: string): number {
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`${label} must be zero or greater.`);
  }

  return value;
}

function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function roundQuantity(value: number): number {
  return Math.round((value + Number.EPSILON) * 10000) / 10000;
}
