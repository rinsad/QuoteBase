"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

import { logAction } from "@/lib/audit/log-action";
import { getCurrentUser, type AppUser } from "@/lib/auth/current-user";
import { geocodeJobSiteAddress } from "@/lib/geo/geocode";
import { getMapboxIntegration } from "@/lib/integrations/mapbox";
import {
  createQuoteDraftRecord,
  type CreateQuoteDraftInput,
  type CreateQuoteDraftLineInput,
  type QuoteAccountType,
  type QuoteProjectStatus,
} from "@/lib/quotes/create-draft";
import { createClient } from "@/lib/supabase/server";

export type CreateQuoteState = {
  message: string;
  status: "idle" | "error";
  fieldErrors: Record<string, string>;
};

export type QuoteJobSiteInlineOption = {
  id: string;
  customer_id: string;
  name: string;
  address: Record<string, unknown>;
  city: string;
  county: string;
  state: string;
  latitude: number | null;
  longitude: number | null;
};

export type CreateQuoteJobSiteResult =
  | {
      status: "success";
      message: string;
      jobSite: QuoteJobSiteInlineOption;
    }
  | {
      status: "error";
      message: string;
      fieldErrors: Record<string, string>;
    };

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const quoteJobSiteSchema = z.object({
  customer_id: z.string().regex(UUID_PATTERN, "Select a customer first."),
  name: z.string().trim().min(1, "Site name is required.").max(160),
  line1: z.string().trim().max(240).optional().default(""),
  city: z.string().trim().min(1, "City is required.").max(120),
  county: z.string().trim().min(1, "County is required.").max(120),
  postal_code: z.string().trim().max(20).optional().default(""),
  mapbox_id: z
    .string()
    .trim()
    .min(1, "Select an address from the Mapbox search.")
    .max(240),
  latitude: z.string().trim().min(1, "Select an address from the Mapbox search."),
  longitude: z.string().trim().min(1, "Select an address from the Mapbox search."),
  state: z
    .string()
    .trim()
    .min(2, "Use a 2-letter state code.")
    .max(2, "Use a 2-letter state code.")
    .transform((value) => value.toUpperCase()),
});

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

export async function createQuoteJobSite(
  formData: FormData,
): Promise<CreateQuoteJobSiteResult> {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/login");
  }

  const supabase = await createClient();

  if (!supabase) {
    return inlineJobSiteError("Supabase is not configured for this workspace.");
  }

  const parsed = quoteJobSiteSchema.safeParse({
    ...formDataObject(formData),
    state: getString(formData, "state") || "CA",
  });

  if (!parsed.success) {
    return inlineJobSiteError(
      "Fix the highlighted job site fields.",
      parsed.error,
    );
  }

  const {
    customer_id: customerId,
    name,
    line1,
    city,
    county,
    state,
    postal_code: postalCode,
    mapbox_id: mapboxId,
    latitude,
    longitude,
  } = parsed.data;
  const selectedCoordinates = parseCoordinatePair(latitude, longitude);

  if (!selectedCoordinates.ok) {
    return inlineJobSiteError("Fix the highlighted job site fields.", undefined, {
      [selectedCoordinates.field]: selectedCoordinates.message,
    });
  }

  const { data: customer } = await supabase
    .from("customers")
    .select("id")
    .eq("organization_id", user.organization_id)
    .eq("id", customerId)
    .eq("is_active", true)
    .single<{ id: string }>();

  if (!customer) {
    return inlineJobSiteError("Selected customer was not found.", undefined, {
      customer_id: "Select an active customer.",
    });
  }

  const geocoded =
    selectedCoordinates.coordinates ??
    (await geocodeJobSiteAddressWithTenantKey({
      supabase,
      organizationId: user.organization_id,
      line1,
      city,
      county,
      state,
    }));
  const { data: jobSite, error } = await supabase
    .from("job_sites")
    .upsert(
      {
        organization_id: user.organization_id,
        customer_id: customer.id,
        name,
        address: {
          line1: line1 || name,
          city,
          county,
          state,
          postal_code: postalCode || null,
          mapbox_id: mapboxId || null,
        },
        city,
        county,
        state,
        latitude: geocoded?.latitude ?? null,
        longitude: geocoded?.longitude ?? null,
        is_active: true,
      },
      { onConflict: "organization_id,customer_id,name" },
    )
    .select("id, customer_id, name, address, city, county, state, latitude, longitude")
    .single<QuoteJobSiteInlineOption>();

  if (error || !jobSite) {
    return inlineJobSiteError(error?.message ?? "Could not save job site.");
  }

  await logAction({
    user,
    action: "job_site.saved_from_quote_builder",
    targetTable: "job_sites",
    targetId: jobSite.id,
    after: {
      customer_id: customer.id,
      name,
      city,
      county,
      state,
      latitude: jobSite.latitude,
      longitude: jobSite.longitude,
      location_source: selectedCoordinates.coordinates ? "mapbox" : "geocoder",
    },
  });

  revalidatePath("/customers");
  revalidatePath("/quotes/new");

  return {
    status: "success",
    message: "Job site saved.",
    jobSite,
  };
}

