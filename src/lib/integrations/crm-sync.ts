import type { AppUser } from "@/lib/auth/current-user";
import { logAction } from "@/lib/audit/log-action";
import { CRM_PROVIDER_DETAILS, type CrmCredentials, type CrmProvider } from "@/lib/integrations/crm";
import { decryptSecretPayload } from "@/lib/security/secret-box";
import type { createClient } from "@/lib/supabase/server";

type SupabaseClient = NonNullable<Awaited<ReturnType<typeof createClient>>>;
type IntegrationRow = { id: string; is_enabled: boolean; config: Record<string, unknown> | null; credentials_encrypted: string | null };
type ExternalCustomer = { externalId: string; name: string; companyName: string | null; contactName: string | null; email: string | null; phone: string | null };
const SALESFORCE_TEST_CONTACTS = [
  { FirstName: "SFS Maya", LastName: "Lopez", Email: "sfs.maya@example.com", Phone: "+1 555-0101" },
  { FirstName: "SFS Evan", LastName: "Brooks", Email: "sfs.evan@example.com", Phone: "+1 555-0102" },
  { FirstName: "SFS John", LastName: "Carter", Email: "sfs.john@example.com", Phone: "+1 555-0103" },
] as const;

export async function syncCrmCustomers({ user, supabase, provider }: { user: AppUser; supabase: SupabaseClient; provider: CrmProvider }): Promise<{ synced: number }> {
  const { data: integration, error } = await supabase.from("organization_integrations").select("id, is_enabled, config, credentials_encrypted").eq("organization_id", user.organization_id).eq("provider", provider).maybeSingle<IntegrationRow>();
  if (error || !integration) throw new Error(error?.message ?? `${provider} is not configured.`);
  if (!integration.is_enabled) throw new Error(`${CRM_PROVIDER_DETAILS[provider].label} is disabled.`);
  const credentials = decryptSecretPayload<CrmCredentials>(integration.credentials_encrypted);
  if (!credentials) throw new Error(`${CRM_PROVIDER_DETAILS[provider].label} credentials are missing.`);
  const apiUrl = requiredConfigString(integration.config, "api_url");
  assertProviderUrl(provider, apiUrl);
  const externalCustomers = await fetchCustomers(provider, apiUrl, credentials);
  const { data: existing } = await supabase.from("customers").select("id, name, crm_provider, crm_external_id").eq("organization_id", user.organization_id).returns<Array<{ id: string; name: string; crm_provider: string; crm_external_id: string | null }>>();
  const identityNames = new Map((existing ?? []).filter((row) => row.crm_external_id).map((row) => [`${row.crm_provider}:${row.crm_external_id}`, row.name]));
  const usedNames = new Set((existing ?? []).map((row) => row.name.toLowerCase()));
  const now = new Date().toISOString();
  const rows = externalCustomers.map((customer) => {
    const identity = `${provider}:${customer.externalId}`;
    const existingName = identityNames.get(identity);
    const name = existingName ?? uniqueName(customer.companyName || customer.name, CRM_PROVIDER_DETAILS[provider].label, usedNames);
    usedNames.add(name.toLowerCase());
    return { organization_id: user.organization_id, name, company_name: customer.companyName || customer.name, contact_name: customer.contactName, email: customer.email, phone: customer.phone, address: {}, payment_terms: "COD", is_active: true, crm_provider: provider, crm_external_id: customer.externalId, crm_synced_at: now, sync_source: provider === "pipedrive" ? "pipedrive" : "cron", ...(provider === "pipedrive" ? { pipedrive_person_id: customer.externalId, pipedrive_synced_at: now } : {}) };
  });
  if (rows.length) {
    const { error: upsertError } = await supabase.from("customers").upsert(rows, { onConflict: "organization_id,crm_provider,crm_external_id" });
    if (upsertError) throw new Error(upsertError.message);
  }
  const { data: after, error: updateError } = await supabase.from("organization_integrations").update({ config: { ...(integration.config ?? {}), last_customer_sync_at: now, last_customer_sync_count: rows.length, last_customer_sync_status: "success" }, updated_by: user.id, updated_at: now }).eq("organization_id", user.organization_id).eq("provider", provider).select("id, provider, config").single<Record<string, unknown>>();
  if (updateError) throw new Error(updateError.message);
  await logAction({ user, action: `integration.${provider}.customers_synced`, targetTable: "organization_integrations", targetId: integration.id, before: null, after, metadata: { provider, synced_count: rows.length } });
  return { synced: rows.length };
}

