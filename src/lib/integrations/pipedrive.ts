import type { SupabaseClient } from "@supabase/supabase-js";

import type { AppUser } from "@/lib/auth/current-user";
import { isFeatureEnabled } from "@/lib/features/flags";
import {
  decryptSecretPayload,
  encryptSecretPayload,
} from "@/lib/security/secret-box";

export type PipedriveIntegration = {
  id: string;
  organizationId: string;
  isEnabled: boolean;
  apiBaseUrl: string;
  apiToken: string | null;
  syncIntervalMinutes: number;
};

export type PipedriveCustomerInput = {
  pipedrivePersonId: string;
  pipedriveOrganizationId: string | null;
  name: string;
  companyName: string | null;
  contactName: string | null;
  email: string | null;
  phone: string | null;
  address: Record<string, unknown>;
  isActive: boolean;
  pipedriveUpdatedAt: string | null;
};

type PipedriveIntegrationRecord = {
  id: string;
  organization_id: string;
  is_enabled: boolean;
  config: Record<string, unknown> | null;
  credentials_encrypted: string | null;
};

type PipedriveCredentials = {
  apiToken?: string;
};

type CustomerPushRecord = {
  id: string;
  organization_id: string;
  name: string;
  company_name: string | null;
  contact_name: string | null;
  email: string | null;
  phone: string | null;
  address: Record<string, unknown> | null;
  pipedrive_person_id: string | null;
  pipedrive_organization_id: string | null;
};

type PipedriveEntityResponse = {
  success?: boolean;
  data?: {
    id?: number | string;
  };
  error?: string;
};

type PipedrivePersonRecord = {
  id: number | string;
  name?: string | null;
  org_id?:
    | number
    | string
    | {
        value?: number | string;
        name?: string;
      }
    | null;
  email?: Array<{ value?: string; primary?: boolean }> | string | null;
  phone?: Array<{ value?: string; primary?: boolean }> | string | null;
  active_flag?: boolean;
  update_time?: string | null;
};

type PipedrivePersonsResponse = {
  success?: boolean;
  data?: PipedrivePersonRecord[] | null;
  additional_data?: {
    pagination?: {
      more_items_in_collection?: boolean;
      next_start?: number;
    };
  };
  error?: string;
};

const DEFAULT_API_BASE_URL = "https://api.pipedrive.com/v1";
const PIPEDRIVE_TIMEOUT_MS = 7000;
const PIPEDRIVE_PAGE_LIMIT = 500;
const MAX_PIPEDRIVE_PAGES = 20;
const DEFAULT_OUTBOUND_BATCH_LIMIT = 25;

export async function getPipedriveIntegration({
  supabase,
  organizationId,
}: {
  supabase: SupabaseClient;
  organizationId: string;
}): Promise<PipedriveIntegration | null> {
  const pipedriveSyncEnabled = await isFeatureEnabled({
    supabase,
    organizationId,
    featureName: "pipedrive_sync",
  });

  if (!pipedriveSyncEnabled) {
    return null;
  }

  const { data } = await supabase
    .from("organization_integrations")
    .select("id, organization_id, is_enabled, config, credentials_encrypted")
    .eq("organization_id", organizationId)
    .eq("provider", "pipedrive")
    .maybeSingle<PipedriveIntegrationRecord>();

  if (!data) {
    return null;
  }

  const credentials = decryptSecretPayload<PipedriveCredentials>(
    data.credentials_encrypted,
  );

  return {
    id: data.id,
    organizationId: data.organization_id,
    isEnabled: data.is_enabled,
    apiBaseUrl:
      stringValue(data.config?.api_base_url) ?? DEFAULT_API_BASE_URL,
    apiToken: stringValue(credentials?.apiToken),
    syncIntervalMinutes: numberValue(data.config?.sync_interval_minutes) ?? 30,
  };
}

export function encryptedPipedriveCredentials(
  credentials: PipedriveCredentials,
): string {
  return encryptSecretPayload(credentials);
}