async function geocodeJobSiteAddressWithTenantKey({
  supabase,
  organizationId,
  line1,
  city,
  county,
  state,
}: {
  supabase: SupabaseClient;
  organizationId: string;
  line1: string;
  city: string;
  county: string;
  state: string;
}) {
  const mapboxIntegration = await getMapboxIntegration({
    supabase,
    organizationId,
  });

  return geocodeJobSiteAddress({
    line1,
    city,
    county,
    state,
    apiKey:
      mapboxIntegration?.isEnabled && mapboxIntegration.publicAccessToken
        ? mapboxIntegration.publicAccessToken
        : null,
  });
}

function parseQuoteForm(
  formData: FormData,
  userRole: AppUser["role"],
):
  | ({ ok: true } & CreateQuoteDraftInput)
  | { ok: false; message: string; fieldErrors: Record<string, string> } {
  const fieldErrors: Record<string, string> = {};
  const customerId = requiredUuid(formData, "customer_id");
  const jobSiteId = requiredUuid(formData, "job_site_id");
  const materialId = requiredUuid(formData, "material_id");
  const taxRateId = optionalUuid(formData, "tax_rate_id");
  const quoteDate = requiredDate(formData, "quote_date");
  const expiresAt = requiredDate(formData, "expires_at");
  const jobStartDate = optionalDate(formData, "job_start_date");
  const jobEndDate = optionalDate(formData, "job_end_date");
  const accountType = requiredAccountType(formData, "account_type");
  const projectStatus = requiredProjectStatus(formData, "project_status");
  const quantity = Number(getString(formData, "quantity"));
  const lineItems = parseLineItems(formData, fieldErrors);
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
  if (!lineItems.length && !materialId) {
    fieldErrors.material_id = "Select a material.";
  }

  if (
    !lineItems.length &&
    (!Number.isFinite(quantity) || quantity <= 0 || quantity > 100000)
  ) {
    fieldErrors.quantity = "Quantity must be greater than zero.";
  }

  if (!customerId) {
    fieldErrors.customer_id = "Select an existing customer.";
  }

  if (!jobSiteId) {
    fieldErrors.job_site_id = "Select an existing job site.";
  }

  if (!quoteDate) {
    fieldErrors.quote_date = "Quote date is required.";
  }

  if (!expiresAt) {
    fieldErrors.expires_at = "Expiration date is required.";
  }

  if (quoteDate && expiresAt && expiresAt < quoteDate) {
    fieldErrors.expires_at = "Expiration date cannot be before the quote date.";
  }

  if (jobStartDate && jobEndDate && jobEndDate < jobStartDate) {
    fieldErrors.job_end_date = "Job end date cannot be before the job start date.";
  }

  if (!accountType) {
    fieldErrors.account_type = "Select a customer type.";
  }

  if (!projectStatus) {
    fieldErrors.project_status = "Select a project status.";
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
    quoteDate,
    expiresAt,
    jobStartDate,
    jobEndDate,
    followupMaxAttempts: null,
    accountType: accountType || "contractor",
    projectStatus: projectStatus || "bid",
    quantity,
    lineItems,
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

function parseLineItems(
  formData: FormData,
  fieldErrors: Record<string, string>,
): CreateQuoteDraftLineInput[] {
  const rawValue = getString(formData, "line_items");

  if (!rawValue) {
    return [];
  }

  let parsed: unknown;

  try {
    parsed = JSON.parse(rawValue);
  } catch {
    fieldErrors.line_items = "Quote lines are not valid.";
    return [];
  }

  if (!Array.isArray(parsed)) {
    fieldErrors.line_items = "Quote lines are not valid.";
    return [];
  }

  const lineItems: CreateQuoteDraftLineInput[] = [];

  parsed.slice(0, 50).forEach((item, index) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      fieldErrors.line_items = "Quote lines are not valid.";
      return;
    }

    const materialId =
      typeof item.materialId === "string" && UUID_PATTERN.test(item.materialId)
        ? item.materialId
        : "";
    const quantity = Number(item.quantity);
    const markupPctOverride = Number(item.markupPctOverride);

    if (!materialId) {
      fieldErrors.line_items = `Line ${index + 1} is missing a material.`;
      return;
    }

    if (!Number.isFinite(quantity) || quantity <= 0 || quantity > 100000) {
      fieldErrors.line_items = `Line ${index + 1} has an invalid quantity.`;
      return;
    }

    if (!Number.isFinite(markupPctOverride) || markupPctOverride < 0 || markupPctOverride > 500) {
      fieldErrors.line_items = `Line ${index + 1} has an invalid markup percentage.`;
      return;
    }

    lineItems.push({
      materialId,
      quantity: Math.round((quantity + Number.EPSILON) * 100) / 100,
      markupPctOverride: Math.round((markupPctOverride + Number.EPSILON) * 100) / 100,
    });
  });

  if (parsed.length > 50) {
    fieldErrors.line_items = "A quote can include up to 50 lines.";
  }

  return lineItems;
}

