"use server";

import { redirect } from "next/navigation";

import { getCurrentUser } from "@/lib/auth/current-user";
import {
  createQuoteDraftRecord,
  type CreateQuoteDraftInput,
} from "@/lib/quotes/create-draft";
import { createClient } from "@/lib/supabase/server";

export type CreateQuoteState = {
  message: string;
  status: "idle" | "error";
};

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function createQuoteDraft(
  _previousState: CreateQuoteState,
  formData: FormData,
): Promise<CreateQuoteState> {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/login");
  }

  const supabase = await createClient();

  if (!supabase) {
    return {
      message: "Supabase is not configured for this workspace.",
      status: "error",
    };
  }

  const parsed = parseQuoteForm(formData, user.role);

  if (!parsed.ok) {
    return {
      message: parsed.message,
      status: "error",
    };
  }

  let quote: { id: string; quote_number: string };

  try {
    quote = await createQuoteDraftRecord({
      supabase,
      user,
      input: parsed,
    });
  } catch (error) {
    return {
      message:
        error instanceof Error
          ? error.message
          : "Could not create the quote draft.",
      status: "error",
    };
  }

  redirect(
    `/quotes/${quote.id}?created=${encodeURIComponent(quote.quote_number)}`,
  );
}

function parseQuoteForm(
  formData: FormData,
  userRole: "admin" | "account_manager" | "estimator",
):
  | ({ ok: true } & CreateQuoteDraftInput)
  | { ok: false; message: string } {
  const customerId = optionalUuid(formData, "customer_id");
  const jobSiteId = optionalUuid(formData, "job_site_id");
  const materialId = requiredUuid(formData, "material_id");
  const taxRateId = optionalUuid(formData, "tax_rate_id");
  const quantity = Number(getString(formData, "quantity"));
  const materialUnitPriceOverride = optionalMoney(
    formData,
    "material_unit_price_override",
  );
  const materialMinimumOverride = optionalNonNegativeMoney(
    formData,
    "material_minimum_override",
  );
  const truckingMinimumOverride = optionalNonNegativeMoney(
    formData,
    "trucking_minimum_override",
  );
  const competitorPrice = optionalMoney(formData, "competitor_price");
  const manualRouteDistanceMiles = optionalNonNegativeMoney(
    formData,
    "manual_route_distance_miles",
  );
  const manualDeadheadDistanceMiles = optionalNonNegativeMoney(
    formData,
    "manual_deadhead_distance_miles",
  );
  const truckRateOverride = optionalTruckRate(formData, "truck_rate_override");

  if (!materialId) {
    return { ok: false, message: "Select a material." };
  }

  if (!Number.isFinite(quantity) || quantity <= 0 || quantity > 100000) {
    return { ok: false, message: "Quantity must be greater than zero." };
  }

  return {
    ok: true,
    customerId,
    customerName: getString(formData, "customer_name"),
    companyName: getString(formData, "company_name"),
    contactName: getString(formData, "contact_name"),
    contactEmail: getString(formData, "contact_email"),
    contactPhone: getString(formData, "contact_phone"),
    customerAddress: getString(formData, "customer_address"),
    paymentTerms: getString(formData, "payment_terms"),
    jobSiteId,
    siteName: getString(formData, "site_name"),
    siteAddress: getString(formData, "site_address"),
    siteCity: getString(formData, "site_city"),
    siteCounty: getString(formData, "site_county"),
    siteState: getString(formData, "site_state") || "CA",
    siteLatitude: optionalCoordinate(formData, "site_latitude", -90, 90),
    siteLongitude: optionalCoordinate(formData, "site_longitude", -180, 180),
    materialId,
    taxRateId,
    quantity,
    notes: getString(formData, "notes"),
    useSelectedPlant: formData.get("use_selected_plant") === "on",
    materialUnitPriceOverride,
    truckRateOverride: userRole === "admin" ? truckRateOverride : null,
    materialMinimumOverride,
    truckingMinimumOverride,
    competitorPrice,
    manualRouteDistanceMiles,
    manualDeadheadDistanceMiles,
  };
}

function getString(formData: FormData, key: string): string {
  const value = formData.get(key);

  return typeof value === "string" ? value.trim() : "";
}

function optionalUuid(formData: FormData, key: string): string {
  const value = getString(formData, key);

  return value && UUID_PATTERN.test(value) ? value : "";
}

function requiredUuid(formData: FormData, key: string): string {
  const value = getString(formData, key);

  return UUID_PATTERN.test(value) ? value : "";
}

function optionalCoordinate(
  formData: FormData,
  key: string,
  min: number,
  max: number,
): number | null {
  const value = getString(formData, key);

  if (!value) {
    return null;
  }

  const numberValue = Number(value);

  if (!Number.isFinite(numberValue) || numberValue < min || numberValue > max) {
    throw new Error(`${key} is out of range.`);
  }

  return Math.round((numberValue + Number.EPSILON) * 10000000) / 10000000;
}

function optionalMoney(formData: FormData, key: string): number | null {
  const value = getString(formData, key);

  if (!value) {
    return null;
  }

  const numberValue = Number(value);

  if (!Number.isFinite(numberValue) || numberValue <= 0) {
    throw new Error(`${key} must be greater than zero when provided.`);
  }

  return Math.round((numberValue + Number.EPSILON) * 100) / 100;
}

function optionalNonNegativeMoney(formData: FormData, key: string): number | null {
  const value = getString(formData, key);

  if (!value) {
    return null;
  }

  const numberValue = Number(value);

  if (!Number.isFinite(numberValue) || numberValue < 0) {
    throw new Error(`${key} must be zero or greater when provided.`);
  }

  return Math.round((numberValue + Number.EPSILON) * 100) / 100;
}

function optionalTruckRate(
  formData: FormData,
  key: string,
): "floor" | "standard" | "target" | "premium" | "stretch" | null {
  const value = getString(formData, key);
  const allowed = ["floor", "standard", "target", "premium", "stretch"] as const;

  return allowed.includes(value as (typeof allowed)[number])
    ? (value as (typeof allowed)[number])
    : null;
}
