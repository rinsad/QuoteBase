import { createClient } from "@/lib/supabase/server";

export type QuoteBranding = {
  id: string;
  company_name: string;
  logo_url: string | null;
  address_line1: string;
  address_line2: string | null;
  city: string;
  state: string;
  postal_code: string;
  country: string;
  phone: string;
  footer_note: string | null;
  disclaimer: string;
  updated_at: string;
};

export type QuoteBrandingResult = {
  branding: QuoteBranding;
  setupRequired: boolean;
  setupMessage: string | null;
};

export async function getQuoteBranding(
  organizationId: string,
): Promise<QuoteBrandingResult | null> {
  const supabase = await createClient();

  if (!supabase) {
    return null;
  }

  const { data, error } = await supabase
    .from("quote_branding")
    .select(
      "id, company_name, logo_url, address_line1, address_line2, city, state, postal_code, country, phone, footer_note, disclaimer, updated_at",
    )
    .eq("organization_id", organizationId)
    .maybeSingle<QuoteBranding>();

  if (error) {
    return {
      branding: defaultQuoteBranding(),
      setupRequired: true,
      setupMessage:
        "Quote branding database setup is pending. Apply the Supabase migration before saving changes.",
    };
  }

  if (!data) {
    return {
      branding: defaultQuoteBranding(),
      setupRequired: true,
      setupMessage:
        "Quote branding defaults are shown. Apply the Supabase migration to save tenant-specific settings.",
    };
  }

  return {
    branding: data,
    setupRequired: false,
    setupMessage: null,
  };
}

function defaultQuoteBranding(): QuoteBranding {
  return {
    id: "pending-setup",
    company_name: "QuoteBase",
    logo_url: null,
    address_line1: "",
    address_line2: null,
    city: "",
    state: "",
    postal_code: "",
    country: "United States",
    phone: "",
    footer_note: null,
    disclaimer:
      "All quotes are valid for 30 days. All materials quoted are subject to availability. This estimated price is subject to change at any time. All prices include material, tax and freight unless otherwise specified. Delivery minimums, standby time, returned materials, restocking, fuel, environmental, and other applicable charges follow the current approved quote configuration and customer terms. Once customer orders materials, and material are loaded into the truck at the plant, the customer owns the material and is responsible for the payment; FOB Shipping Point. All invoices are due according to approved payment terms. Late balances may be subject to service charges, collection costs, and attorney fees where permitted. Upon acceptance of this quote, buyer may be required to sign this quote, complete credit documentation, and provide preliminary lien notice information prior to the commencement of delivery.",
    updated_at: new Date(0).toISOString(),
  };
}
