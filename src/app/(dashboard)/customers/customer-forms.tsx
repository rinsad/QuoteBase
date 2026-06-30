"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { MapPin, Plus } from "lucide-react";

import {
  createCustomer,
  createJobSite,
  updateCustomer,
  type CustomerFormState,
} from "@/app/(dashboard)/customers/actions";
import { Button } from "@/components/ui/button";
import type {
  CustomerDeskSummary,
  CustomerPlantOption,
  CustomerSummary,
} from "@/lib/customers/customers";

const initialCustomerFormState: CustomerFormState = {
  message: "",
  status: "idle",
  fieldErrors: {},
};

type GoogleAddressComponent = {
  long_name: string;
  short_name: string;
  types: string[];
};

type GooglePlaceResult = {
  address_components?: GoogleAddressComponent[];
  geometry?: {
    location?: {
      lat: () => number;
      lng: () => number;
    };
  };
  name?: string;
};

type GooglePlacesAutocomplete = {
  addListener: (eventName: "place_changed", handler: () => void) => void;
  getPlace: () => GooglePlaceResult;
};

declare global {
  interface Window {
    google?: {
      maps?: {
        places?: {
          Autocomplete: new (
            input: HTMLInputElement,
            options: {
              componentRestrictions: { country: string };
              fields: string[];
              types: string[];
            },
          ) => GooglePlacesAutocomplete;
        };
      };
    };
  }
}

export function CustomerForm({
  plants,
  variant = "panel",
}: {
  plants: CustomerPlantOption[];
  variant?: "panel" | "bare";
}) {
  const [state, formAction, isPending] = useActionState(
    createCustomer,
    initialCustomerFormState,
  );
  const safePlants = plants.filter(isPlantOption);

  return (
    <form
      action={formAction}
      className={variant === "panel" ? "glass-panel p-5 sm:p-6" : ""}
      noValidate
    >
      {variant === "panel" ? (
        <SectionHeading icon={Plus} kicker="Create" title="Customer" />
      ) : null}
      <div
        className={`grid gap-4 sm:grid-cols-2 ${
          variant === "panel" ? "mt-5" : ""
        }`}
      >
        <Field
          label="Customer name"
          name="name"
          required
          error={state.fieldErrors.name}
        >
          <input
            id="customer-name"
            name="name"
            className="soft-control w-full"
            required
            maxLength={160}
            aria-invalid={Boolean(state.fieldErrors.name)}
          />
        </Field>
        <Field label="Company" name="company_name" optional>
          <input
            id="company-name"
            name="company_name"
            className="soft-control w-full"
            maxLength={160}
          />
        </Field>
        <Field label="Contact name" name="contact_name" optional>
          <input
            id="contact-name"
            name="contact_name"
            className="soft-control w-full"
            maxLength={160}
          />
        </Field>
        <Field
          label="Email"
          name="email"
          optional
          error={state.fieldErrors.email}
        >
          <input
            id="customer-email"
            name="email"
            type="email"
            className="soft-control w-full"
            maxLength={254}
            aria-invalid={Boolean(state.fieldErrors.email)}
          />
        </Field>
        <Field label="Phone" name="phone" optional>
          <input
            id="customer-phone"
            name="phone"
            className="soft-control w-full"
            maxLength={40}
          />
        </Field>
        <Field label="Address" name="address" optional>
          <input
            id="customer-address"
            name="address"
            className="soft-control w-full"
            maxLength={240}
          />
        </Field>
        <Field label="Payment terms" name="payment_terms" optional>
          <select
            id="payment-terms"
            name="payment_terms"
            defaultValue="COD"
            className="soft-control w-full"
          >
            <option value="COD">COD</option>
            <option value="Net30">Net30</option>
          </select>
        </Field>
        <Field
          label="Default plant"
          name="default_plant_id"
          optional
          error={state.fieldErrors.default_plant_id}
        >
          <select
            id="default-plant-id"
            name="default_plant_id"
            className="soft-control w-full"
            aria-invalid={Boolean(state.fieldErrors.default_plant_id)}
          >
            <option value="">No default</option>
            {safePlants.map((plant) => (
              <option key={plant.id} value={plant.id}>
                {plant.name}
              </option>
            ))}
          </select>
        </Field>
        <Field
          label="Pricing notes"
          name="pricing_notes"
          optional
          className="sm:col-span-2"
        >
          <textarea
            id="pricing-notes"
            name="pricing_notes"
            rows={3}
            className="soft-control w-full resize-none"
            maxLength={1000}
          />
        </Field>
      </div>
      <FormMessage state={state} />
      <Button
        type="submit"
        disabled={isPending}
        className="mt-5 h-11 rounded-md"
      >
        {isPending ? "Saving..." : "Save customer"}
      </Button>
    </form>
  );
}

