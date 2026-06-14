"use client";

import { useActionState } from "react";
import type { ReactNode } from "react";
import { MapPin, Plus } from "lucide-react";

import {
  createCustomer,
  createJobSite,
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
          <input
            id="payment-terms"
            name="payment_terms"
            className="soft-control w-full"
            maxLength={80}
          />
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
