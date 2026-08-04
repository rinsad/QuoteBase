import type { SupabaseClient } from "@supabase/supabase-js";

export type Coordinate = {
  latitude: number | null;
  longitude: number | null;
};

export type DistanceEstimate = {
  distanceMiles: number;
  durationSeconds: number;
  source: "cache" | "mapbox" | "estimate";
};

type ResolvedCoordinate = {
  latitude: number;
  longitude: number;
};

const EARTH_RADIUS_MILES = 3958.8;
const AVERAGE_TRUCK_SPEED_MPH = 35;
const METERS_PER_MILE = 1609.344;
const CACHE_TTL_DAYS = 30;

export async function estimateAndCacheDistance(
  supabase: SupabaseClient,
  organizationId: string,
  origin: Coordinate,
  destination: Coordinate,
  options: { useMapbox?: boolean; mapboxAccessToken?: string | null } = {},
): Promise<DistanceEstimate | null> {
  if (
    origin.latitude === null ||
    origin.longitude === null ||
    destination.latitude === null ||
    destination.longitude === null
  ) {
    return null;
  }

  const resolvedOrigin = {
    latitude: origin.latitude,
    longitude: origin.longitude,
  };
  const resolvedDestination = {
    latitude: destination.latitude,
    longitude: destination.longitude,
  };

  const cachedDistance = await getCachedDistance(
    supabase,
    organizationId,
    resolvedOrigin,
    resolvedDestination,
  );

  if (cachedDistance) {
    return cachedDistance;
  }

  const mapboxDistance =
    options.useMapbox === true
      ? await getMapboxDistance(
          resolvedOrigin,
          resolvedDestination,
          options.mapboxAccessToken ?? null,
        )
      : null;
  const distance =
    mapboxDistance ?? estimateDistance(resolvedOrigin, resolvedDestination);

  await cacheDistance(
    supabase,
    organizationId,
    resolvedOrigin,
    resolvedDestination,
    distance,
  );

  return distance;
}

async function getCachedDistance(
  supabase: SupabaseClient,
  organizationId: string,
  origin: ResolvedCoordinate,
  destination: ResolvedCoordinate,
): Promise<DistanceEstimate | null> {
  const minFetchedAt = new Date();
  minFetchedAt.setDate(minFetchedAt.getDate() - CACHE_TTL_DAYS);

  const { data } = await supabase
    .from("distances")
    .select("distance_miles, duration_seconds, last_fetched_at")
    .eq("organization_id", organizationId)
    .eq("origin_lat", origin.latitude)
    .eq("origin_lng", origin.longitude)
    .eq("dest_lat", destination.latitude)
    .eq("dest_lng", destination.longitude)
    .gte("last_fetched_at", minFetchedAt.toISOString())
    .maybeSingle<{
      distance_miles: number;
      duration_seconds: number;
      last_fetched_at: string;
    }>();

  if (!data) {
    return null;
  }

  return {
    distanceMiles: Number(data.distance_miles),
    durationSeconds: Number(data.duration_seconds),
    source: "cache",
  };
}

async function cacheDistance(
  supabase: SupabaseClient,
  organizationId: string,
  origin: ResolvedCoordinate,
  destination: ResolvedCoordinate,
  distance: DistanceEstimate,
): Promise<void> {
  await supabase.from("distances").upsert(
    {
      organization_id: organizationId,
      origin_lat: origin.latitude,
      origin_lng: origin.longitude,
      dest_lat: destination.latitude,
      dest_lng: destination.longitude,
      distance_miles: distance.distanceMiles,
      duration_seconds: distance.durationSeconds,
      last_fetched_at: new Date().toISOString(),
    },
    {
      onConflict: "organization_id,origin_lat,origin_lng,dest_lat,dest_lng",
    },
  );
}

async function getMapboxDistance(
  origin: ResolvedCoordinate,
  destination: ResolvedCoordinate,
  accessToken: string | null,
): Promise<DistanceEstimate | null> {
  const mapboxAccessToken = accessToken?.trim();

  if (!mapboxAccessToken) {
    return null;
  }

  const coordinates = [
    `${origin.longitude},${origin.latitude}`,
    `${destination.longitude},${destination.latitude}`,
  ].join(";");
  const url = new URL(
    `https://api.mapbox.com/directions/v5/mapbox/driving/${coordinates}`,
  );
  url.searchParams.set("access_token", mapboxAccessToken);
  url.searchParams.set("overview", "false");
  url.searchParams.set("alternatives", "false");

  try {
    const response = await fetch(url, { cache: "no-store" });

    if (!response.ok) {
      return null;
    }

    return parseMapboxDistance(await response.json());
  } catch {
    return null;
  }
}

function parseMapboxDistance(payload: unknown): DistanceEstimate | null {
  if (
    !isRecord(payload) ||
    payload.code !== "Ok" ||
    !Array.isArray(payload.routes)
  ) {
    return null;
  }

  const firstRoute = payload.routes[0];

  if (!isRecord(firstRoute)) {
    return null;
  }

  const meters = firstRoute.distance;
  const seconds = firstRoute.duration;

  if (typeof meters !== "number" || typeof seconds !== "number") {
    return null;
  }

  return {
    distanceMiles: roundDistance(meters / METERS_PER_MILE),
    durationSeconds: Math.round(seconds),
    source: "mapbox",
  };
}

function estimateDistance(
  origin: ResolvedCoordinate,
  destination: ResolvedCoordinate,
): DistanceEstimate {
  const distanceMiles = roundDistance(
    haversineMiles(
      origin.latitude,
      origin.longitude,
      destination.latitude,
      destination.longitude,
    ),
  );
  const durationSeconds = Math.round(
    (distanceMiles / AVERAGE_TRUCK_SPEED_MPH) * 60 * 60,
  );

  return {
    distanceMiles,
    durationSeconds,
    source: "estimate",
  };
}

function haversineMiles(
  originLat: number,
  originLng: number,
  destLat: number,
  destLng: number,
): number {
  const dLat = toRadians(destLat - originLat);
  const dLng = toRadians(destLng - originLng);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRadians(originLat)) *
      Math.cos(toRadians(destLat)) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return EARTH_RADIUS_MILES * c;
}

function toRadians(value: number): number {
  return (value * Math.PI) / 180;
}

function roundDistance(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