export function CustomerEditForm({
  customer,
  plants,
}: {
  customer: CustomerSummary;
  plants: CustomerPlantOption[];
}) {
  const [state, formAction, isPending] = useActionState(
    updateCustomer,
    initialCustomerFormState,
  );
  const safePlants = plants.filter(isPlantOption);

  return (
    <form action={formAction} noValidate>
      <input type="hidden" name="customer_id" value={customer.id} />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          label="Customer name"
          name="name"
          required
          error={state.fieldErrors.name}
        >
          <input
            id="edit-customer-name"
            name="name"
            defaultValue={customer.name}
            className="soft-control w-full"
            required
            maxLength={160}
            aria-invalid={Boolean(state.fieldErrors.name)}
          />
        </Field>
        <Field label="Company" name="company_name" optional>
          <input
            id="edit-company-name"
            name="company_name"
            defaultValue={customer.company_name ?? ""}
            className="soft-control w-full"
            maxLength={160}
          />
        </Field>
        <Field label="Contact name" name="contact_name" optional>
          <input
            id="edit-contact-name"
            name="contact_name"
            defaultValue={customer.contact_name ?? ""}
            className="soft-control w-full"
            maxLength={160}
          />
        </Field>
        <Field
          label="Email"
          name="email"
          optional
          error={state.fieldErrors.email}
        >
          <input
            id="edit-customer-email"
            name="email"
            type="email"
            defaultValue={customer.email ?? ""}
            className="soft-control w-full"
            maxLength={254}
            aria-invalid={Boolean(state.fieldErrors.email)}
          />
        </Field>
        <Field label="Phone" name="phone" optional>
          <input
            id="edit-customer-phone"
            name="phone"
            defaultValue={customer.phone ?? ""}
            className="soft-control w-full"
            maxLength={40}
          />
        </Field>
        <Field label="Address" name="address" optional>
          <input
            id="edit-customer-address"
            name="address"
            defaultValue={addressLine(customer.address)}
            className="soft-control w-full"
            maxLength={240}
          />
        </Field>
        <Field label="Payment terms" name="payment_terms" optional>
          <select
            id="edit-payment-terms"
            name="payment_terms"
            defaultValue={customer.payment_terms ?? "COD"}
            className="soft-control w-full"
          >
            <option value="COD">COD</option>
            <option value="Net30">Net30</option>
          </select>
        </Field>
        <Field
          label="Default plant"
          name="default_plant_id"
          optional
          error={state.fieldErrors.default_plant_id}
        >
          <select
            id="edit-default-plant-id"
            name="default_plant_id"
            defaultValue={customer.default_plant_id ?? ""}
            className="soft-control w-full"
            aria-invalid={Boolean(state.fieldErrors.default_plant_id)}
          >
            <option value="">No default</option>
            {safePlants.map((plant) => (
              <option key={plant.id} value={plant.id}>
                {plant.name}
              </option>
            ))}
          </select>
        </Field>
        <Field
          label="Pricing notes"
          name="pricing_notes"
          optional
          className="sm:col-span-2"
        >
          <textarea
            id="edit-pricing-notes"
            name="pricing_notes"
            rows={3}
            defaultValue={customer.pricing_notes ?? ""}
            className="soft-control w-full resize-none"
            maxLength={1000}
          />
        </Field>
        <label className="flex items-center gap-3 rounded-md border border-border bg-background px-4 py-3">
          <input
            name="is_active"
            type="checkbox"
            defaultChecked={customer.is_active}
            className="size-4 accent-[#3d6652]"
          />
          <span>
            <span className="block text-sm font-semibold">Active customer</span>
            <span className="block text-xs text-muted-foreground">
              Inactive customers stay in history but are hidden from normal work.
            </span>
          </span>
        </label>
      </div>
      <FormMessage state={state} />
      <Button
        type="submit"
        disabled={isPending}
        className="mt-5 h-11 rounded-md"
      >
        {isPending ? "Saving..." : "Save changes"}
      </Button>
    </form>
  );
}

