"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { getCurrentUser } from "@/lib/auth/current-user";
import { logAction } from "@/lib/audit/log-action";
import { geocodeJobSiteAddress } from "@/lib/geo/geocode";
import { getMapboxIntegration } from "@/lib/integrations/mapbox";
import { importCrmLeadCsv } from "@/lib/customers/crm";
import { createClient } from "@/lib/supabase/server";

type CustomerRecord = {
  id: string;
  name: string;
};

type CustomerUpdateRecord = CustomerRecord & {
  company_name: string | null;
  contact_name: string | null;
  email: string | null;
  phone: string | null;
  address: Record<string, unknown>;
  payment_terms: string | null;
  pricing_notes: string | null;
  default_plant_id: string | null;
  is_active: boolean;
};

type JobSiteRecord = {
  id: string;
  name: string;
  customer_id: string;
};

type CrmCompanyUpdateRecord = {
  id: string;
  name: string;
  domain: string | null;
  email: string | null;
  phone: string | null;
};

type CrmContactUpdateRecord = {
  id: string;
  company_id: string | null;
  full_name: string;
  title: string | null;
  email: string | null;
  phone: string | null;
};

type CrmDealUpdateRecord = {
  id: string;
  company_id: string | null;
  contact_id: string | null;
  title: string;
  stage: "new" | "qualified" | "quoted" | "won" | "lost";
  value: number;
  expected_close_date: string | null;
  is_active: boolean;
};

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const updateCrmDealSchema = z.object({
  deal_id: z.string().uuid(),
  company_name: z.string().trim().min(1, "Company name is required.").max(160),
  company_domain: z.string().trim().max(160).optional().default(""),
  company_email: z.string().trim().email("Enter a valid company email.").optional().or(z.literal("")),
  company_phone: z.string().trim().max(40).optional().default(""),
  contact_name: z.string().trim().max(160).optional().default(""),
  contact_title: z.string().trim().max(120).optional().default(""),
  contact_email: z.string().trim().email("Enter a valid contact email.").optional().or(z.literal("")),
  contact_phone: z.string().trim().max(40).optional().default(""),
  deal_title: z.string().trim().min(1, "Deal title is required.").max(180),
  value: z.coerce.number().min(0, "Deal value must be zero or more.").max(999999999),
  expected_close_date: z.string().trim().max(20).optional().default(""),
  is_active: z.boolean(),
});

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

const updateCustomerSchema = customerSchema.extend({
  customer_id: z.string().regex(UUID_PATTERN, "Select a valid customer."),
  is_active: z.boolean(),
});

const jobSiteSchema = z.object({
  customer_id: z
    .string()
    .regex(UUID_PATTERN, "Select a customer."),
  name: z.string().trim().min(1, "Site name is required.").max(160),
  line1: z.string().trim().max(240).optional().default(""),
  city: z.string().trim().min(1, "City is required.").max(120),
  county: z.string().trim().min(1, "County is required.").max(120),
  postal_code: z.string().trim().max(20).optional().default(""),
  mapbox_id: z.string().trim().max(240).optional().default(""),
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

export type CrmEditFormState = {
  message: string;
  status: "idle" | "success" | "error";
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
        payment_terms: paymentTerms || "COD",
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
      payment_terms: paymentTerms || "COD",
      pricing_notes: pricingNotes || null,
      default_plant_id: defaultPlantId || null,
    },
  });

  revalidatePath("/customers");
  redirect("/customers");
}

