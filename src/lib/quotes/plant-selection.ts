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
  type QuoteUnitConversion,
  type TruckRateKey,
  type VehicleCapacity,
} from "@/lib/quotes/pricing";
import {
  normalizeTruckingProfile,
  type TruckingProfile,
} from "@/lib/quotes/trucking";

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
  supplier_plants:
    | {
        id: string;
        supplier_id: string;
        name: string;
        latitude: number | null;
        longitude: number | null;
      }
    | {
        id: string;
        supplier_id: string;
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
  truckingProfile: TruckingProfile | null;
};

type YardRecord = {
  id: string;
  name: string;
  latitude: number | null;
  longitude: number | null;
};

type TruckingProfileAssignment = {
  trucking_profile_id: string;
  supplier_id: string | null;
  plant_id: string | null;
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
  unitConversions = [],
  useRequestedPlant = false,
  materialUnitPriceOverride = null,
  truckRateOverride = null,
  materialMinimumOverride = null,
  truckingMinimumOverride = null,
  paymentTerms = null,
  manualRouteDistanceMiles = null,
  manualDeadheadDistanceMiles = null,
  catalogMarkupRules = [],
  mapboxAccessToken = null,
}: {
  supabase: SupabaseClient;
  organizationId: string;
  requestedMaterial: PlantSelectionMaterial;
  jobSite: JobSiteCoordinates;
  quantity: number;
  taxRate: number;
  pricingConfig: PricingConfig;
  vehicleTypes: VehicleCapacity[];
  unitConversions?: QuoteUnitConversion[];
  useRequestedPlant?: boolean;
  materialUnitPriceOverride?: number | null;
  truckRateOverride?: TruckRateKey | null;
  materialMinimumOverride?: number | null;
  truckingMinimumOverride?: number | null;
  paymentTerms?: string | null;
  manualRouteDistanceMiles?: number | null;
  manualDeadheadDistanceMiles?: number | null;
  catalogMarkupRules?: CatalogMarkupRule[];
  mapboxAccessToken?: string | null;
}): Promise<PlantRecommendation> {
  const [
    materialsResult,
    yardsResult,
    multiPitComparisonEnabled,
    autoPlantSelectionEnabled,
    truckingProfilesResult,
    truckingAssignmentsResult,
  ] = await Promise.all([
    supabase
      .from("materials")
      .select(
        "id, supplier_id, supplier_catalog_version_id, supplier_catalog_item_id, catalog_category, name, tier, unit, cost_per_unit, supplier_plants!inner(id, supplier_id, name, latitude, longitude)",
      )
      .eq("organization_id", organizationId)
      .eq("name", requestedMaterial.name)
      .eq("unit", requestedMaterial.unit)
      .eq("tier", requestedMaterial.tier)
      .eq("is_active", true)
      .eq("supplier_plants.is_active", true)
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
      featureName: "multi_pit_comparison",
    }),
    isFeatureEnabled({
      supabase,
      organizationId,
      featureName: "auto_plant_selection",
      defaultValue: true,
    }),
    supabase
      .from("trucking_profiles")
      .select("id, name, average_speed_mph, hourly_rate, round_trip_factor, time_adjustment_bands")
      .eq("organization_id", organizationId)
      .eq("is_active", true),
    supabase
      .from("trucking_profile_assignments")
      .select("trucking_profile_id, supplier_id, plant_id")
      .eq("organization_id", organizationId)
      .eq("is_active", true)
      .returns<TruckingProfileAssignment[]>(),
  ]);

  const truckingProfiles = new Map(
    (truckingProfilesResult.data ?? []).map((profile) => [
      profile.id,
      normalizeTruckingProfile(profile),
    ]),
  );

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
        unitConversions,
        yards: yardsResult.data ?? [],
        useMapbox: Boolean(mapboxAccessToken),
        mapboxAccessToken,
        truckRateOverride,
        paymentTerms,
        manualRouteDistanceMiles,
        manualDeadheadDistanceMiles,
        catalogMarkupRules,
        truckingProfile: resolveTruckingProfile({
          plantId:
            relationOne(material.supplier_plants)?.id ?? material.supplier_id,
          supplierId:
            relationOne(material.supplier_plants)?.supplier_id ?? null,
          profiles: truckingProfiles,
          assignments: truckingAssignmentsResult.data ?? [],
        }),
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
      unitConversions,
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
    unitConversions,
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
  unitConversions,
  yards,
  useMapbox,
  mapboxAccessToken,
  truckRateOverride,
  paymentTerms,
  manualRouteDistanceMiles,
  manualDeadheadDistanceMiles,
  catalogMarkupRules,
  truckingProfile,
}: {
  supabase: SupabaseClient;
  organizationId: string;
  material: PlantSelectionMaterial;
  jobSite: JobSiteCoordinates;
  quantity: number;
  taxRate: number;
  pricingConfig: PricingConfig;
  vehicleTypes: VehicleCapacity[];
  unitConversions: QuoteUnitConversion[];
  yards: YardRecord[];
  useMapbox: boolean;
  mapboxAccessToken: string | null;
  truckRateOverride: TruckRateKey | null;
  paymentTerms: string | null;
  manualRouteDistanceMiles: number | null;
  manualDeadheadDistanceMiles: number | null;
  catalogMarkupRules: CatalogMarkupRule[];
  truckingProfile: TruckingProfile | null;
}): Promise<PlantRecommendation> {
  const supplier = relationOne(material.supplier_plants);
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
          { useMapbox, mapboxAccessToken },
        )
      : manualDistanceEstimate(manualRouteDistanceMiles);
  const deadheadDistance =
    manualDeadheadDistanceMiles === null
      ? await getNearestYardDistance({
          supabase,
          organizationId,
          supplierCoordinates,
          yards,
          useMapbox,
          mapboxAccessToken,
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
    unitConversions,
    routeDurationSeconds: routeDistance?.durationSeconds ?? null,
    routeDistanceMiles: routeDistance?.distanceMiles ?? null,
    deadheadDurationSeconds: deadheadDistance?.durationSeconds ?? null,
    truckingProfile,
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
    truckingProfile,
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
  unitConversions,
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
  unitConversions: QuoteUnitConversion[];
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
      unitConversions,
      routeDurationSeconds: recommendation.routeDistance?.durationSeconds ?? null,
      routeDistanceMiles: recommendation.routeDistance?.distanceMiles ?? null,
      deadheadDurationSeconds:
        recommendation.deadheadDistance?.durationSeconds ?? null,
      truckingProfile: recommendation.truckingProfile,
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

function resolveTruckingProfile({
  plantId,
  supplierId,
  profiles,
  assignments,
}: {
  plantId: string;
  supplierId: string | null;
  profiles: Map<string, TruckingProfile>;
  assignments: TruckingProfileAssignment[];
}): TruckingProfile | null {
  const assignment =
    assignments.find((candidate) => candidate.plant_id === plantId) ??
    assignments.find(
      (candidate) => supplierId !== null && candidate.supplier_id === supplierId,
    ) ??
    assignments.find(
      (candidate) => candidate.plant_id === null && candidate.supplier_id === null,
    );

  return assignment ? profiles.get(assignment.trucking_profile_id) ?? null : null;
}

async function getNearestYardDistance({
  supabase,
  organizationId,
  supplierCoordinates,
  yards,
  useMapbox,
  mapboxAccessToken,
}: {
  supabase: SupabaseClient;
  organizationId: string;
  supplierCoordinates: JobSiteCoordinates;
  yards: YardRecord[];
  useMapbox: boolean;
  mapboxAccessToken: string | null;
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
        { useMapbox, mapboxAccessToken },
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
  const leftRouteMiles = routeMiles(left);
  const rightRouteMiles = routeMiles(right);

  return (
    leftRouteMiles - rightRouteMiles ||
    left.calculation.truckingSubtotal - right.calculation.truckingSubtotal ||
    left.calculation.total - right.calculation.total
  );
}

function routeMiles(recommendation: PlantRecommendation): number {
  return recommendation.routeDistance?.distanceMiles ?? Number.MAX_SAFE_INTEGER;
}

function selectionReason(loadCount: number): string {
  return `Closest available plant wins first; trucking cost and delivered total break ties (${loadCount} load${loadCount === 1 ? "" : "s"}).`;
}

function relationOne<T>(value: T | T[] | null): T | null {
  return Array.isArray(value) ? (value[0] ?? null) : value;
}