export async function pushCustomerToPipedrive({
  supabase,
  user,
  customerId,
}: {
  supabase: SupabaseClient;
  user: AppUser;
  customerId: string;
}): Promise<"pushed" | "skipped" | "failed"> {
  try {
    return await pushCustomerToPipedriveInternal({
      supabase,
      user,
      customerId,
    });
  } catch (error) {
    console.error("Pipedrive customer push failed before sync could run.", error);

    await safeLogPipedriveSyncEvent({
      supabase,
      organizationId: user.organization_id,
      userId: user.id,
      action: "customer.pipedrive_push_failed",
      targetId: customerId,
      metadata: {
        message: error instanceof Error ? error.message : "Unknown error.",
      },
    });

    return "failed";
  }
}

export async function pushUnsyncedQuoteBaseCustomersToPipedrive({
  supabase,
  user,
  limit = DEFAULT_OUTBOUND_BATCH_LIMIT,
}: {
  supabase: SupabaseClient;
  user: AppUser;
  limit?: number;
}): Promise<{
  eligible: number;
  attempted: number;
  pushed: number;
  skipped: number;
  failed: number;
}> {
  const { count, error: countError } = await supabase
    .from("customers")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", user.organization_id)
    .eq("is_active", true)
    .is("pipedrive_person_id", null);

  if (countError) {
    throw new Error(countError.message);
  }

  const { data: customers, error } = await supabase
    .from("customers")
    .select("id")
    .eq("organization_id", user.organization_id)
    .eq("is_active", true)
    .is("pipedrive_person_id", null)
    .order("created_at", { ascending: true })
    .limit(limit)
    .returns<Array<{ id: string }>>();

  if (error) {
    throw new Error(error.message);
  }

  let pushed = 0;
  let skipped = 0;
  let failed = 0;

  for (const customer of customers ?? []) {
    const result = await pushCustomerToPipedrive({
      supabase,
      user,
      customerId: customer.id,
    });

    if (result === "pushed") {
      pushed += 1;
    } else if (result === "skipped") {
      skipped += 1;
    } else {
      failed += 1;
    }
  }

  await safeLogPipedriveSyncEvent({
    supabase,
    organizationId: user.organization_id,
    userId: user.id,
    action: "customer.pipedrive_outbound_batch",
    targetId: null,
    after: {
      eligible: count ?? 0,
      attempted: customers?.length ?? 0,
      pushed,
      skipped,
      failed,
    },
    metadata: {
      source: "admin",
      direction: "quotebase_to_pipedrive",
      limit,
    },
  });

  return {
    eligible: count ?? 0,
    attempted: customers?.length ?? 0,
    pushed,
    skipped,
    failed,
  };
}

async function pushCustomerToPipedriveInternal({
  supabase,
  user,
  customerId,
}: {
  supabase: SupabaseClient;
  user: AppUser;
  customerId: string;
}): Promise<"pushed" | "skipped" | "failed"> {
  const integration = await getPipedriveIntegration({
    supabase,
    organizationId: user.organization_id,
  });

  if (!integration?.isEnabled || !integration.apiToken) {
    await safeLogPipedriveSyncEvent({
      supabase,
      organizationId: user.organization_id,
      userId: user.id,
      action: "customer.pipedrive_push_skipped",
      targetId: customerId,
      metadata: {
        reason: "Pipedrive integration is disabled or missing API token.",
      },
    });
    return "skipped";
  }

  const { data: customer } = await supabase
    .from("customers")
    .select(
      "id, organization_id, name, company_name, contact_name, email, phone, address, pipedrive_person_id, pipedrive_organization_id",
    )
    .eq("organization_id", user.organization_id)
    .eq("id", customerId)
    .eq("is_active", true)
    .single<CustomerPushRecord>();

  if (!customer) {
    return "failed";
  }

  try {
    const organizationId = await ensurePipedriveOrganization({
      integration,
      customer,
    });
    const personId = await ensurePipedrivePerson({
      integration,
      customer,
      organizationId,
    });
    const syncedAt = new Date().toISOString();

    await supabase
      .from("customers")
      .update({
        pipedrive_person_id: personId,
        pipedrive_organization_id: organizationId,
        pipedrive_synced_at: syncedAt,
        sync_source: "wm",
      })
      .eq("organization_id", user.organization_id)
      .eq("id", customer.id);

    await safeLogPipedriveSyncEvent({
      supabase,
      organizationId: user.organization_id,
      userId: user.id,
      action: "customer.pipedrive_pushed",
      targetId: customer.id,
      after: {
        pipedrive_person_id: personId,
        pipedrive_organization_id: organizationId,
      },
    });

    return "pushed";
  } catch (error) {
    await safeLogPipedriveSyncEvent({
      supabase,
      organizationId: user.organization_id,
      userId: user.id,
      action: "customer.pipedrive_push_failed",
      targetId: customer.id,
      metadata: {
        message: error instanceof Error ? error.message : "Unknown error.",
      },
    });

    return "failed";
  }
}

