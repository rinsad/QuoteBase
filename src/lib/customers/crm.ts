import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

import type { AppUser } from "@/lib/auth/current-user";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export type CrmCompany = {
  id: string;
  name: string;
  domain: string | null;
  phone: string | null;
  email: string | null;
  source: "manual" | "csv_import" | "web_form";
  lifecycle_stage: "lead" | "prospect" | "customer" | "inactive";
  is_active: boolean;
  contacts: CrmContact[];
  deals: CrmDeal[];
};

export type CrmContact = {
  id: string;
  company_id: string | null;
  full_name: string;
  title: string | null;
  email: string | null;
  phone: string | null;
  source: "manual" | "csv_import" | "web_form";
  is_primary: boolean;
  is_active: boolean;
};

export type CrmDeal = {
  id: string;
  company_id: string | null;
  contact_id: string | null;
  title: string;
  stage: "new" | "qualified" | "quoted" | "won" | "lost";
  value: number;
  expected_close_date: string | null;
  source: "manual" | "csv_import" | "web_form";
  is_active: boolean;
  company_name: string | null;
  contact_name: string | null;
  contact_email: string | null;
  contact_phone: string | null;
};

export type CrmLeadCapture = {
  id: string;
  source: "csv_import" | "web_form";
  source_name: string | null;
  status: "captured" | "processed" | "failed";
  created_at: string;
};

export type CrmLiteSummary = {
  companies: CrmCompany[];
  contacts: CrmContact[];
  deals: CrmDeal[];
  captures: CrmLeadCapture[];
  counts: {
    companies: number;
    contacts: number;
    openDeals: number;
    capturedLeads: number;
  };
};

export type LeadInput = z.infer<typeof leadInputSchema>;

type CompanyRecord = Omit<CrmCompany, "contacts" | "deals">;

type DealRecord = Omit<
  CrmDeal,
  "value" | "company_name" | "contact_name" | "contact_email" | "contact_phone"
> & {
  value: number;
  crm_companies: { name: string } | { name: string }[] | null;
  crm_contacts:
    | { full_name: string; email: string | null; phone: string | null }
    | { full_name: string; email: string | null; phone: string | null }[]
    | null;
};

type LeadProcessResult = {
  companyId: string | null;
  contactId: string | null;
  dealId: string | null;
};

export const leadInputSchema = z.object({
  company_name: z.string().trim().min(1).max(160),
  contact_name: z.string().trim().max(160).optional().default(""),
  title: z.string().trim().max(120).optional().default(""),
  email: z.string().trim().email().optional().or(z.literal("")),
  phone: z.string().trim().max(40).optional().default(""),
  domain: z.string().trim().max(160).optional().default(""),
  deal_title: z.string().trim().max(180).optional().default(""),
  deal_value: z.coerce.number().min(0).max(999999999).optional().default(0),
  expected_close_date: z.string().trim().max(20).optional().default(""),
  notes: z.string().trim().max(2000).optional().default(""),
  source_name: z.string().trim().max(160).optional().default(""),
});

export async function getCrmLiteSummary(
  user: AppUser,
): Promise<CrmLiteSummary> {
  const supabase = await createClient();

  if (!supabase) {
    return emptySummary();
  }

  const [companiesResult, contactsResult, dealsResult, capturesResult] =
    await Promise.all([
      supabase
        .from("crm_companies")
        .select("id, name, domain, phone, email, source, lifecycle_stage, is_active")
        .eq("organization_id", user.organization_id)
        .eq("is_active", true)
        .order("created_at", { ascending: false })
        .limit(50)
        .returns<CompanyRecord[]>(),
      supabase
        .from("crm_contacts")
        .select("id, company_id, full_name, title, email, phone, source, is_primary, is_active")
        .eq("organization_id", user.organization_id)
        .eq("is_active", true)
        .order("created_at", { ascending: false })
        .limit(100)
        .returns<CrmContact[]>(),
      supabase
        .from("crm_deals")
        .select("id, company_id, contact_id, title, stage, value, expected_close_date, source, is_active, crm_companies(name), crm_contacts(full_name, email, phone)")
        .eq("organization_id", user.organization_id)
        .eq("is_active", true)
        .order("created_at", { ascending: false })
        .limit(100)
        .returns<DealRecord[]>(),
      supabase
        .from("crm_lead_captures")
        .select("id, source, source_name, status, created_at")
        .eq("organization_id", user.organization_id)
        .order("created_at", { ascending: false })
        .limit(20)
        .returns<CrmLeadCapture[]>(),
    ]);

  const contacts = contactsResult.data ?? [];
  const deals =
    dealsResult.data?.map((deal) => {
      const company = relationOne(deal.crm_companies);
      const contact = relationOne(deal.crm_contacts);

      return {
        id: deal.id,
        company_id: deal.company_id,
        contact_id: deal.contact_id,
        title: deal.title,
        stage: deal.stage,
        value: Number(deal.value),
        expected_close_date: deal.expected_close_date,
        source: deal.source,
        is_active: deal.is_active,
        company_name: company?.name ?? null,
        contact_name: contact?.full_name ?? null,
        contact_email: contact?.email ?? null,
        contact_phone: contact?.phone ?? null,
      };
    }) ?? [];
  const companies =
    companiesResult.data?.map((company) => ({
      ...company,
      contacts: contacts.filter((contact) => contact.company_id === company.id),
      deals: deals.filter((deal) => deal.company_id === company.id),
    })) ?? [];

  return {
    companies,
    contacts,
    deals,
    captures: capturesResult.data ?? [],
    counts: {
      companies: companies.length,
      contacts: contacts.length,
      openDeals: deals.filter((deal) => !["won", "lost"].includes(deal.stage)).length,
      capturedLeads: capturesResult.data?.length ?? 0,
    },
  };
}

