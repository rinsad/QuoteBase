"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { submitCreditApplicationByToken } from "@/lib/quotes/credit-applications";

export async function submitCreditApplication(token: string, formData: FormData) {
  const signatureName = getString(formData, "signature_name");
  const signatureTitle = getString(formData, "signature_title");

  if (!signatureName || !signatureTitle) {
    redirectWithError(token, "Signature name and title are required.");
  }

  const requestHeaders = await headers();
  const result = await submitCreditApplicationByToken({
    token,
    signatureName,
    signatureTitle,
    requestIp:
      requestHeaders.get("x-forwarded-for")?.split(",")[0]?.trim() ??
      requestHeaders.get("x-real-ip"),
    userAgent: requestHeaders.get("user-agent"),
    applicationData: {
      company_name: getString(formData, "company_name"),
      office_address: getString(formData, "office_address"),
      mailing_address: getString(formData, "mailing_address"),
      office_telephone: getString(formData, "office_telephone"),
      fax: getString(formData, "fax"),
      business_type: getString(formData, "business_type"),
      federal_tax_id: getString(formData, "federal_tax_id"),
      contractor_license: getString(formData, "contractor_license"),
      business_email: getString(formData, "business_email"),
      company_website: getString(formData, "company_website"),
      dun_bradstreet: getString(formData, "dun_bradstreet"),
      in_business_since: getString(formData, "in_business_since"),
      uses_po_number: getString(formData, "uses_po_number"),
      uses_job_number: getString(formData, "uses_job_number"),
      purchasing_agents: getString(formData, "purchasing_agents"),
      purchasing_agent_emails: getString(formData, "purchasing_agent_emails"),
      order_frequency: getString(formData, "order_frequency"),
      common_materials: getString(formData, "common_materials"),
      special_procedures: getString(formData, "special_procedures"),
      principals: [1, 2].map((index) => ({
        name: getString(formData, `principal_${index}_name`),
        title: getString(formData, `principal_${index}_title`),
        telephone: getString(formData, `principal_${index}_telephone`),
        home_address: getString(formData, `principal_${index}_home_address`),
        ssn_last4: getString(formData, `principal_${index}_ssn_last4`),
      })),
      bank: {
        name: getString(formData, "bank_name"),
        address: getString(formData, "bank_address"),
        account_number_last4: getString(formData, "bank_account_last4"),
        contact_title: getString(formData, "bank_contact_title"),
      },
      credit_requirement_monthly: getString(
        formData,
        "credit_requirement_monthly",
      ),
      subject_to_sales_tax: getString(formData, "subject_to_sales_tax"),
      resale_number: getString(formData, "resale_number"),
      trade_references: [1, 2, 3, 4, 5].map((index) => ({
        name: getString(formData, `trade_${index}_name`),
        telephone: getString(formData, `trade_${index}_telephone`),
        fax: getString(formData, `trade_${index}_fax`),
        average_balance: getString(formData, `trade_${index}_average_balance`),
        contact: getString(formData, `trade_${index}_contact`),
      })),
      sued_by_vendors: getString(formData, "sued_by_vendors"),
      vendor_lawsuit_explanation: getString(
        formData,
        "vendor_lawsuit_explanation",
      ),
      credit_terms_initials_page_1: getString(
        formData,
        "credit_terms_initials_page_1",
      ),
      credit_terms_initials_page_2: getString(
        formData,
        "credit_terms_initials_page_2",
      ),
      credit_terms_initials_page_3: getString(
        formData,
        "credit_terms_initials_page_3",
      ),
      personal_guaranty_name: getString(formData, "personal_guaranty_name"),
      personal_guaranty_signature: getString(
        formData,
        "personal_guaranty_signature",
      ),
      personal_guaranty_date: getString(formData, "personal_guaranty_date"),
    },
  });

  if (!result.ok) {
    redirectWithError(token, result.message);
  }

  redirect(`/ca/${encodeURIComponent(token)}?submitted=1`);
}

function getString(formData: FormData, key: string): string {
  const value = formData.get(key);

  return typeof value === "string" ? value.trim() : "";
}

function redirectWithError(token: string, message: string): never {
  redirect(`/ca/${encodeURIComponent(token)}?error=${encodeURIComponent(message)}`);
}
