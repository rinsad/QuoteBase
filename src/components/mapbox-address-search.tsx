"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { MapPin, Search } from "lucide-react";

export type MapboxAddressSelection = {
  label: string;
  street: string;
  city: string;
  county: string;
  state: string;
  postalCode: string;
  latitude: number;
  longitude: number;
  mapboxId: string;
};

type FieldIds = {
  street?: string;
  city?: string;
  county?: string;
  state?: string;
  postalCode?: string;
  latitude?: string;
  longitude?: string;
  mapboxId?: string;
};

type MapboxAddressSearchProps = {
  label: string;
  placeholder: string;
  disabled?: boolean;
  fieldIds?: FieldIds;
  onSelect?: (selection: MapboxAddressSelection) => void;
};

type MapboxFeature = {
  id?: unknown;
  geometry?: {
    coordinates?: unknown;
  };
  properties?: {
    mapbox_id?: unknown;
    name?: unknown;
    name_preferred?: unknown;
    full_address?: unknown;
    place_formatted?: unknown;
    coordinates?: {
      latitude?: unknown;
      longitude?: unknown;
    };
    context?: {
      address?: {
        name?: unknown;
        address_number?: unknown;
        street_name?: unknown;
      };
      place?: {
        name?: unknown;
      };
      locality?: {
        name?: unknown;
      };
      district?: {
        name?: unknown;
      };
      region?: {
        name?: unknown;
        region_code?: unknown;
      };
      postcode?: {
        name?: unknown;
      };
    };
  };
};

type MapboxResponse = {
  features?: MapboxFeature[];
};

const MAPBOX_FORWARD_GEOCODE_URL =
  "https://api.mapbox.com/search/geocode/v6/forward";