function getString(formData: FormData, key: string): string {
  const value = formData.get(key);

  return typeof value === "string" ? value.trim() : "";
}

function formDataObject(formData: FormData): Record<string, FormDataEntryValue> {
  return Object.fromEntries(formData.entries());
}

function inlineJobSiteError(
  message: string,
  error?: z.ZodError,
  fieldErrors: Record<string, string> = {},
): CreateQuoteJobSiteResult {
  return {
    status: "error",
    message,
    fieldErrors: error ? flattenFieldErrors(error) : fieldErrors,
  };
}

function flattenFieldErrors(error: z.ZodError): Record<string, string> {
  const fieldErrors: Record<string, string> = {};

  for (const issue of error.issues) {
    const field = String(issue.path[0] ?? "form");

    fieldErrors[field] ??= issue.message;
  }

  return fieldErrors;
}

function optionalUuid(formData: FormData, key: string): string {
  const value = getString(formData, key);

  return value && UUID_PATTERN.test(value) ? value : "";
}

function requiredUuid(formData: FormData, key: string): string {
  const value = getString(formData, key);

  return UUID_PATTERN.test(value) ? value : "";
}

function requiredDate(formData: FormData, key: string): string {
  const value = getString(formData, key);

  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return "";
  }

  const date = new Date(`${value}T00:00:00.000Z`);

  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
    ? value
    : "";
}

function optionalDate(formData: FormData, key: string): string | null {
  const value = getString(formData, key);

  if (!value) {
    return null;
  }

  return requiredDate(formData, key) || null;
}

function requiredAccountType(
  formData: FormData,
  key: string,
): QuoteAccountType | "" {
  const value = getString(formData, key);

  return /^[a-z0-9_]{1,80}$/.test(value) ? value : "";
}

function requiredProjectStatus(
  formData: FormData,
  key: string,
): QuoteProjectStatus | "" {
  const value = getString(formData, key);

  return /^[a-z0-9_]{1,60}$/.test(value) ? value : "";
}

function parseCoordinatePair(
  latitudeValue: string,
  longitudeValue: string,
):
  | {
      ok: true;
      coordinates: { latitude: number; longitude: number } | null;
    }
  | { ok: false; field: "latitude" | "longitude"; message: string } {
  if (!latitudeValue && !longitudeValue) {
    return { ok: true, coordinates: null };
  }

  if (!latitudeValue || !longitudeValue) {
    return {
      ok: false,
      field: latitudeValue ? "longitude" : "latitude",
      message: "Latitude and longitude must be saved together.",
    };
  }

  const latitude = Number(latitudeValue);
  const longitude = Number(longitudeValue);

  if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90) {
    return {
      ok: false,
      field: "latitude",
      message: "Latitude is out of range.",
    };
  }

  if (!Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
    return {
      ok: false,
      field: "longitude",
      message: "Longitude is out of range.",
    };
  }

  return {
    ok: true,
    coordinates: {
      latitude: Math.round((latitude + Number.EPSILON) * 10000000) / 10000000,
      longitude:
        Math.round((longitude + Number.EPSILON) * 10000000) / 10000000,
    },
  };
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