export async function importCrmLeadCsv({
  user,
  csv,
  sourceName,
}: {
  user: AppUser;
  csv: string;
  sourceName: string;
}): Promise<{ imported: number; failed: number }> {
  const supabase = await createClient();

  if (!supabase) {
    return { imported: 0, failed: 0 };
  }

  const rows = parseCsv(csv).slice(0, 250);
  let imported = 0;
  let failed = 0;

  for (const row of rows) {
    const parsed = leadInputSchema.safeParse({
      company_name: row.company_name ?? row.company ?? row.account ?? "",
      contact_name: row.contact_name ?? row.contact ?? row.name ?? "",
      title: row.title ?? "",
      email: row.email ?? "",
      phone: row.phone ?? "",
      domain: row.domain ?? row.website ?? "",
      deal_title: row.deal_title ?? row.deal ?? row.opportunity ?? "",
      deal_value: row.deal_value ?? row.value ?? row.amount ?? 0,
      expected_close_date: row.expected_close_date ?? row.close_date ?? "",
      notes: row.notes ?? "",
      source_name: sourceName,
    });

    if (!parsed.success) {
      failed += 1;
      continue;
    }

    const result = await processLead({
      supabase,
      organizationId: user.organization_id,
      userId: user.id,
      source: "csv_import",
      lead: parsed.data,
      rawPayload: row,
    });

    if (result) {
      imported += 1;
    } else {
      failed += 1;
    }
  }

  return { imported, failed };
}

export async function captureWebFormLead({
  organizationId,
  lead,
  rawPayload,
}: {
  organizationId: string;
  lead: LeadInput;
  rawPayload: Record<string, unknown>;
}): Promise<LeadProcessResult | null> {
  const supabase = createAdminClient();

  if (!supabase) {
    return null;
  }

  return processLead({
    supabase,
    organizationId,
    userId: null,
    source: "web_form",
    lead,
    rawPayload,
  });
}

export async function resolveOrganizationIdFromLeadPayload(
  payload: Record<string, unknown>,
): Promise<string | null> {
  const directId = stringValue(payload.organization_id);

  if (directId) {
    return directId;
  }

  const slug = stringValue(payload.organization_slug);

  if (!slug) {
    return null;
  }

  const supabase = createAdminClient();

  if (!supabase) {
    return null;
  }

  const { data } = await supabase
    .from("organizations")
    .select("id")
    .eq("slug", slug)
    .single<{ id: string }>();

  return data?.id ?? null;
}

async function processLead({
  supabase,
  organizationId,
  userId,
  source,
  lead,
  rawPayload,
}: {
  supabase: SupabaseClient;
  organizationId: string;
  userId: string | null;
  source: "csv_import" | "web_form";
  lead: LeadInput;
  rawPayload: Record<string, unknown>;
}): Promise<LeadProcessResult | null> {
  const company = await upsertCompany({
    supabase,
    organizationId,
    userId,
    source,
    lead,
  });

  if (!company) {
    return null;
  }

  const contact = await upsertContact({
    supabase,
    organizationId,
    userId,
    source,
    lead,
    companyId: company.id,
  });
  const deal = await upsertDeal({
    supabase,
    organizationId,
    userId,
    source,
    lead,
    companyId: company.id,
    contactId: contact?.id ?? null,
  });
  const capturePayload = {
    organization_id: organizationId,
    company_id: company.id,
    contact_id: contact?.id ?? null,
    deal_id: deal?.id ?? null,
    source,
    source_name: lead.source_name || null,
    raw_payload: rawPayload,
    status: "processed",
    created_by: userId,
  };

  await supabase.from("crm_lead_captures").insert(capturePayload);
  await supabase.from("audit_log").insert({
    organization_id: organizationId,
    user_id: userId,
    action: `crm.lead.${source}.captured`,
    target_table: "crm_lead_captures",
    target_id: null,
    before_value: null,
    after_value: {
      company_id: company.id,
      contact_id: contact?.id ?? null,
      deal_id: deal?.id ?? null,
      source,
    },
    metadata: {
      source_name: lead.source_name || null,
    },
  });

  return {
    companyId: company.id,
    contactId: contact?.id ?? null,
    dealId: deal?.id ?? null,
  };
}

