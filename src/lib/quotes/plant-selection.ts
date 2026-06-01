import type { SupabaseClient } from "@supabase/supabase-js";

import {
  estimateAndCacheDistance,
  type DistanceEstimate,
} from "@/lib/geo/distance";
import {
  calculateQuoteDraft,
  type MaterialTier,
  type PricingConfig,
  type QuoteDraftCalculation,
  type VehicleCapacity,
} from "@/lib/quotes/pricing";

export type PlantSelectionMaterial = {
  id: string;
  supplier_id: string;
  name: string;
  tier: MaterialTier;
  unit: string;
  cost_per_unit: number;
  suppliers:
    | {
        name: string;
        latitude: number | null;
        longitude: number | null;
      }
    | {
        name: string;
        latitude: number | null;
        longitude: number | null;
      }[]
    | null;
};

export type JobSiteCoordinates = {
  latitude: number | null;
  longitude: number | null;
};

export type PlantRecommendation = {
  material: PlantSelectionMaterial;
  supplierName: string;
  calculation: QuoteDraftCalculation;
  routeDistance: DistanceEstimate | null;
  deadheadDistance: DistanceEstimate | null;
  selectionReason: string;
};

type YardRecord = {
  id: string;
  name: string;
  latitude: number | null;
  longitude: number | null;
};

export async function selectBestPlantForQuote({
  supabase,
  organizationId,
  requestedMaterial,
  jobSite,
  quantity,
  taxRate,
  pricingConfig,
  vehicleTypes,
}: {
  supabase: SupabaseClient;
  organizationId: string;
  requestedMaterial: PlantSelectionMaterial;
  jobSite: JobSiteCoordinates;
  quantity: number;
  taxRate: number;
  pricingConfig: PricingConfig;
  vehicleTypes: VehicleCapacity[];
}): Promise<PlantRecommendation> {
  const [materialsResult, yardsResult, mapsFlagResult] = await Promise.all([
    supabase
      .from("materials")
      .select(
        "id, supplier_id, name, tier, unit, cost_per_unit, suppliers(name, latitude, longitude)",
      )
      .eq("organization_id", organizationId)
      .eq("name", requestedMaterial.name)
      .eq("unit", requestedMaterial.unit)
      .eq("tier", requestedMaterial.tier)
      .eq("is_active", true)
      .returns<PlantSelectionMaterial[]>(),
    supabase
      .from("yards")
      .select("id, name, latitude, longitude")
      .eq("organization_id", organizationId)
      .eq("is_active", true)
      .returns<YardRecord[]>(),
    supabase
      .from("feature_flags")
      .select("is_enabled")
      .eq("organization_id", organizationId)
      .eq("feature_name", "google_maps_distance_api")
      .single<{ is_enabled: boolean }>(),
  ]);
  const googleMapsEnabled = mapsFlagResult.data?.is_enabled ?? false;

  const candidates = materialsResult.data?.length
    ? materialsResult.data
    : [requestedMaterial];
  const recommendations = await Promise.all(
    candidates.map(async (material) =>
      buildRecommendation({
        supabase,
        organizationId,
        material,
        jobSite,
        quantity,
        taxRate,
        pricingConfig,
        vehicleTypes,
        yards: yardsResult.data ?? [],
        useGoogleMaps: googleMapsEnabled,
      }),
    ),
  );

  return recommendations.sort(compareRecommendations)[0];
}

async function buildRecommendation({
  supabase,
  organizationId,
  material,
  jobSite,
  quantity,
  taxRate,
  pricingConfig,
  vehicleTypes,
  yards,
  useGoogleMaps,
}: {
  supabase: SupabaseClient;
  organizationId: string;
  material: PlantSelectionMaterial;
  jobSite: JobSiteCoordinates;
  quantity: number;
  taxRate: number;
  pricingConfig: PricingConfig;
  vehicleTypes: VehicleCapacity[];
  yards: YardRecord[];
  useGoogleMaps: boolean;
}): Promise<PlantRecommendation> {
  const supplier = relationOne(material.suppliers);
  const supplierCoordinates = {
    latitude:
      supplier?.latitude === null || supplier?.latitude === undefined
        ? null
        : Number(supplier.latitude),
    longitude:
      supplier?.longitude === null || supplier?.longitude === undefined
        ? null
        : Number(supplier.longitude),
  };
  const routeDistance = await estimateAndCacheDistance(
    supabase,
    organizationId,
    supplierCoordinates,
    jobSite,
    { useGoogleMaps },
  );
  const deadheadDistance = await getNearestYardDistance({
    supabase,
    organizationId,
    supplierCoordinates,
    yards,
    useGoogleMaps,
  });
  const calculation = calculateQuoteDraft({
    costPerUnit: Number(material.cost_per_unit),
    quantity,
    tier: material.tier,
    unit: material.unit,
    taxRate,
    pricingConfig,
    vehicleTypes,
  });

  return {
    material,
    supplierName: supplier?.name ?? "Unknown supplier",
    calculation,
    routeDistance,
    deadheadDistance,
    selectionReason: selectionReason(calculation.loadCount),
  };
}

async function getNearestYardDistance({
  supabase,
  organizationId,
  supplierCoordinates,
  yards,
  useGoogleMaps,
}: {
  supabase: SupabaseClient;
  organizationId: string;
  supplierCoordinates: JobSiteCoordinates;
  yards: YardRecord[];
  useGoogleMaps: boolean;
}): Promise<DistanceEstimate | null> {
  const distances = await Promise.all(
    yards.map((yard) =>
      estimateAndCacheDistance(
        supabase,
        organizationId,
        {
          latitude: yard.latitude === null ? null : Number(yard.latitude),
          longitude: yard.longitude === null ? null : Number(yard.longitude),
        },
        supplierCoordinates,
        { useGoogleMaps },
      ),
    ),
  );

  return distances
    .filter((distance): distance is DistanceEstimate => Boolean(distance))
    .sort((a, b) => a.distanceMiles - b.distanceMiles)[0] ?? null;
}

function compareRecommendations(
  left: PlantRecommendation,
  right: PlantRecommendation,
): number {
  const loads = Math.max(left.calculation.loadCount, right.calculation.loadCount);
  const leftRouteMiles = routeMiles(left);
  const rightRouteMiles = routeMiles(right);

  if (loads <= 1) {
    return (
      leftRouteMiles - rightRouteMiles ||
      left.calculation.total - right.calculation.total
    );
  }

  if (loads <= 3) {
    return (
      left.calculation.total - right.calculation.total ||
      leftRouteMiles - rightRouteMiles
    );
  }

  return (
    left.calculation.materialSubtotal - right.calculation.materialSubtotal ||
    left.calculation.total - right.calculation.total ||
    leftRouteMiles - rightRouteMiles
  );
}

function routeMiles(recommendation: PlantRecommendation): number {
  return (
    (recommendation.routeDistance?.distanceMiles ?? Number.MAX_SAFE_INTEGER) +
    (recommendation.deadheadDistance?.distanceMiles ?? 0)
  );
}

function selectionReason(loadCount: number): string {
  if (loadCount <= 1) {
    return "1-load rule: shortest supplier route wins, with quote total as tie-breaker.";
  }

  if (loadCount <= 3) {
    return "2-3 load rule: quote total wins, with route distance as tie-breaker.";
  }

  return "4+ load rule: material subtotal wins, with total and route distance as tie-breakers.";
}

function relationOne<T>(value: T | T[] | null): T | null {
  return Array.isArray(value) ? (value[0] ?? null) : value;
}
