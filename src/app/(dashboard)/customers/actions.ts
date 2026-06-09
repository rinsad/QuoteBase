"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

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

export async function createCustomer(formData: FormData) {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/login");
  }

  const supabase = await createClient();

  if (!supabase) {
    throw new Error("Supabase is not configured for this workspace.");
  }

  const name = getString(formData, "name");
  const companyName = getString(formData, "company_name");
  const contactName = getString(formData, "contact_name");
  const email = getString(formData, "email");
  const phone = getString(formData, "phone");
  const addressLine = getString(formData, "address");
  const paymentTerms = getString(formData, "payment_terms");
  const pricingNotes = getString(formData, "pricing_notes");
  const defaultPlantId = optionalUuid(formData, "default_plant_id");

  if (!name) {
    throw new Error("Customer name is required.");
  }

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
    throw new Error(error?.message ?? "Could not save customer.");
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

export async function createJobSite(formData: FormData) {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/login");
  }

  const supabase = await createClient();

  if (!supabase) {
    throw new Error("Supabase is not configured for this workspace.");
  }

  const customerId = requiredUuid(formData, "customer_id");
  const name = getString(formData, "name");
  const line1 = getString(formData, "line1");
  const city = getString(formData, "city");
  const county = getString(formData, "county");
  const state = getString(formData, "state") || "CA";
  const latitude = optionalCoordinate(formData, "latitude", -90, 90);
  const longitude = optionalCoordinate(formData, "longitude", -180, 180);

  if (!customerId || !name || !city || !county) {
    throw new Error("Customer, site name, city, and county are required.");
  }

  const { data: customer } = await supabase
    .from("customers")
    .select("id")
    .eq("organization_id", user.organization_id)
    .eq("id", customerId)
    .eq("is_active", true)
    .single<{ id: string }>();

  if (!customer) {
    throw new Error("Selected customer was not found.");
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
    throw new Error(error?.message ?? "Could not save job site.");
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

function getString(formData: FormData, key: string): string {
  const value = formData.get(key);

  return typeof value === "string" ? value.trim() : "";
}

function requiredUuid(formData: FormData, key: string): string {
  const value = getString(formData, key);

  return UUID_PATTERN.test(value) ? value : "";
}

function optionalUuid(formData: FormData, key: string): string | null {
  const value = getString(formData, key);

  if (!value) {
    return null;
  }

  if (!UUID_PATTERN.test(value)) {
    throw new Error(`${key} is invalid.`);
  }

  return value;
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
