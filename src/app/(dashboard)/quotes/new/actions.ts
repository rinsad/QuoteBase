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

  const parsed = parseQuoteForm(formData);

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

function parseQuoteForm(formData: FormData):
  | ({ ok: true } & CreateQuoteDraftInput)
  | { ok: false; message: string } {
  const customerId = optionalUuid(formData, "customer_id");
  const jobSiteId = optionalUuid(formData, "job_site_id");
  const materialId = requiredUuid(formData, "material_id");
  const taxRateId = requiredUuid(formData, "tax_rate_id");
  const quantity = Number(getString(formData, "quantity"));

  if (!materialId || !taxRateId) {
    return { ok: false, message: "Select a material and tax rate." };
  }

  if (!Number.isFinite(quantity) || quantity <= 0 || quantity > 100000) {
    return { ok: false, message: "Quantity must be greater than zero." };
  }

  return {
    ok: true,
    customerId,
    customerName: getString(formData, "customer_name"),
    contactName: getString(formData, "contact_name"),
    contactEmail: getString(formData, "contact_email"),
    contactPhone: getString(formData, "contact_phone"),
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