export async function createSalesforceTestContacts({ user, supabase }: { user: AppUser; supabase: SupabaseClient }): Promise<{ created: number; skipped: number }> {
  const { data: integration, error } = await supabase.from("organization_integrations").select("id, is_enabled, config, credentials_encrypted").eq("organization_id", user.organization_id).eq("provider", "salesforce").maybeSingle<IntegrationRow>();
  if (error || !integration) throw new Error(error?.message ?? "Salesforce is not configured.");
  if (!integration.is_enabled) throw new Error("Salesforce is disabled.");
  const credentials = decryptSecretPayload<CrmCredentials>(integration.credentials_encrypted);
  if (!credentials) throw new Error("Salesforce credentials are missing.");
  const loginUrl = requiredConfigString(integration.config, "api_url");
  assertProviderUrl("salesforce", loginUrl);
  const { accessToken, instanceUrl, versionUrl } = await getSalesforceSession(loginUrl, credentials);
  const emails = SALESFORCE_TEST_CONTACTS.map((contact) => `'${contact.Email}'`).join(",");
  const query = `SELECT Id, Email FROM Contact WHERE Email IN (${emails})`;
  const existing = await requestJson(new URL(`${versionUrl}/query?q=${encodeURIComponent(query)}`, instanceUrl), { Authorization: `Bearer ${accessToken}` });
  const existingEmails = new Set(arrayValue(existing.records).map((item) => stringValue(recordValue(item).Email).toLowerCase()));
  let created = 0;
  let skipped = 0;
  for (const contact of SALESFORCE_TEST_CONTACTS) {
    if (existingEmails.has(contact.Email.toLowerCase())) { skipped += 1; continue; }
    await requestJson(new URL(`${versionUrl}/sobjects/Contact`, instanceUrl), { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" }, { method: "POST", body: JSON.stringify(contact) });
    created += 1;
  }
  await logAction({ user, action: "integration.salesforce.test_contacts_created", targetTable: "organization_integrations", targetId: integration.id, before: null, after: { created, skipped }, metadata: { provider: "salesforce", created_count: created, skipped_count: skipped } });
  return { created, skipped };
}

async function fetchCustomers(provider: CrmProvider, apiUrl: string, credentials: CrmCredentials): Promise<ExternalCustomer[]> {
  if (provider === "pipedrive") return fetchPipedrive(apiUrl, required(credentials.accessToken, "Pipedrive API token"));
  if (provider === "hubspot") return fetchHubSpot(apiUrl, required(credentials.accessToken, "HubSpot access token"));
  if (provider === "salesforce") return fetchSalesforce(apiUrl, credentials);
  return fetchZoho(apiUrl, credentials);
}

async function fetchPipedrive(apiUrl: string, token: string): Promise<ExternalCustomer[]> {
  const output: ExternalCustomer[] = []; let start = 0;
  for (let page = 0; page < 20; page += 1) {
    const url = new URL(`${apiUrl.replace(/\/$/, "")}/persons`); url.searchParams.set("api_token", token); url.searchParams.set("start", String(start)); url.searchParams.set("limit", "100");
    const body = await requestJson(url, {}); const data = arrayValue(body.data);
    output.push(...data.map((item) => mapPipedrive(recordValue(item))).filter(isCustomer));
    const pagination = recordValue(recordValue(body.additional_data).pagination);
    if (pagination.more_items_in_collection !== true) break;
    start = numberValue(pagination.next_start, start + 100);
  }
  return output;
}

async function fetchHubSpot(apiUrl: string, token: string): Promise<ExternalCustomer[]> {
  const output: ExternalCustomer[] = []; let after = "";
  for (let page = 0; page < 20; page += 1) {
    const url = new URL(`${apiUrl.replace(/\/$/, "")}/crm/v3/objects/contacts`); url.searchParams.set("limit", "100"); url.searchParams.set("properties", "firstname,lastname,email,phone,company"); if (after) url.searchParams.set("after", after);
    const body = await requestJson(url, { Authorization: `Bearer ${token}` });
    output.push(...arrayValue(body.results).map((item) => mapHubSpot(recordValue(item))).filter(isCustomer));
    after = stringValue(recordValue(recordValue(body.paging).next).after); if (!after) break;
  }
  return output;
}

async function fetchSalesforce(loginUrl: string, credentials: CrmCredentials): Promise<ExternalCustomer[]> {
  const { accessToken, instanceUrl, versionUrl } = await getSalesforceSession(loginUrl, credentials);
  const query = "SELECT Id, FirstName, LastName, Email, Phone, Account.Name FROM Contact WHERE IsDeleted = false"; let nextUrl = `${versionUrl}/query?q=${encodeURIComponent(query)}`; const output: ExternalCustomer[] = [];
  for (let page = 0; nextUrl && page < 20; page += 1) { const body = await requestJson(new URL(nextUrl, instanceUrl), { Authorization: `Bearer ${accessToken}` }); output.push(...arrayValue(body.records).map((item) => mapSalesforce(recordValue(item))).filter(isCustomer)); nextUrl = stringValue(body.nextRecordsUrl); }
  return output;
}

async function getSalesforceSession(loginUrl: string, credentials: CrmCredentials): Promise<{ accessToken: string; instanceUrl: string; versionUrl: string }> {
  const form = new URLSearchParams({ grant_type: "client_credentials", client_id: required(credentials.clientId, "Salesforce client ID"), client_secret: required(credentials.clientSecret, "Salesforce client secret") });
  const token = await requestJson(new URL("/services/oauth2/token", loginUrl), { "Content-Type": "application/x-www-form-urlencoded" }, { method: "POST", body: form.toString() });
  const accessToken = required(stringValue(token.access_token), "Salesforce access token response"); const instanceUrl = required(stringValue(token.instance_url), "Salesforce instance URL response");
  const versions = await requestJson(new URL("/services/data", instanceUrl), { Authorization: `Bearer ${accessToken}` }); const latest = arrayValue(versions).map(recordValue).at(-1); const versionUrl = stringValue(latest?.url) || "/services/data/v61.0";
  return { accessToken, instanceUrl, versionUrl };
}

async function fetchZoho(apiUrl: string, credentials: CrmCredentials): Promise<ExternalCustomer[]> {
  const api = new URL(apiUrl); const accountsHost = api.hostname.includes(".eu") ? "accounts.zoho.eu" : api.hostname.includes(".in") ? "accounts.zoho.in" : api.hostname.includes(".com.au") ? "accounts.zoho.com.au" : api.hostname.includes(".jp") ? "accounts.zoho.jp" : "accounts.zoho.com";
  const form = new URLSearchParams({ grant_type: "refresh_token", client_id: required(credentials.clientId, "Zoho client ID"), client_secret: required(credentials.clientSecret, "Zoho client secret"), refresh_token: required(credentials.refreshToken, "Zoho refresh token") });
  const token = await requestJson(new URL(`https://${accountsHost}/oauth/v2/token`), { "Content-Type": "application/x-www-form-urlencoded" }, { method: "POST", body: form.toString() }); const accessToken = required(stringValue(token.access_token), "Zoho access token response");
  const output: ExternalCustomer[] = [];
  for (let page = 1; page <= 10; page += 1) { const url = new URL(`${apiUrl.replace(/\/$/, "")}/Contacts`); url.searchParams.set("fields", "id,First_Name,Last_Name,Full_Name,Email,Phone,Account_Name"); url.searchParams.set("per_page", "200"); url.searchParams.set("page", String(page)); const body = await requestJson(url, { Authorization: `Zoho-oauthtoken ${accessToken}` }); output.push(...arrayValue(body.data).map((item) => mapZoho(recordValue(item))).filter(isCustomer)); if (recordValue(body.info).more_records !== true) break; }
  return output;
}

function mapPipedrive(item: Record<string, unknown>): ExternalCustomer | null { const name = stringValue(item.name); const org = recordValue(item.org_id); return customer(stringValue(item.id), name, stringValue(org.name) || null, name, firstContact(item.email), firstContact(item.phone)); }
function mapHubSpot(item: Record<string, unknown>): ExternalCustomer | null { const p = recordValue(item.properties); const contact = [stringValue(p.firstname), stringValue(p.lastname)].filter(Boolean).join(" "); return customer(stringValue(item.id), contact || stringValue(p.company), stringValue(p.company) || null, contact || null, nullable(p.email), nullable(p.phone)); }
function mapSalesforce(item: Record<string, unknown>): ExternalCustomer | null { const contact = [stringValue(item.FirstName), stringValue(item.LastName)].filter(Boolean).join(" "); return customer(stringValue(item.Id), contact, nullable(recordValue(item.Account).Name), contact || null, nullable(item.Email), nullable(item.Phone)); }
function mapZoho(item: Record<string, unknown>): ExternalCustomer | null { const contact = stringValue(item.Full_Name) || [stringValue(item.First_Name), stringValue(item.Last_Name)].filter(Boolean).join(" "); return customer(stringValue(item.id), contact, nullable(recordValue(item.Account_Name).name), contact || null, nullable(item.Email), nullable(item.Phone)); }
function customer(externalId: string, name: string, companyName: string | null, contactName: string | null, email: string | null, phone: string | null): ExternalCustomer | null { return externalId && name ? { externalId, name, companyName, contactName, email, phone } : null; }
function isCustomer(value: ExternalCustomer | null): value is ExternalCustomer { return value !== null; }
function firstContact(value: unknown): string | null { const first = Array.isArray(value) ? value[0] : value; return nullable(recordValue(first).value || first); }
function uniqueName(base: string, provider: string, used: Set<string>): string { if (!used.has(base.toLowerCase())) return base; let candidate = `${base} (${provider})`; let number = 2; while (used.has(candidate.toLowerCase())) candidate = `${base} (${provider} ${number++})`; return candidate; }
async function requestJson(url: URL, headers: Record<string, string>, init: RequestInit = {}): Promise<Record<string, unknown>> { const response = await fetch(url, { ...init, headers: { Accept: "application/json", ...headers, ...(init.headers ?? {}) }, signal: AbortSignal.timeout(30_000), cache: "no-store" }); const payload: unknown = await response.json(); if (!response.ok) { const providerMessage = safeProviderError(payload); throw new Error(`CRM request failed (${response.status}) at ${url.hostname}${providerMessage ? `: ${providerMessage}` : "."}`); } return recordValue(payload); }
function assertProviderUrl(provider: CrmProvider, value: string): void { const host = new URL(value).hostname; const suffixes: Record<CrmProvider, string[]> = { pipedrive: ["pipedrive.com"], salesforce: ["salesforce.com", "force.com"], hubspot: ["hubapi.com"], zoho: ["zohoapis.com", "zohoapis.eu", "zohoapis.in", "zohoapis.com.au", "zohoapis.jp"] }; if (!suffixes[provider].some((suffix) => host === suffix || host.endsWith(`.${suffix}`))) throw new Error("Configured CRM API URL is not allowed."); }
function requiredConfigString(config: Record<string, unknown> | null, key: string): string { return required(stringValue(config?.[key]), key); }
function required(value: string | undefined, label: string): string { if (!value) throw new Error(`${label} is required.`); return value; }
function recordValue(value: unknown): Record<string, unknown> { return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {}; }
function arrayValue(value: unknown): unknown[] { return Array.isArray(value) ? value : []; }
function stringValue(value: unknown): string { return typeof value === "string" || typeof value === "number" ? String(value) : ""; }
function numberValue(value: unknown, fallback: number): number { return typeof value === "number" ? value : fallback; }
function nullable(value: unknown): string | null { return stringValue(value) || null; }
function safeProviderError(value: unknown): string {
  const candidate = Array.isArray(value) ? recordValue(value[0]) : recordValue(value);
  const code = stringValue(candidate.error) || stringValue(candidate.errorCode);
  const description = stringValue(candidate.error_description) || stringValue(candidate.message);
  return [code, description].filter(Boolean).join(" — ").replace(/[\r\n]/g, " ").slice(0, 300);
}