export function JobSiteForm({
  customers,
  defaultCustomerId,
  locationOptions,
  variant = "panel",
}: {
  customers: CustomerSummary[];
  defaultCustomerId?: string;
  locationOptions?: CustomerDeskSummary["locationOptions"];
  variant?: "panel" | "bare";
}) {
  const [state, formAction, isPending] = useActionState(
    createJobSite,
    initialCustomerFormState,
  );
  const safeCustomers = customers.filter(isCustomerSummary);

  return (
    <form
      action={formAction}
      className={variant === "panel" ? "glass-panel p-5 sm:p-6" : ""}
      noValidate
    >
      {variant === "panel" ? (
        <SectionHeading icon={MapPin} kicker="Create" title="Job site" />
      ) : null}
      <div
        className={`grid gap-4 sm:grid-cols-2 ${
          variant === "panel" ? "mt-5" : ""
        }`}
      >
        <Field
          label="Customer"
          name="customer_id"
          required
          error={state.fieldErrors.customer_id}
        >
          <select
            id="job-site-customer-id"
            name="customer_id"
            className="soft-control w-full"
            defaultValue={defaultCustomerId ?? ""}
            required
            aria-invalid={Boolean(state.fieldErrors.customer_id)}
          >
            <option value="">Select customer...</option>
            {safeCustomers
              .filter((customer) => customer.is_active)
              .map((customer) => (
                <option key={customer.id} value={customer.id}>
                  {customer.name}
                </option>
              ))}
          </select>
        </Field>
        <Field
          label="Site name"
          name="name"
          required
          error={state.fieldErrors.name}
        >
          <input
            id="job-site-name"
            name="name"
            className="soft-control w-full"
            required
            maxLength={160}
            aria-invalid={Boolean(state.fieldErrors.name)}
          />
        </Field>
        <Field label="Street address" name="line1" optional>
          <input
            id="job-site-line1"
            name="line1"
            className="soft-control w-full"
            maxLength={240}
          />
        </Field>
        <JobSiteAddressAutocomplete />
        <Field
          label="City"
          name="city"
          required
          error={state.fieldErrors.city}
        >
          <input
            id="job-site-city"
            name="city"
            className="soft-control w-full"
            list="job-site-city-options"
            required
            maxLength={120}
            aria-invalid={Boolean(state.fieldErrors.city)}
          />
        </Field>
        <Field
          label="County"
          name="county"
          required
          error={state.fieldErrors.county}
        >
          <input
            id="job-site-county"
            name="county"
            className="soft-control w-full"
            list="job-site-county-options"
            required
            maxLength={120}
            aria-invalid={Boolean(state.fieldErrors.county)}
          />
        </Field>
        <Field
          label="State"
          name="state"
          required
          error={state.fieldErrors.state}
        >
          <input
            id="job-site-state"
            name="state"
            className="soft-control w-full uppercase"
            list="job-site-state-options"
            defaultValue="CA"
            maxLength={2}
            required
            aria-invalid={Boolean(state.fieldErrors.state)}
          />
        </Field>
        <Field
          label="Latitude"
          name="latitude"
          optional
          error={state.fieldErrors.latitude}
        >
          <input
            id="job-site-latitude"
            name="latitude"
            type="number"
            step="0.0000001"
            min="-90"
            max="90"
            className="soft-control w-full"
            aria-invalid={Boolean(state.fieldErrors.latitude)}
          />
        </Field>
        <Field
          label="Longitude"
          name="longitude"
          optional
          error={state.fieldErrors.longitude}
        >
          <input
            id="job-site-longitude"
            name="longitude"
            type="number"
            step="0.0000001"
            min="-180"
            max="180"
            className="soft-control w-full"
            aria-invalid={Boolean(state.fieldErrors.longitude)}
          />
        </Field>
      </div>
      <LocationDatalists locationOptions={locationOptions} />
      <FormMessage state={state} />
      <Button
        type="submit"
        disabled={isPending}
        className="mt-5 h-11 rounded-md"
      >
        {isPending ? "Saving..." : "Save job site"}
      </Button>
    </form>
  );
}