export function MapboxAddressSearch({
  label,
  placeholder,
  disabled = false,
  fieldIds,
  onSelect,
}: MapboxAddressSearchProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<MapboxAddressSelection[]>([]);
  const [status, setStatus] = useState<
    "idle" | "loading" | "config-loading" | "config-error" | "disabled" | "error"
  >("config-loading");
  const [token, setToken] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const canSearch = Boolean(token) && !disabled;
  const trimmedQuery = query.trim();
  const helperText = useMemo(() => {
    if (status === "config-loading") {
      return "Loading tenant Mapbox settings...";
    }

    if (status === "config-error") {
      return "Could not load tenant Mapbox settings.";
    }

    if (!token || status === "disabled") {
      return "Mapbox search is not enabled for this tenant.";
    }

    if (disabled) {
      return "Select the required parent record before searching.";
    }

    if (status === "loading") {
      return "Searching Mapbox...";
    }

    if (status === "error") {
      return "Address search failed. Try again or enter the address manually.";
    }

    return "Search and choose a Mapbox result to fill address and coordinates.";
  }, [disabled, status, token]);

  useEffect(() => {
    let mounted = true;

    async function loadConfig() {
      setStatus("config-loading");

      try {
        const response = await fetch("/api/mapbox/config", {
          cache: "no-store",
        });

        if (!response.ok) {
          throw new Error("Mapbox config request failed.");
        }

        const payload = (await response.json()) as {
          data?: {
            enabled?: unknown;
            accessToken?: unknown;
          };
        };
        const accessToken =
          typeof payload.data?.accessToken === "string"
            ? payload.data.accessToken
            : null;

        if (!mounted) {
          return;
        }

        setToken(accessToken);
        setStatus(payload.data?.enabled && accessToken ? "idle" : "disabled");
      } catch {
        if (mounted) {
          setToken(null);
          setStatus("config-error");
        }
      }
    }

    loadConfig();

    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (!canSearch || trimmedQuery.length < 3) {
      abortRef.current?.abort();
      setResults([]);
      setStatus((current) =>
        current === "config-loading" ||
        current === "config-error" ||
        current === "disabled"
          ? current
          : "idle",
      );
      return;
    }

    const controller = new AbortController();
    abortRef.current?.abort();
    abortRef.current = controller;
    const timeout = window.setTimeout(async () => {
      setStatus("loading");

      try {
        const url = new URL(MAPBOX_FORWARD_GEOCODE_URL);
        url.searchParams.set("q", trimmedQuery);
        url.searchParams.set("access_token", token ?? "");
        url.searchParams.set("autocomplete", "true");
        url.searchParams.set("country", "us");
        url.searchParams.set("types", "address,street");
        url.searchParams.set("limit", "6");
        url.searchParams.set("language", "en");
        url.searchParams.set("permanent", "true");

        const response = await fetch(url, {
          cache: "no-store",
          signal: controller.signal,
        });

        if (!response.ok) {
          throw new Error("Mapbox request failed.");
        }

        const payload = (await response.json()) as MapboxResponse;
        setResults((payload.features ?? []).map(parseFeature).filter(isSelection));
        setStatus("idle");
      } catch (error) {
        if ((error as Error).name !== "AbortError") {
          setStatus("error");
          setResults([]);
        }
      }
    }, 350);

    return () => {
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [canSearch, token, trimmedQuery]);

  function selectAddress(selection: MapboxAddressSelection) {
    setQuery(selection.label);
    setResults([]);
    setStatus("idle");
    writeSelectionToFields(selection, fieldIds);
    onSelect?.(selection);
  }

  return (
    <div className="rounded-[18px] border border-white/70 bg-white/65 p-4">
      <label className="block">
        <span className="text-sm font-medium text-muted-foreground">{label}</span>
        <span className="relative mt-2 block">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={placeholder}
            disabled={disabled || !token}
            className="soft-control w-full pl-10"
          />
        </span>
      </label>
      <p className="mt-2 text-xs leading-5 text-muted-foreground">
        {helperText}
      </p>
      {results.length ? (
        <div className="mt-3 overflow-hidden rounded-[16px] ring-1 ring-border">
          {results.map((result) => (
            <button
              key={`${result.mapboxId}-${result.latitude}-${result.longitude}`}
              type="button"
              onClick={() => selectAddress(result)}
              className="flex w-full items-start gap-3 border-t border-border bg-card/80 px-3 py-3 text-left first:border-t-0 hover:bg-secondary"
            >
              <MapPin className="mt-0.5 size-4 shrink-0 text-primary" />
              <span className="min-w-0">
                <span className="block truncate text-sm font-semibold">
                  {result.street || result.label}
                </span>
                <span className="mt-1 block truncate text-xs text-muted-foreground">
                  {[result.city, result.county, result.state, result.postalCode]
                    .filter(Boolean)
                    .join(", ")}
                </span>
              </span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function parseFeature(feature: MapboxFeature): MapboxAddressSelection | null {
  const properties = feature.properties;
  const coordinates = properties?.coordinates;
  const geometryCoordinates = feature.geometry?.coordinates;
  const longitude =
    typeof coordinates?.longitude === "number"
      ? coordinates.longitude
      : Array.isArray(geometryCoordinates) &&
          typeof geometryCoordinates[0] === "number"
        ? geometryCoordinates[0]
        : null;
  const latitude =
    typeof coordinates?.latitude === "number"
      ? coordinates.latitude
      : Array.isArray(geometryCoordinates) &&
          typeof geometryCoordinates[1] === "number"
        ? geometryCoordinates[1]
        : null;

  if (latitude === null || longitude === null) {
    return null;
  }

  const context = properties?.context;
  const street =
    stringValue(context?.address?.name) ||
    [
      stringValue(context?.address?.address_number),
      stringValue(context?.address?.street_name),
    ]
      .filter(Boolean)
      .join(" ") ||
    stringValue(properties?.name) ||
    stringValue(properties?.name_preferred);
  const city =
    stringValue(context?.place?.name) || stringValue(context?.locality?.name);
  const county = stripCountySuffix(stringValue(context?.district?.name));
  const state =
    stringValue(context?.region?.region_code) ||
    stateCodeFromName(stringValue(context?.region?.name));
  const postalCode = stringValue(context?.postcode?.name);
  const label =
    stringValue(properties?.full_address) ||
    [street, stringValue(properties?.place_formatted)].filter(Boolean).join(", ");

  return {
    label,
    street,
    city,
    county,
    state,
    postalCode,
    latitude: roundCoordinate(latitude),
    longitude: roundCoordinate(longitude),
    mapboxId: stringValue(properties?.mapbox_id) || stringValue(feature.id),
  };
}

function writeSelectionToFields(
  selection: MapboxAddressSelection,
  fieldIds: FieldIds | undefined,
) {
  if (!fieldIds) {
    return;
  }

  setInputValue(fieldIds.street, selection.street);
  setInputValue(fieldIds.city, selection.city);
  setInputValue(fieldIds.county, selection.county);
  setInputValue(fieldIds.state, selection.state);
  setInputValue(fieldIds.postalCode, selection.postalCode);
  setInputValue(fieldIds.latitude, String(selection.latitude));
  setInputValue(fieldIds.longitude, String(selection.longitude));
  setInputValue(fieldIds.mapboxId, selection.mapboxId);
}

function setInputValue(id: string | undefined, value: string) {
  if (!id || !value) {
    return;
  }

  const input = document.getElementById(id);

  if (input instanceof HTMLInputElement) {
    input.value = value;
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
  }
}

function isSelection(
  value: MapboxAddressSelection | null,
): value is MapboxAddressSelection {
  return Boolean(value);
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function stripCountySuffix(value: string): string {
  return value.replace(/\s+County$/i, "");
}

function stateCodeFromName(value: string): string {
  const normalized = value.toUpperCase();

  if (/^[A-Z]{2}$/.test(normalized)) {
    return normalized;
  }

  const match = normalized.match(/[A-Z]{2}$/);

  return match?.[0] ?? "";
}

function roundCoordinate(value: number): number {
  return Math.round((value + Number.EPSILON) * 10_000_000) / 10_000_000;
}
