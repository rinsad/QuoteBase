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
  address?: GeocodedAddress;
};

export type GeocodedAddress = {
  street: string | null;
  city: string | null;
  county: string | null;
  state: string | null;
  postalCode: string | null;
  formatted: string | null;
};

type MapboxContextValue = {
  name?: unknown;
  region_code?: unknown;
};

type MapboxFeatureProperties = {
  name?: unknown;
  full_address?: unknown;
  coordinates?: {
    latitude?: unknown;
    longitude?: unknown;
  };
  context?: {
    address?: MapboxContextValue;
    street?: MapboxContextValue;
    place?: MapboxContextValue;
    locality?: MapboxContextValue;
    district?: MapboxContextValue;
    region?: MapboxContextValue;
    postcode?: MapboxContextValue;
  };
};

type MapboxGeocodeResponse = {
  features?: Array<{
    geometry?: {
      coordinates?: unknown;
    };
    properties?: MapboxFeatureProperties;
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
    address: parseMapboxAddress(feature?.properties),
  };
}

function parseMapboxAddress(
  properties: MapboxFeatureProperties | undefined,
): GeocodedAddress | undefined {
  if (!properties) return undefined;

  const context = properties.context;
  const street = textValue(context?.address?.name ?? properties.name);
  const city = textValue(context?.place?.name ?? context?.locality?.name);
  const county = textValue(context?.district?.name);
  const regionCode = textValue(context?.region?.region_code);
  const state = regionCode?.includes("-")
    ? (regionCode.split("-").at(-1) ?? null)
    : regionCode;
  const postalCode = textValue(context?.postcode?.name);
  const formatted = textValue(properties.full_address);

  return street || city || county || state || postalCode || formatted
    ? { street, city, county, state, postalCode, formatted }
    : undefined;
}

function textValue(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function roundCoordinate(value: number): number {
  return Math.round((value + Number.EPSILON) * 10_000_000) / 10_000_000;
}