function LocationDatalists({
  locationOptions,
}: {
  locationOptions?: CustomerDeskSummary["locationOptions"];
}) {
  const cities = locationOptions?.cities ?? [];
  const counties = locationOptions?.counties ?? [];
  const states = locationOptions?.states.length
    ? locationOptions.states
    : ["CA", "NV", "AZ", "OR"];

  return (
    <>
      <datalist id="job-site-city-options">
        {cities.map((city) => (
          <option key={city} value={city} />
        ))}
      </datalist>
      <datalist id="job-site-county-options">
        {counties.map((county) => (
          <option key={county} value={county} />
        ))}
      </datalist>
      <datalist id="job-site-state-options">
        {states.map((state) => (
          <option key={state} value={state} />
        ))}
      </datalist>
    </>
  );
}

function JobSiteAddressAutocomplete() {
  const autocompleteRef = useRef<GooglePlacesAutocomplete | null>(null);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    let isMounted = true;

    loadGooglePlaces()
      .then(() => {
        if (isMounted) {
          setIsReady(true);
        }
      })
      .catch(() => {
        if (isMounted) {
          setIsReady(false);
        }
      });

    return () => {
      isMounted = false;
      autocompleteRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!isReady || autocompleteRef.current) {
      return;
    }

    const addressInput = inputById("job-site-line1");

    if (!addressInput || !window.google?.maps?.places?.Autocomplete) {
      return;
    }

    const autocomplete = new window.google.maps.places.Autocomplete(
      addressInput,
      {
        componentRestrictions: { country: "us" },
        fields: ["address_components", "geometry", "name"],
        types: ["address"],
      },
    );

    autocomplete.addListener("place_changed", () => {
      const place = autocomplete.getPlace();

      applySelectedPlace(place);
    });
    autocompleteRef.current = autocomplete;
  }, [isReady]);

  return null;
}

function applySelectedPlace(place: GooglePlaceResult) {
  const components = place.address_components ?? [];
  const streetNumber = componentValue(components, "street_number", "short_name");
  const route = componentValue(components, "route", "long_name");
  const line1 = [streetNumber, route].filter(Boolean).join(" ");
  const city =
    componentValue(components, "locality", "long_name") ||
    componentValue(components, "postal_town", "long_name") ||
    componentValue(components, "sublocality", "long_name");
  const county = stripCountySuffix(
    componentValue(components, "administrative_area_level_2", "long_name"),
  );
  const state = componentValue(
    components,
    "administrative_area_level_1",
    "short_name",
  );
  const latitude = place.geometry?.location?.lat();
  const longitude = place.geometry?.location?.lng();

  setInputValue("job-site-line1", line1 || place.name || "");
  setInputValue("job-site-city", city);
  setInputValue("job-site-county", county);
  setInputValue("job-site-state", state);
  setInputValue(
    "job-site-latitude",
    typeof latitude === "number" ? formatCoordinate(latitude) : "",
  );
  setInputValue(
    "job-site-longitude",
    typeof longitude === "number" ? formatCoordinate(longitude) : "",
  );
}

