import type { SupabaseClient } from "@supabase/supabase-js";

export type Coordinate = {
  latitude: number | null;
  longitude: number | null;
};

export type DistanceEstimate = {
  distanceMiles: number;
  durationSeconds: number;
};

const EARTH_RADIUS_MILES = 3958.8;
const AVERAGE_TRUCK_SPEED_MPH = 35;

export async function estimateAndCacheDistance(
  supabase: SupabaseClient,
  organizationId: string,
  origin: Coordinate,
  destination: Coordinate,
): Promise<DistanceEstimate | null> {
  if (
    origin.latitude === null ||
    origin.longitude === null ||
    destination.latitude === null ||
    destination.longitude === null
  ) {
    return null;
  }

  const distanceMiles = roundDistance(
    haversineMiles(origin.latitude, origin.longitude, destination.latitude, destination.longitude),
  );
  const durationSeconds = Math.round(
    (distanceMiles / AVERAGE_TRUCK_SPEED_MPH) * 60 * 60,
  );

  await supabase.from("distances").upsert(
    {
      organization_id: organizationId,
      origin_lat: origin.latitude,
      origin_lng: origin.longitude,
      dest_lat: destination.latitude,
      dest_lng: destination.longitude,
      distance_miles: distanceMiles,
      duration_seconds: durationSeconds,
      last_fetched_at: new Date().toISOString(),
    },
    {
      onConflict: "organization_id,origin_lat,origin_lng,dest_lat,dest_lng",
    },
  );

  return {
    distanceMiles,
    durationSeconds,
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