export async function upsertPipedriveCustomers({
  supabase,
  organizationId,
  customers,
}: {
  supabase: SupabaseClient;
  organizationId: string;
  customers: PipedriveCustomerInput[];
}): Promise<{ imported: number }> {
  if (!customers.length) {
    return { imported: 0 };
  }

  const rows = customers.map((customer) => ({
    organization_id: organizationId,
    pipedrive_person_id: customer.pipedrivePersonId,
    pipedrive_organization_id: customer.pipedriveOrganizationId,
    name: customer.name,
    company_name: customer.companyName,
    contact_name: customer.contactName,
    email: customer.email,
    phone: customer.phone,
    address: customer.address,
    is_active: customer.isActive,
    pipedrive_updated_at: customer.pipedriveUpdatedAt,
    pipedrive_synced_at: new Date().toISOString(),
    sync_source: "pipedrive",
  }));
  const pipedrivePersonIds = rows.map((row) => row.pipedrive_person_id);
  const { data: existingCustomers, error: existingError } = await supabase
    .from("customers")
    .select("id, pipedrive_person_id")
    .eq("organization_id", organizationId)
    .in("pipedrive_person_id", pipedrivePersonIds)
    .returns<Array<{ id: string; pipedrive_person_id: string }>>();

  if (existingError) {
    throw new Error(existingError.message);
  }

  const existingIdByPipedrivePerson = new Map(
    (existingCustomers ?? []).map((customer) => [
      customer.pipedrive_person_id,
      customer.id,
    ]),
  );

  const { data, error } = await supabase
    .from("customers")
    .upsert(
      rows.map((row) => {
        const existingId = existingIdByPipedrivePerson.get(
          row.pipedrive_person_id,
        );

        return existingId ? { ...row, id: existingId } : row;
      }),
      { onConflict: "id" },
    )
    .select("id");

  if (error) {
    throw new Error(error.message);
  }

  await logPipedriveSyncEvent({
    supabase,
    organizationId,
    userId: null,
    action: "customer.pipedrive_bulk_imported",
    targetId: null,
    after: {
      imported: data?.length ?? rows.length,
    },
    metadata: {
      source: "cron",
      source_of_truth: "pipedrive",
    },
  });

  return { imported: data?.length ?? rows.length };
}

export async function syncEnabledPipedriveCustomers({
  supabase,
}: {
  supabase: SupabaseClient;
}): Promise<{
  organizations: number;
  imported: number;
  skipped: number;
  failed: number;
}> {
  const { data: integrations, error } = await supabase
    .from("organization_integrations")
    .select("organization_id")
    .eq("provider", "pipedrive")
    .eq("is_enabled", true)
    .returns<Array<{ organization_id: string }>>();

  if (error) {
    throw new Error(error.message);
  }

  let imported = 0;
  let skipped = 0;
  let failed = 0;

  for (const integration of integrations ?? []) {
    try {
      const result = await syncPipedriveCustomersForOrganization({
        supabase,
        organizationId: integration.organization_id,
      });

      if (result.skipped) {
        skipped += 1;
      } else {
        imported += result.imported;
      }
    } catch (syncError) {
      failed += 1;
      await logPipedriveSyncEvent({
        supabase,
        organizationId: integration.organization_id,
        userId: null,
        action: "customer.pipedrive_cron_sync_failed",
        targetId: null,
        metadata: {
          message:
            syncError instanceof Error ? syncError.message : "Unknown error.",
        },
      });
    }
  }

  return {
    organizations: integrations?.length ?? 0,
    imported,
    skipped,
    failed,
  };
}