function loadGooglePlaces(): Promise<void> {
  if (window.google?.maps?.places?.Autocomplete) {
    return Promise.resolve();
  }

  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;

  if (!apiKey) {
    return Promise.reject(new Error("Google Maps browser key is not configured."));
  }

  const existingScript = document.querySelector<HTMLScriptElement>(
    "script[data-google-places='true']",
  );

  if (existingScript) {
    return new Promise((resolve, reject) => {
      existingScript.addEventListener("load", () => resolve(), { once: true });
      existingScript.addEventListener("error", () => reject(), { once: true });
    });
  }

  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    const url = new URL("https://maps.googleapis.com/maps/api/js");

    url.searchParams.set("key", apiKey);
    url.searchParams.set("libraries", "places");
    url.searchParams.set("loading", "async");
    script.src = url.toString();
    script.async = true;
    script.dataset.googlePlaces = "true";
    script.addEventListener("load", () => resolve(), { once: true });
    script.addEventListener("error", () => reject(), { once: true });
    document.head.appendChild(script);
  });
}

function componentValue(
  components: GoogleAddressComponent[],
  type: string,
  key: "long_name" | "short_name",
): string {
  return (
    components.find((component) => component.types.includes(type))?.[key] ?? ""
  );
}

function inputById(id: string): HTMLInputElement | null {
  const element = document.getElementById(id);

  return element instanceof HTMLInputElement ? element : null;
}

function setInputValue(id: string, value: string) {
  if (!value) {
    return;
  }

  const input = inputById(id);

  if (input) {
    input.value = value;
    input.dispatchEvent(new Event("input", { bubbles: true }));
  }
}

function stripCountySuffix(value: string): string {
  return value.replace(/\s+County$/i, "");
}

function formatCoordinate(value: number): string {
  return String(Math.round((value + Number.EPSILON) * 10_000_000) / 10_000_000);
}

function isPlantOption(value: CustomerPlantOption | null): value is CustomerPlantOption {
  return Boolean(
    value && typeof value.id === "string" && typeof value.name === "string",
  );
}

function isCustomerSummary(
  value: CustomerSummary | null,
): value is CustomerSummary {
  return Boolean(
    value &&
      typeof value.id === "string" &&
      typeof value.name === "string" &&
      typeof value.is_active === "boolean",
  );
}

function Field({
  label,
  name,
  children,
  required = false,
  optional = false,
  error,
  className = "",
}: {
  label: string;
  name: string;
  children: ReactNode;
  required?: boolean;
  optional?: boolean;
  error?: string;
  className?: string;
}) {
  const errorId = `${name}-error`;

  return (
    <label className={`block ${className}`}>
      <span className="flex items-center justify-between gap-3 text-sm font-medium text-muted-foreground">
        <span>{label}</span>
        {required ? (
          <span className="text-xs font-semibold text-rose-600">Required</span>
        ) : null}
        {optional ? (
          <span className="text-xs font-medium text-muted-foreground/70">
            Optional
          </span>
        ) : null}
      </span>
      <span className="mt-2 block">{children}</span>
      {error ? (
        <span id={errorId} className="mt-2 block text-xs text-rose-700">
          {error}
        </span>
      ) : null}
    </label>
  );
}

function FormMessage({
  state,
}: {
  state: { message: string; status: "idle" | "error" };
}) {
  if (!state.message) {
    return null;
  }

  return (
    <p className="mt-4 rounded-2xl bg-rose-50 px-4 py-3 text-sm text-rose-700 ring-1 ring-rose-100">
      {state.message}
    </p>
  );
}

function SectionHeading({
  icon: Icon,
  kicker,
  title,
}: {
  icon: typeof Plus;
  kicker: string;
  title: string;
}) {
  return (
    <div className="flex items-center gap-3">
      <div className="icon-well text-blue-700">
        <Icon className="size-5" />
      </div>
      <div>
        <p className="text-sm font-medium text-muted-foreground">{kicker}</p>
        <h2 className="text-xl font-semibold">{title}</h2>
      </div>
    </div>
  );
}

function addressLine(address: Record<string, unknown>) {
  const line1 = typeof address.line1 === "string" ? address.line1 : "";

  return line1;
}
