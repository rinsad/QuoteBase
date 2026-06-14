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
  fieldErrors: Record<string, string>;
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
      fieldErrors: {},
    };
  }

  const parsed = parseQuoteForm(formData, user.role);

  if (!parsed.ok) {
    return {
      message: parsed.message,
      status: "error",
      fieldErrors: parsed.fieldErrors,
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
      fieldErrors: {},
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
  | { ok: false; message: string; fieldErrors: Record<string, string> } {
  const fieldErrors: Record<string, string> = {};
  const customerId = requiredUuid(formData, "customer_id");
  const jobSiteId = requiredUuid(formData, "job_site_id");
  const materialId = requiredUuid(formData, "material_id");
  const taxRateId = optionalUuid(formData, "tax_rate_id");
  const quantity = Number(getString(formData, "quantity"));
  const materialUnitPriceOverride = optionalMoney(
    formData,
    "material_unit_price_override",
    fieldErrors,
  );
  const materialMinimumOverride = optionalNonNegativeMoney(
    formData,
    "material_minimum_override",
    fieldErrors,
  );
  const truckingMinimumOverride = optionalNonNegativeMoney(
    formData,
    "trucking_minimum_override",
    fieldErrors,
  );
  const competitorPrice = optionalMoney(formData, "competitor_price", fieldErrors);
  const manualRouteDistanceMiles = optionalNonNegativeMoney(
    formData,
    "manual_route_distance_miles",
    fieldErrors,
  );
  const manualDeadheadDistanceMiles = optionalNonNegativeMoney(
    formData,
    "manual_deadhead_distance_miles",
    fieldErrors,
  );
  const truckRateOverride = optionalTruckRate(formData, "truck_rate_override");
  if (!materialId) {
    fieldErrors.material_id = "Select a material.";
  }

  if (!Number.isFinite(quantity) || quantity <= 0 || quantity > 100000) {
    fieldErrors.quantity = "Quantity must be greater than zero.";
  }

  if (!customerId) {
    fieldErrors.customer_id = "Select an existing customer.";
  }

  if (!jobSiteId) {
    fieldErrors.job_site_id = "Select an existing job site.";
  }

  if (Object.keys(fieldErrors).length) {
    return {
      ok: false,
      message: "Fix the highlighted quote fields.",
      fieldErrors,
    };
  }

  return {
    ok: true,
    customerId,
    jobSiteId,
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

function optionalMoney(
  formData: FormData,
  key: string,
  fieldErrors: Record<string, string>,
): number | null {
  const value = getString(formData, key);

  if (!value) {
    return null;
  }

  const numberValue = Number(value);

  if (!Number.isFinite(numberValue) || numberValue <= 0) {
    fieldErrors[key] = `${labelFor(key)} must be greater than zero.`;
    return null;
  }

  return Math.round((numberValue + Number.EPSILON) * 100) / 100;
}

function optionalNonNegativeMoney(
  formData: FormData,
  key: string,
  fieldErrors: Record<string, string>,
): number | null {
  const value = getString(formData, key);

  if (!value) {
    return null;
  }

  const numberValue = Number(value);

  if (!Number.isFinite(numberValue) || numberValue < 0) {
    fieldErrors[key] = `${labelFor(key)} must be zero or greater.`;
    return null;
  }

  return Math.round((numberValue + Number.EPSILON) * 100) / 100;
}

function labelFor(key: string): string {
  return key
    .split("_")
    .map((part) => part[0]?.toUpperCase() + part.slice(1))
    .join(" ");
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