export async function syncPipedriveCustomersForOrganization({
  supabase,
  organizationId,
}: {
  supabase: SupabaseClient;
  organizationId: string;
}): Promise<{ imported: number; skipped: boolean }> {
  const integration = await getPipedriveIntegration({
    supabase,
    organizationId,
  });

  if (!integration?.isEnabled || !integration.apiToken) {
    await logPipedriveSyncEvent({
      supabase,
      organizationId,
      userId: null,
      action: "customer.pipedrive_cron_sync_skipped",
      targetId: null,
      metadata: {
        reason: "Pipedrive integration is disabled or missing API token.",
      },
    });

    return { imported: 0, skipped: true };
  }

  const customers = await fetchPipedriveCustomers(integration);
  const result = await upsertPipedriveCustomers({
    supabase,
    organizationId,
    customers,
  });

  await logPipedriveSyncEvent({
    supabase,
    organizationId,
    userId: null,
    action: "customer.pipedrive_cron_synced",
    targetId: null,
    after: result,
    metadata: {
      source: "cron",
      source_of_truth: "pipedrive",
      pages_limit: MAX_PIPEDRIVE_PAGES,
    },
  });

  return { imported: result.imported, skipped: false };
}

async function ensurePipedriveOrganization({
  integration,
  customer,
}: {
  integration: PipedriveIntegration;
  customer: CustomerPushRecord;
}): Promise<string | null> {
  const companyName = customer.company_name || customer.name;

  if (!companyName) {
    return customer.pipedrive_organization_id;
  }

  const payload = {
    name: companyName,
    address: addressLine(customer.address),
  };

  const response = await pipedriveFetch<PipedriveEntityResponse>({
    integration,
    path: customer.pipedrive_organization_id
      ? `/organizations/${customer.pipedrive_organization_id}`
      : "/organizations",
    method: customer.pipedrive_organization_id ? "PUT" : "POST",
    body: payload,
  });

  return response.data?.id ? String(response.data.id) : null;
}

async function ensurePipedrivePerson({
  integration,
  customer,
  organizationId,
}: {
  integration: PipedriveIntegration;
  customer: CustomerPushRecord;
  organizationId: string | null;
}): Promise<string> {
  const payload = {
    name: customer.contact_name || customer.name,
    org_id: organizationId,
    email: customer.email ? [{ value: customer.email, primary: true }] : [],
    phone: customer.phone ? [{ value: customer.phone, primary: true }] : [],
  };
  const response = await pipedriveFetch<PipedriveEntityResponse>({
    integration,
    path: customer.pipedrive_person_id
      ? `/persons/${customer.pipedrive_person_id}`
      : "/persons",
    method: customer.pipedrive_person_id ? "PUT" : "POST",
    body: payload,
  });

  if (!response.data?.id) {
    throw new Error(response.error ?? "Pipedrive did not return a person id.");
  }

  return String(response.data.id);
}