async function upsertCompany({
  supabase,
  organizationId,
  userId,
  source,
  lead,
}: {
  supabase: SupabaseClient;
  organizationId: string;
  userId: string | null;
  source: "csv_import" | "web_form";
  lead: LeadInput;
}): Promise<{ id: string } | null> {
  const { data } = await supabase
    .from("crm_companies")
    .upsert(
      {
        organization_id: organizationId,
        name: lead.company_name,
        domain: lead.domain || null,
        phone: lead.phone || null,
        email: lead.email || null,
        source,
        lifecycle_stage: "lead",
        notes: lead.notes || null,
        is_active: true,
        created_by: userId,
        updated_by: userId,
      },
      { onConflict: "organization_id,name" },
    )
    .select("id")
    .single<{ id: string }>();

  return data ?? null;
}

async function upsertContact({
  supabase,
  organizationId,
  userId,
  source,
  lead,
  companyId,
}: {
  supabase: SupabaseClient;
  organizationId: string;
  userId: string | null;
  source: "csv_import" | "web_form";
  lead: LeadInput;
  companyId: string;
}): Promise<{ id: string } | null> {
  if (!lead.contact_name && !lead.email) {
    return null;
  }

  const contactPayload = {
    organization_id: organizationId,
    company_id: companyId,
    full_name: lead.contact_name || lead.email || "Unknown contact",
    title: lead.title || null,
    email: lead.email || null,
    phone: lead.phone || null,
    source,
    is_primary: true,
    is_active: true,
    created_by: userId,
    updated_by: userId,
  };

  if (lead.email) {
    const { data: existing } = await supabase
      .from("crm_contacts")
      .select("id")
      .eq("organization_id", organizationId)
      .eq("email", lead.email)
      .eq("is_active", true)
      .maybeSingle<{ id: string }>();

    if (existing) {
      const { data } = await supabase
        .from("crm_contacts")
        .update(contactPayload)
        .eq("organization_id", organizationId)
        .eq("id", existing.id)
        .select("id")
        .single<{ id: string }>();

      return data ?? null;
    }
  }

  const { data } = await supabase
    .from("crm_contacts")
    .insert(contactPayload)
    .select("id")
    .single<{ id: string }>();

  return data ?? null;
}

async function upsertDeal({
  supabase,
  organizationId,
  userId,
  source,
  lead,
  companyId,
  contactId,
}: {
  supabase: SupabaseClient;
  organizationId: string;
  userId: string | null;
  source: "csv_import" | "web_form";
  lead: LeadInput;
  companyId: string;
  contactId: string | null;
}): Promise<{ id: string } | null> {
  const title = lead.deal_title || `${lead.company_name} lead`;
  const { data } = await supabase
    .from("crm_deals")
    .insert({
      organization_id: organizationId,
      company_id: companyId,
      contact_id: contactId,
      title,
      stage: "new",
      value: lead.deal_value,
      expected_close_date: normalizeDate(lead.expected_close_date),
      source,
      notes: lead.notes || null,
      is_active: true,
      created_by: userId,
      updated_by: userId,
    })
    .select("id")
    .single<{ id: string }>();

  return data ?? null;
}

function parseCsv(csv: string): Array<Record<string, string>> {
  const rows = parseCsvRows(csv);

  if (rows.length < 2) {
    return [];
  }

  const headers = rows[0].map((header) => normalizeHeader(header));

  return rows.slice(1).map((row) => {
    const record: Record<string, string> = {};

    headers.forEach((header, index) => {
      if (header) {
        record[header] = row[index]?.trim() ?? "";
      }
    });

    return record;
  });
}

function parseCsvRows(csv: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;

  for (let index = 0; index < csv.length; index += 1) {
    const char = csv[index];
    const next = csv[index + 1];

    if (char === '"' && next === '"') {
      cell += '"';
      index += 1;
      continue;
    }

    if (char === '"') {
      inQuotes = !inQuotes;
      continue;
    }

    if (char === "," && !inQuotes) {
      row.push(cell);
      cell = "";
      continue;
    }

    if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && next === "\n") {
        index += 1;
      }
      row.push(cell);
      if (row.some((value) => value.trim())) {
        rows.push(row);
      }
      row = [];
      cell = "";
      continue;
    }

    cell += char;
  }

  row.push(cell);
  if (row.some((value) => value.trim())) {
    rows.push(row);
  }

  return rows;
}

function normalizeHeader(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
}

function normalizeDate(value: string): string | null {
  if (!value) {
    return null;
  }

  const date = new Date(value);

  return Number.isFinite(date.getTime()) ? date.toISOString().slice(0, 10) : null;
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function relationOne<T>(value: T | T[] | null): T | null {
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

function emptySummary(): CrmLiteSummary {
  return {
    companies: [],
    contacts: [],
    deals: [],
    captures: [],
    counts: {
      companies: 0,
      contacts: 0,
      openDeals: 0,
      capturedLeads: 0,
    },
  };
}