export async function updateCustomer(
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

  const parsed = updateCustomerSchema.safeParse({
    ...formDataObject(formData),
    is_active: formData.get("is_active") === "on",
  });

  if (!parsed.success) {
    return formError("Fix the highlighted customer fields.", parsed.error);
  }

  const {
    customer_id: customerId,
    name,
    company_name: companyName,
    contact_name: contactName,
    email,
    phone,
    address: addressLine,
    payment_terms: paymentTerms,
    pricing_notes: pricingNotes,
    default_plant_id: defaultPlantId,
    is_active: isActive,
  } = parsed.data;

  const { data: before } = await supabase
    .from("customers")
    .select(
      "id, name, company_name, contact_name, email, phone, address, payment_terms, pricing_notes, default_plant_id, is_active",
    )
    .eq("organization_id", user.organization_id)
    .eq("id", customerId)
    .single<CustomerUpdateRecord>();

  if (!before) {
    return formError("Selected customer was not found.");
  }

  const { data: after, error } = await supabase
    .from("customers")
    .update({
      name,
      company_name: companyName || name,
      contact_name: contactName || null,
      email: email || null,
      phone: phone || null,
      address: {
        line1: addressLine || null,
      },
      payment_terms: paymentTerms || "COD",
      pricing_notes: pricingNotes || null,
      default_plant_id: defaultPlantId || null,
      is_active: isActive,
    })
    .eq("organization_id", user.organization_id)
    .eq("id", customerId)
    .select(
      "id, name, company_name, contact_name, email, phone, address, payment_terms, pricing_notes, default_plant_id, is_active",
    )
    .single<CustomerUpdateRecord>();

  if (error || !after) {
    return formError(error?.message ?? "Could not update customer.");
  }

  await logAction({
    user,
    action: "customer.updated",
    targetTable: "customers",
    targetId: after.id,
    before,
    after,
  });

  revalidatePath("/customers");
  redirect(`/customers?customer=${after.id}`);
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
    postal_code: postalCode,
    mapbox_id: mapboxId,
  } = parsed.data;

  if ((latitude === null) !== (longitude === null)) {
    return formError("Fix the highlighted job site fields.", undefined, {
      latitude: "Latitude and longitude must be saved together.",
      longitude: "Latitude and longitude must be saved together.",
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
    return formError("Selected customer was not found.", undefined, {
      customer_id: "Select an active customer.",
    });
  }

  const mapboxIntegration =
    latitude === null && longitude === null
      ? await getMapboxIntegration({
          supabase,
          organizationId: user.organization_id,
        })
      : null;
  const geocoded =
    latitude === null && longitude === null
      ? await geocodeJobSiteAddress({
          line1,
          city,
          county,
          state,
          apiKey:
            mapboxIntegration?.isEnabled && mapboxIntegration.publicAccessToken
              ? mapboxIntegration.publicAccessToken
              : null,
        })
      : null;
  const resolvedLatitude = latitude ?? geocoded?.latitude ?? null;
  const resolvedLongitude = longitude ?? geocoded?.longitude ?? null;

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
        latitude: resolvedLatitude,
        longitude: resolvedLongitude,
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
      latitude: resolvedLatitude,
      longitude: resolvedLongitude,
      location_source: latitude !== null && longitude !== null ? "mapbox" : "geocoder",
    },
  });

  revalidatePath("/customers");
  redirect("/customers");
}

export async function importCrmLeads(formData: FormData) {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/login");
  }

  if (user.role !== "admin" && user.role !== "account_manager") {
    return;
  }

  const csv = getString(formData, "crm_csv");
  const sourceName = getString(formData, "crm_source_name") || "CSV import";

  if (!csv) {
    redirect("/customers?crm_import=empty");
  }

  const result = await importCrmLeadCsv({
    user,
    csv,
    sourceName,
  });

  await logAction({
    user,
    action: "crm.csv_import.completed",
    targetTable: "crm_lead_captures",
    before: null,
    after: result,
    metadata: {
      source_name: sourceName,
    },
  });

  revalidatePath("/customers");
  redirect(`/customers?crm_import=${result.imported}&crm_failed=${result.failed}`);
}