async function pipedriveFetch<T>({
  integration,
  path,
  method = "GET",
  body,
}: {
  integration: PipedriveIntegration;
  path: string;
  method?: "GET" | "POST" | "PUT";
  body?: Record<string, unknown>;
}): Promise<T> {
  const url = new URL(`${integration.apiBaseUrl.replace(/\/$/, "")}${path}`);
  url.searchParams.set("api_token", integration.apiToken ?? "");
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), PIPEDRIVE_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      method,
      headers: {
        "content-type": "application/json",
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });

    const payload = (await response.json()) as PipedriveEntityResponse;

    if (!response.ok || payload.success === false) {
      throw new Error(payload.error ?? "Pipedrive request failed.");
    }

    return payload as T;
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchPipedriveCustomers(
  integration: PipedriveIntegration,
): Promise<PipedriveCustomerInput[]> {
  const customers: PipedriveCustomerInput[] = [];
  let start = 0;
  let pageCount = 0;
  let hasMore = true;

  while (hasMore && pageCount < MAX_PIPEDRIVE_PAGES) {
    const response = await pipedriveFetch<PipedrivePersonsResponse>({
      integration,
      path: `/persons?start=${start}&limit=${PIPEDRIVE_PAGE_LIMIT}&sort=update_time%20DESC`,
    });

    if (response.success === false) {
      throw new Error(response.error ?? "Pipedrive customer sync failed.");
    }

    customers.push(
      ...(response.data ?? [])
        .filter((person) => person.id)
        .map((person) => mapPipedrivePerson(person)),
    );

    const pagination = response.additional_data?.pagination;
    hasMore = Boolean(pagination?.more_items_in_collection);
    start = pagination?.next_start ?? start + PIPEDRIVE_PAGE_LIMIT;
    pageCount += 1;
  }

  return customers;
}

function mapPipedrivePerson(
  person: PipedrivePersonRecord,
): PipedriveCustomerInput {
  const organization = parsePipedriveOrganization(person.org_id);
  const name = stringValue(person.name) ?? `Pipedrive Person ${person.id}`;

  return {
    pipedrivePersonId: String(person.id),
    pipedriveOrganizationId: organization.id,
    name: organization.name ?? name,
    companyName: organization.name ?? name,
    contactName: name,
    email: contactValue(person.email),
    phone: contactValue(person.phone),
    address: {},
    isActive: person.active_flag ?? true,
    pipedriveUpdatedAt: parsePipedriveDate(person.update_time),
  };
}

function parsePipedriveOrganization(
  value: PipedrivePersonRecord["org_id"],
): { id: string | null; name: string | null } {
  if (!value) {
    return { id: null, name: null };
  }

  if (typeof value === "string" || typeof value === "number") {
    return { id: String(value), name: null };
  }

  return {
    id: value.value === undefined ? null : String(value.value),
    name: stringValue(value.name),
  };
}

function contactValue(
  value: PipedrivePersonRecord["email"] | PipedrivePersonRecord["phone"],
): string | null {
  if (typeof value === "string") {
    return stringValue(value);
  }

  if (!Array.isArray(value)) {
    return null;
  }

  const primary = value.find((entry) => entry.primary && entry.value);
  const fallback = value.find((entry) => entry.value);

  return stringValue(primary?.value) ?? stringValue(fallback?.value);
}

function parsePipedriveDate(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }

  const parsed = new Date(value);

  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

async function logPipedriveSyncEvent({
  supabase,
  organizationId,
  userId,
  action,
  targetId,
  before,
  after,
  metadata,
}: {
  supabase: SupabaseClient;
  organizationId: string;
  userId: string | null;
  action: string;
  targetId: string | null;
  before?: unknown;
  after?: unknown;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  await supabase.from("audit_log").insert({
    organization_id: organizationId,
    user_id: userId,
    action,
    target_table: "customers",
    target_id: targetId,
    before_value: before ?? null,
    after_value: after ?? null,
    metadata: metadata ?? null,
  });
}

async function safeLogPipedriveSyncEvent(
  input: Parameters<typeof logPipedriveSyncEvent>[0],
): Promise<void> {
  try {
    await logPipedriveSyncEvent(input);
  } catch (error) {
    console.error("Could not write Pipedrive sync audit event.", error);
  }
}

function addressLine(address: Record<string, unknown> | null): string | null {
  if (!address) {
    return null;
  }

  return [address.line1, address.city, address.state, address.postal_code]
    .filter((value): value is string => typeof value === "string" && !!value)
    .join(", ");
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function numberValue(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}
