export type GeocodeAddressInput = {
  line1: string | null;
  city: string;
  county?: string | null;
  state: string;
  apiKey?: string | null;
};

export type GeocodedCoordinate = {
  latitude: number;
  longitude: number;
};

type MapboxGeocodeResponse = {
  features?: Array<{
    geometry?: {
      coordinates?: unknown;
    };
    properties?: {
      coordinates?: {
        latitude?: unknown;
        longitude?: unknown;
      };
    };
  }>;
};

const MAPBOX_GEOCODE_URL = "https://api.mapbox.com/search/geocode/v6/forward";
const GEOCODE_TIMEOUT_MS = 10000;

export async function geocodeJobSiteAddress({
  line1,
  city,
  county,
  state,
  apiKey,
}: GeocodeAddressInput): Promise<GeocodedCoordinate | null> {
  const street = line1?.trim();
  const normalizedCity = city.trim();
  const normalizedState = state.trim().toUpperCase();
  const mapboxAccessToken = apiKey?.trim();

  if (!mapboxAccessToken || !street || !normalizedCity || normalizedState.length !== 2) {
    return null;
  }

  const address = [street, normalizedCity, county?.trim(), normalizedState, "USA"]
    .filter(Boolean)
    .join(", ");
  const url = new URL(MAPBOX_GEOCODE_URL);
  url.searchParams.set("q", address);
  url.searchParams.set("access_token", mapboxAccessToken);
  url.searchParams.set("country", "us");
  url.searchParams.set("limit", "1");
  url.searchParams.set("types", "address");
  url.searchParams.set("language", "en");
  url.searchParams.set("permanent", "true");

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), GEOCODE_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      cache: "no-store",
      signal: controller.signal,
    });

    if (!response.ok) {
      return null;
    }

    return parseMapboxGeocodeResponse(await response.json());
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

function parseMapboxGeocodeResponse(
  payload: unknown,
): GeocodedCoordinate | null {
  const response = payload as MapboxGeocodeResponse;

  if (!Array.isArray(response.features)) {
    return null;
  }

  const feature = response.features[0];
  const propertiesCoordinates = feature?.properties?.coordinates;
  const geometryCoordinates = feature?.geometry?.coordinates;
  const latitude =
    typeof propertiesCoordinates?.latitude === "number"
      ? propertiesCoordinates.latitude
      : Array.isArray(geometryCoordinates) &&
          typeof geometryCoordinates[1] === "number"
        ? geometryCoordinates[1]
        : null;
  const longitude =
    typeof propertiesCoordinates?.longitude === "number"
      ? propertiesCoordinates.longitude
      : Array.isArray(geometryCoordinates) &&
          typeof geometryCoordinates[0] === "number"
        ? geometryCoordinates[0]
        : null;

  if (typeof latitude !== "number" || typeof longitude !== "number") {
    return null;
  }

  return {
    latitude: roundCoordinate(latitude),
    longitude: roundCoordinate(longitude),
  };
}

function roundCoordinate(value: number): number {
  return Math.round((value + Number.EPSILON) * 10_000_000) / 10_000_000;
}
