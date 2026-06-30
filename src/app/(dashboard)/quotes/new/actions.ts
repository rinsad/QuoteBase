"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { logAction } from "@/lib/audit/log-action";
import { getCurrentUser } from "@/lib/auth/current-user";
import { geocodeJobSiteAddress } from "@/lib/geo/geocode";
import { getGoogleMapsIntegration } from "@/lib/integrations/google-maps";
import {
  createQuoteDraftRecord,
  type CreateQuoteDraftInput,
  type CreateQuoteDraftLineInput,
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

  const { customer_id: customerId, name, line1, city, county, state } =
    parsed.data;
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

  const googleMapsIntegration = await getGoogleMapsIntegration({
    supabase,
    organizationId: user.organization_id,
  });
  const geocoded = await geocodeJobSiteAddress({
    line1,
    city,
    county,
    state,
    apiKey:
      googleMapsIntegration?.isEnabled && googleMapsIntegration.apiKey
        ? googleMapsIntegration.apiKey
        : null,
  });
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
      geocoded_from_address: Boolean(geocoded),
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
    const materialUnitPriceOverride =
      item.materialUnitPriceOverride === null ||
      item.materialUnitPriceOverride === undefined
        ? null
        : Number(item.materialUnitPriceOverride);

    if (!materialId) {
      fieldErrors.line_items = `Line ${index + 1} is missing a material.`;
      return;
    }

    if (!Number.isFinite(quantity) || quantity <= 0 || quantity > 100000) {
      fieldErrors.line_items = `Line ${index + 1} has an invalid quantity.`;
      return;
    }

    if (
      materialUnitPriceOverride !== null &&
      (!Number.isFinite(materialUnitPriceOverride) ||
        materialUnitPriceOverride <= 0)
    ) {
      fieldErrors.line_items = `Line ${index + 1} has an invalid sell price override.`;
      return;
    }

    lineItems.push({
      materialId,
      quantity: Math.round((quantity + Number.EPSILON) * 100) / 100,
      materialUnitPriceOverride:
        materialUnitPriceOverride === null
          ? null
          : Math.round((materialUnitPriceOverride + Number.EPSILON) * 100) / 100,
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
