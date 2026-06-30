import type { SupabaseClient } from "@supabase/supabase-js";

import {
  estimateAndCacheDistance,
  type DistanceEstimate,
} from "@/lib/geo/distance";
import { isFeatureEnabled } from "@/lib/features/flags";
import {
  calculateQuoteDraft,
  resolveCatalogMarkupRule,
  type CatalogMarkupRule,
  type MaterialTier,
  type PricingConfig,
  type QuoteDraftCalculation,
  type TruckRateKey,
  type VehicleCapacity,
} from "@/lib/quotes/pricing";

export type PlantSelectionMaterial = {
  id: string;
  supplier_id: string;
  supplier_catalog_version_id: string | null;
  supplier_catalog_item_id: string | null;
  catalog_category: string | null;
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

const SMALL_QUOTE_MATERIAL_WEIGHT = 0.55;
const SMALL_QUOTE_TRUCKING_WEIGHT = 0.45;

export async function selectBestPlantForQuote({
  supabase,
  organizationId,
  requestedMaterial,
  jobSite,
  quantity,
  taxRate,
  pricingConfig,
  vehicleTypes,
  useRequestedPlant = false,
  materialUnitPriceOverride = null,
  truckRateOverride = null,
  materialMinimumOverride = null,
  truckingMinimumOverride = null,
  paymentTerms = null,
  manualRouteDistanceMiles = null,
  manualDeadheadDistanceMiles = null,
  catalogMarkupRules = [],
  googleMapsApiKey = null,
}: {
  supabase: SupabaseClient;
  organizationId: string;
  requestedMaterial: PlantSelectionMaterial;
  jobSite: JobSiteCoordinates;
  quantity: number;
  taxRate: number;
  pricingConfig: PricingConfig;
  vehicleTypes: VehicleCapacity[];
  useRequestedPlant?: boolean;
  materialUnitPriceOverride?: number | null;
  truckRateOverride?: TruckRateKey | null;
  materialMinimumOverride?: number | null;
  truckingMinimumOverride?: number | null;
  paymentTerms?: string | null;
  manualRouteDistanceMiles?: number | null;
  manualDeadheadDistanceMiles?: number | null;
  catalogMarkupRules?: CatalogMarkupRule[];
  googleMapsApiKey?: string | null;
}): Promise<PlantRecommendation> {
  const [
    materialsResult,
    yardsResult,
    googleMapsEnabled,
    multiPitComparisonEnabled,
    autoPlantSelectionEnabled,
  ] = await Promise.all([
    supabase
      .from("materials")
      .select(
        "id, supplier_id, supplier_catalog_version_id, supplier_catalog_item_id, catalog_category, name, tier, unit, cost_per_unit, suppliers!inner(name, latitude, longitude)",
      )
      .eq("organization_id", organizationId)
      .eq("name", requestedMaterial.name)
      .eq("unit", requestedMaterial.unit)
      .eq("tier", requestedMaterial.tier)
      .eq("is_active", true)
      .eq("suppliers.is_active", true)
      .returns<PlantSelectionMaterial[]>(),
    supabase
      .from("yards")
      .select("id, name, latitude, longitude")
      .eq("organization_id", organizationId)
      .eq("is_active", true)
      .returns<YardRecord[]>(),
    isFeatureEnabled({
      supabase,
      organizationId,
      featureName: "google_maps_distance_api",
    }),
    isFeatureEnabled({
      supabase,
      organizationId,
      featureName: "multi_pit_comparison",
    }),
    isFeatureEnabled({
      supabase,
      organizationId,
      featureName: "auto_plant_selection",
      defaultValue: true,
    }),
  ]);

  const candidates = multiPitComparisonEnabled && materialsResult.data?.length
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
        googleMapsApiKey,
        truckRateOverride,
        paymentTerms,
        manualRouteDistanceMiles,
        manualDeadheadDistanceMiles,
        catalogMarkupRules,
      }),
    ),
  );

  const sortedRecommendations = recommendations.sort(compareRecommendations);

  if (useRequestedPlant || !autoPlantSelectionEnabled) {
    const selected =
      sortedRecommendations.find(
        (recommendation) => recommendation.material.id === requestedMaterial.id,
      ) ?? sortedRecommendations[0];

    return applyMaterialUnitPriceOverride({
      recommendation: selected,
      quantity,
      taxRate,
      pricingConfig,
      vehicleTypes,
      materialUnitPriceOverride,
      truckRateOverride,
      materialMinimumOverride,
      truckingMinimumOverride,
      paymentTerms,
      catalogMarkupRules,
    });
  }

  return applyMaterialUnitPriceOverride({
    recommendation: sortedRecommendations[0],
    quantity,
    taxRate,
    pricingConfig,
    vehicleTypes,
    materialUnitPriceOverride,
    truckRateOverride,
    materialMinimumOverride,
    truckingMinimumOverride,
    paymentTerms,
    catalogMarkupRules,
  });
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
  googleMapsApiKey,
  truckRateOverride,
  paymentTerms,
  manualRouteDistanceMiles,
  manualDeadheadDistanceMiles,
  catalogMarkupRules,
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
  googleMapsApiKey: string | null;
  truckRateOverride: TruckRateKey | null;
  paymentTerms: string | null;
  manualRouteDistanceMiles: number | null;
  manualDeadheadDistanceMiles: number | null;
  catalogMarkupRules: CatalogMarkupRule[];
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
  const routeDistance =
    manualRouteDistanceMiles === null
      ? await estimateAndCacheDistance(
          supabase,
          organizationId,
          supplierCoordinates,
          jobSite,
          { useGoogleMaps, googleMapsApiKey },
        )
      : manualDistanceEstimate(manualRouteDistanceMiles);
  const deadheadDistance =
    manualDeadheadDistanceMiles === null
      ? await getNearestYardDistance({
          supabase,
          organizationId,
          supplierCoordinates,
          yards,
          useGoogleMaps,
          googleMapsApiKey,
        })
      : manualDistanceEstimate(manualDeadheadDistanceMiles);
  const calculation = calculateQuoteDraft({
    costPerUnit: Number(material.cost_per_unit),
    quantity,
    tier: material.tier,
    unit: material.unit,
    taxRate,
    pricingConfig,
    vehicleTypes,
    routeDurationSeconds: routeDistance?.durationSeconds ?? null,
    deadheadDurationSeconds: deadheadDistance?.durationSeconds ?? null,
    truckRateOverride,
    paymentTerms,
    catalogMarkupRule: resolveCatalogMarkupRule(material, catalogMarkupRules),
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

function manualDistanceEstimate(distanceMiles: number): DistanceEstimate {
  return {
    distanceMiles,
    durationSeconds: Math.round((distanceMiles / 35) * 3600),
    source: "estimate",
  };
}

function applyMaterialUnitPriceOverride({
  recommendation,
  quantity,
  taxRate,
  pricingConfig,
  vehicleTypes,
  materialUnitPriceOverride,
  truckRateOverride,
  materialMinimumOverride,
  truckingMinimumOverride,
  paymentTerms,
  catalogMarkupRules,
}: {
  recommendation: PlantRecommendation;
  quantity: number;
  taxRate: number;
  pricingConfig: PricingConfig;
  vehicleTypes: VehicleCapacity[];
  materialUnitPriceOverride: number | null;
  truckRateOverride: TruckRateKey | null;
  materialMinimumOverride: number | null;
  truckingMinimumOverride: number | null;
  paymentTerms: string | null;
  catalogMarkupRules: CatalogMarkupRule[];
}): PlantRecommendation {
  if (
    materialUnitPriceOverride === null &&
    truckRateOverride === null &&
    materialMinimumOverride === null &&
    truckingMinimumOverride === null
  ) {
    return recommendation;
  }

  return {
    ...recommendation,
    calculation: calculateQuoteDraft({
      costPerUnit: Number(recommendation.material.cost_per_unit),
      quantity,
      tier: recommendation.material.tier,
      unit: recommendation.material.unit,
      taxRate,
      pricingConfig,
      vehicleTypes,
      routeDurationSeconds: recommendation.routeDistance?.durationSeconds ?? null,
      deadheadDurationSeconds:
        recommendation.deadheadDistance?.durationSeconds ?? null,
      materialUnitPriceOverride,
      truckRateOverride,
      materialMinimumOverride,
      truckingMinimumOverride,
      paymentTerms,
      catalogMarkupRule: resolveCatalogMarkupRule(
        recommendation.material,
        catalogMarkupRules,
      ),
    }),
  };
}

async function getNearestYardDistance({
  supabase,
  organizationId,
  supplierCoordinates,
  yards,
  useGoogleMaps,
  googleMapsApiKey,
}: {
  supabase: SupabaseClient;
  organizationId: string;
  supplierCoordinates: JobSiteCoordinates;
  yards: YardRecord[];
  useGoogleMaps: boolean;
  googleMapsApiKey: string | null;
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
        { useGoogleMaps, googleMapsApiKey },
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
      deliveredCost(left) - deliveredCost(right) ||
      leftRouteMiles - rightRouteMiles
    );
  }

  if (loads <= 3) {
    return (
      smallQuoteScore(left) - smallQuoteScore(right) ||
      deliveredCost(left) - deliveredCost(right) ||
      leftRouteMiles - rightRouteMiles
    );
  }

  return (
    left.calculation.materialSubtotal - right.calculation.materialSubtotal ||
    left.calculation.total - right.calculation.total ||
    leftRouteMiles - rightRouteMiles
  );
}

function deliveredCost(recommendation: PlantRecommendation): number {
  return recommendation.calculation.total;
}

function smallQuoteScore(recommendation: PlantRecommendation): number {
  return (
    recommendation.calculation.materialSubtotal * SMALL_QUOTE_MATERIAL_WEIGHT +
    recommendation.calculation.truckingSubtotal * SMALL_QUOTE_TRUCKING_WEIGHT
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
    return "Zone 1: lowest delivered total wins, including round-trip trucking and nearest-yard deadhead.";
  }

  if (loadCount <= 3) {
    return "Zone 2: weighted material and trucking economics win, with delivered total and route distance as tie-breakers.";
  }

  return "Zone 3: material economics win, with delivered total and route distance as tie-breakers.";
}

function relationOne<T>(value: T | T[] | null): T | null {
  return Array.isArray(value) ? (value[0] ?? null) : value;
}
