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

type GoogleGeocodeResponse = {
  status?: unknown;
  results?: Array<{
    geometry?: {
      location?: {
        lat?: unknown;
        lng?: unknown;
      };
    };
  }>;
};

const GOOGLE_GEOCODE_URL = "https://maps.googleapis.com/maps/api/geocode/json";
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
  const googleMapsApiKey = apiKey?.trim() || process.env.GOOGLE_MAPS_API_KEY;

  if (!googleMapsApiKey || !street || !normalizedCity || normalizedState.length !== 2) {
    return null;
  }

  const address = [street, normalizedCity, county?.trim(), normalizedState, "USA"]
    .filter(Boolean)
    .join(", ");
  const url = new URL(GOOGLE_GEOCODE_URL);
  url.searchParams.set("address", address);
  url.searchParams.set("components", `country:US|administrative_area:${normalizedState}`);
  url.searchParams.set("key", googleMapsApiKey);

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

    return parseGoogleGeocodeResponse(await response.json());
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

function parseGoogleGeocodeResponse(
  payload: unknown,
): GeocodedCoordinate | null {
  const response = payload as GoogleGeocodeResponse;

  if (response.status !== "OK" || !Array.isArray(response.results)) {
    return null;
  }

  const location = response.results[0]?.geometry?.location;
  const latitude = location?.lat;
  const longitude = location?.lng;

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
