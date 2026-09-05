export type TruckingProfile = {
  id: string;
  name: string;
  averageSpeedMph: number;
  hourlyRate: number;
  roundTripFactor: number;
  loadingUnloadingHours: number;
  truckCapacity: number;
};

export type TruckingRecommendation = {
  oneWayMiles: number;
  roundTripMiles: number;
  averageSpeedMph: number;
  baseTravelHours: number;
  loadingUnloadingHours: number;
  totalHours: number;
  hourlyRate: number;
  truckCapacity: number;
  costPerLoad: number;
  ratePerCapacityUnit: number;
  loadCount: number;
  subtotal: number;
};

export function calculateTruckingRecommendation({
  oneWayMiles,
  loadCount,
  profile,
}: {
  oneWayMiles: number;
  loadCount: number;
  profile: TruckingProfile;
}): TruckingRecommendation {
  const safeMiles = requireNonNegativeFinite(oneWayMiles, "one-way miles");
  const safeCapacity = requirePositiveFinite(profile.truckCapacity, "truck capacity");
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
  const loadingUnloadingHours = requireNonNegativeFinite(
    profile.loadingUnloadingHours,
    "loading/unloading hours",
  );
  const totalHours = baseTravelHours + loadingUnloadingHours;
  const costPerLoad = totalHours * hourlyRate;

  return {
    oneWayMiles: roundQuantity(safeMiles),
    roundTripMiles: roundQuantity(roundTripMiles),
    averageSpeedMph: roundQuantity(averageSpeedMph),
    baseTravelHours: roundQuantity(baseTravelHours),
    loadingUnloadingHours: roundQuantity(loadingUnloadingHours),
    totalHours: roundQuantity(totalHours),
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
  loading_unloading_hours: number;
  truck_capacity: number;
}): TruckingProfile {
  return {
    id: record.id,
    name: record.name,
    averageSpeedMph: Number(record.average_speed_mph),
    hourlyRate: Number(record.hourly_rate),
    roundTripFactor: Number(record.round_trip_factor),
    loadingUnloadingHours: Number(record.loading_unloading_hours),
    truckCapacity: Number(record.truck_capacity),
  };
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
