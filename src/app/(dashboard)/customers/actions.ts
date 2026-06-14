"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { getCurrentUser } from "@/lib/auth/current-user";
import { logAction } from "@/lib/audit/log-action";
import { pushCustomerToPipedrive } from "@/lib/integrations/pipedrive";
import { createClient } from "@/lib/supabase/server";

type CustomerRecord = {
  id: string;
  name: string;
};

type JobSiteRecord = {
  id: string;
  name: string;
  customer_id: string;
};

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const customerSchema = z.object({
  name: z.string().trim().min(1, "Customer name is required.").max(160),
  company_name: z.string().trim().max(160).optional().default(""),
  contact_name: z.string().trim().max(160).optional().default(""),
  email: z.string().trim().email("Enter a valid email.").optional().or(z.literal("")),
  phone: z.string().trim().max(40).optional().default(""),
  address: z.string().trim().max(240).optional().default(""),
  payment_terms: z.string().trim().max(80).optional().default(""),
  pricing_notes: z.string().trim().max(1000).optional().default(""),
  default_plant_id: z
    .string()
    .regex(UUID_PATTERN, "Select a valid default plant.")
    .optional()
    .or(z.literal("")),
});

const jobSiteSchema = z.object({
  customer_id: z
    .string()
    .regex(UUID_PATTERN, "Select a customer."),
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
  latitude: z
    .string()
    .trim()
    .optional()
    .or(z.literal(""))
    .transform((value) => optionalNumber(value, -90, 90))
    .refine((value) => value !== undefined, "Latitude must be between -90 and 90."),
  longitude: z
    .string()
    .trim()
    .optional()
    .or(z.literal(""))
    .transform((value) => optionalNumber(value, -180, 180))
    .refine(
      (value) => value !== undefined,
      "Longitude must be between -180 and 180.",
    ),
});

export type CustomerFormState = {
  message: string;
  status: "idle" | "error";
  fieldErrors: Record<string, string>;
};

export async function createCustomer(
  _previousState: CustomerFormState,
  formData: FormData,
): Promise<CustomerFormState> {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/login");
  }

  const supabase = await createClient();

  if (!supabase) {
    return formError("Supabase is not configured for this workspace.");
  }

  const parsed = customerSchema.safeParse(formDataObject(formData));

  if (!parsed.success) {
    return formError("Fix the highlighted customer fields.", parsed.error);
  }

  const {
    name,
    company_name: companyName,
    contact_name: contactName,
    email,
    phone,
    address: addressLine,
    payment_terms: paymentTerms,
    pricing_notes: pricingNotes,
    default_plant_id: defaultPlantId,
  } = parsed.data;

  const { data: customer, error } = await supabase
    .from("customers")
    .upsert(
      {
        organization_id: user.organization_id,
        name,
        company_name: companyName || name,
        contact_name: contactName || null,
        email: email || null,
        phone: phone || null,
        address: {
          line1: addressLine || null,
        },
        payment_terms: paymentTerms || null,
        pricing_notes: pricingNotes || null,
        default_plant_id: defaultPlantId || null,
        is_active: true,
      },
      { onConflict: "organization_id,name" },
    )
    .select("id, name")
    .single<CustomerRecord>();

  if (error || !customer) {
    return formError(error?.message ?? "Could not save customer.");
  }

  await logAction({
    user,
    action: "customer.saved",
    targetTable: "customers",
    targetId: customer.id,
    after: {
      name,
      company_name: companyName || name,
      contact_name: contactName || null,
      email: email || null,
      phone: phone || null,
      address: addressLine || null,
      payment_terms: paymentTerms || null,
      pricing_notes: pricingNotes || null,
      default_plant_id: defaultPlantId || null,
    },
  });

  await pushCustomerToPipedrive({
    supabase,
    user,
    customerId: customer.id,
  });

  revalidatePath("/customers");
  redirect("/customers");
}

export async function createJobSite(
  _previousState: CustomerFormState,
  formData: FormData,
): Promise<CustomerFormState> {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/login");
  }

  const supabase = await createClient();

  if (!supabase) {
    return formError("Supabase is not configured for this workspace.");
  }

  const parsed = jobSiteSchema.safeParse({
    ...formDataObject(formData),
    state: getString(formData, "state") || "CA",
  });

  if (!parsed.success) {
    return formError("Fix the highlighted job site fields.", parsed.error);
  }

  const {
    customer_id: customerId,
    name,
    line1,
    city,
    county,
    state,
    latitude,
    longitude,
  } = parsed.data;

  const { data: customer } = await supabase
    .from("customers")
    .select("id")
    .eq("organization_id", user.organization_id)
    .eq("id", customerId)
    .eq("is_active", true)
    .single<{ id: string }>();

  if (!customer) {
    return formError("Selected customer was not found.", undefined, {
      customer_id: "Select an active customer.",
    });
  }

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
        latitude,
        longitude,
        is_active: true,
      },
      { onConflict: "organization_id,customer_id,name" },
    )
    .select("id, name, customer_id")
    .single<JobSiteRecord>();

  if (error || !jobSite) {
    return formError(error?.message ?? "Could not save job site.");
  }

  await logAction({
    user,
    action: "job_site.saved",
    targetTable: "job_sites",
    targetId: jobSite.id,
    after: {
      customer_id: customer.id,
      name,
      city,
      county,
      state,
      latitude,
      longitude,
    },
  });

  revalidatePath("/customers");
  redirect("/customers");
}

function formDataObject(formData: FormData): Record<string, FormDataEntryValue> {
  return Object.fromEntries(formData.entries());
}

function formError(
  message: string,
  error?: z.ZodError,
  fieldErrors: Record<string, string> = {},
): CustomerFormState {
  return {
    message,
    status: "error",
    fieldErrors: {
      ...fieldErrors,
      ...(error ? flattenFieldErrors(error) : {}),
    },
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

function getString(formData: FormData, key: string): string {
  const value = formData.get(key);

  return typeof value === "string" ? value.trim() : "";
}

function optionalNumber(
  value: string | undefined,
  min: number,
  max: number,
): number | null | undefined {
  if (!value) {
    return null;
  }

  const numberValue = Number(value);

  if (!Number.isFinite(numberValue) || numberValue < min || numberValue > max) {
    return undefined;
  }

  return Math.round((numberValue + Number.EPSILON) * 10000000) / 10000000;
}