export async function updateCrmDealDetails(
  _previousState: CrmEditFormState,
  formData: FormData,
): Promise<CrmEditFormState> {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/login");
  }

  if (user.role !== "admin" && user.role !== "account_manager") {
    return crmFormError("Only admins and account managers can edit CRM deals.");
  }

  const supabase = await createClient();

  if (!supabase) {
    return crmFormError("Supabase is not configured.");
  }

  const parsed = updateCrmDealSchema.safeParse({
    ...formDataObject(formData),
    is_active: formData.get("is_active") === "on",
  });

  if (!parsed.success) {
    return crmFormError("Fix the highlighted CRM fields.", parsed.error);
  }

  const input = parsed.data;
  const { data: beforeDeal } = await supabase
    .from("crm_deals")
    .select(
      "id, company_id, contact_id, title, stage, value, expected_close_date, is_active",
    )
    .eq("organization_id", user.organization_id)
    .eq("id", input.deal_id)
    .single<CrmDealUpdateRecord>();

  if (!beforeDeal) {
    return crmFormError("Selected CRM deal was not found.");
  }

  let nextContactId = beforeDeal.contact_id;

  if (beforeDeal.company_id) {
    const { data: beforeCompany } = await supabase
      .from("crm_companies")
      .select("id, name, domain, email, phone")
      .eq("organization_id", user.organization_id)
      .eq("id", beforeDeal.company_id)
      .single<CrmCompanyUpdateRecord>();

    if (beforeCompany) {
      const { data: afterCompany, error } = await supabase
        .from("crm_companies")
        .update({
          name: input.company_name,
          domain: input.company_domain || null,
          email: input.company_email || null,
          phone: input.company_phone || null,
          updated_by: user.id,
        })
        .eq("organization_id", user.organization_id)
        .eq("id", beforeCompany.id)
        .select("id, name, domain, email, phone")
        .single<CrmCompanyUpdateRecord>();

      if (error || !afterCompany) {
        return crmFormError(error?.message ?? "Could not update CRM company.");
      }

      await logAction({
        user,
        action: "crm.company.updated",
        targetTable: "crm_companies",
        targetId: afterCompany.id,
        before: beforeCompany,
        after: afterCompany,
        supabase,
      });
    }
  }

  const hasContactInput = Boolean(
    input.contact_name ||
      input.contact_title ||
      input.contact_email ||
      input.contact_phone,
  );

  if (beforeDeal.contact_id) {
    const { data: beforeContact } = await supabase
      .from("crm_contacts")
      .select("id, company_id, full_name, title, email, phone")
      .eq("organization_id", user.organization_id)
      .eq("id", beforeDeal.contact_id)
      .single<CrmContactUpdateRecord>();

    if (beforeContact) {
      const { data: afterContact, error } = await supabase
        .from("crm_contacts")
        .update({
          full_name: input.contact_name || input.contact_email || "Unknown contact",
          title: input.contact_title || null,
          email: input.contact_email || null,
          phone: input.contact_phone || null,
          updated_by: user.id,
        })
        .eq("organization_id", user.organization_id)
        .eq("id", beforeContact.id)
        .select("id, company_id, full_name, title, email, phone")
        .single<CrmContactUpdateRecord>();

      if (error || !afterContact) {
        return crmFormError(error?.message ?? "Could not update CRM contact.");
      }

      await logAction({
        user,
        action: "crm.contact.updated",
        targetTable: "crm_contacts",
        targetId: afterContact.id,
        before: beforeContact,
        after: afterContact,
        supabase,
      });
    }
  } else if (hasContactInput) {
    const { data: afterContact, error } = await supabase
      .from("crm_contacts")
      .insert({
        organization_id: user.organization_id,
        company_id: beforeDeal.company_id,
        full_name: input.contact_name || input.contact_email || "Unknown contact",
        title: input.contact_title || null,
        email: input.contact_email || null,
        phone: input.contact_phone || null,
        source: "manual",
        is_primary: true,
        is_active: true,
        created_by: user.id,
        updated_by: user.id,
      })
      .select("id, company_id, full_name, title, email, phone")
      .single<CrmContactUpdateRecord>();

    if (error || !afterContact) {
      return crmFormError(error?.message ?? "Could not create CRM contact.");
    }

    nextContactId = afterContact.id;

    await logAction({
      user,
      action: "crm.contact.created",
      targetTable: "crm_contacts",
      targetId: afterContact.id,
      before: null,
      after: afterContact,
      supabase,
    });
  }

  const { data: afterDeal, error } = await supabase
    .from("crm_deals")
    .update({
      contact_id: nextContactId,
      title: input.deal_title,
      value: input.value,
      expected_close_date: normalizeOptionalDate(input.expected_close_date),
      is_active: input.is_active,
      updated_by: user.id,
    })
    .eq("organization_id", user.organization_id)
    .eq("id", beforeDeal.id)
    .select(
      "id, company_id, contact_id, title, stage, value, expected_close_date, is_active",
    )
    .single<CrmDealUpdateRecord>();

  if (error || !afterDeal) {
    return crmFormError(error?.message ?? "Could not update CRM deal.");
  }

  await logAction({
    user,
    action: "crm.deal.updated",
    targetTable: "crm_deals",
    targetId: afterDeal.id,
    before: beforeDeal,
    after: afterDeal,
    supabase,
  });

  revalidatePath("/customers");
  revalidatePath("/dashboard");

  return {
    message: "CRM deal updated.",
    status: "success",
    fieldErrors: {},
  };
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

function crmFormError(
  message: string,
  error?: z.ZodError,
): CrmEditFormState {
  return {
    message,
    status: "error",
    fieldErrors: error ? flattenFieldErrors(error) : {},
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

function normalizeOptionalDate(value: string): string | null {
  if (!value) {
    return null;
  }

  const date = new Date(value);

  return Number.isFinite(date.getTime()) ? date.toISOString().slice(0, 10) : null;
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
