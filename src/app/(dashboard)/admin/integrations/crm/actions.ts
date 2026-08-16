"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { logAction } from "@/lib/audit/log-action";
import { getCurrentUser } from "@/lib/auth/current-user";
import { CRM_PROVIDERS, crmCredentialsLast4, encryptCrmCredentials, type CrmCredentials, type CrmProvider } from "@/lib/integrations/crm";
import { createSalesforceTestContacts, syncCrmCustomers } from "@/lib/integrations/crm-sync";
import { decryptSecretPayload } from "@/lib/security/secret-box";
import { createClient } from "@/lib/supabase/server";

const schema = z.object({
  provider: z.enum(CRM_PROVIDERS), is_enabled: z.boolean(),
  api_url: z.string().trim().url("Enter a valid API URL.").max(300),
  account_identifier: z.string().trim().max(200),
  access_token: z.string().trim().max(2000), client_id: z.string().trim().max(500),
  client_secret: z.string().trim().max(2000), refresh_token: z.string().trim().max(4000),
});

type ExistingIntegration = { id: string; provider: CrmProvider; is_enabled: boolean; config: Record<string, unknown> | null; credentials_encrypted: string | null; credentials_last4: Record<string, unknown> | null };

export async function saveCrmIntegration(formData: FormData): Promise<void> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role !== "admin") throw new Error("Only admins can configure CRM integrations.");
  const parsed = schema.safeParse({ provider: text(formData, "provider"), is_enabled: formData.get("is_enabled") === "on", api_url: text(formData, "api_url"), account_identifier: text(formData, "account_identifier"), access_token: text(formData, "access_token"), client_id: text(formData, "client_id"), client_secret: text(formData, "client_secret"), refresh_token: text(formData, "refresh_token") });
  if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? "Invalid CRM settings.");
  const supabase = await createClient();
  if (!supabase) throw new Error("Supabase is not configured for this workspace.");
  const { data: before } = await supabase.from("organization_integrations").select("id, provider, is_enabled, config, credentials_encrypted, credentials_last4").eq("organization_id", user.organization_id).eq("provider", parsed.data.provider).maybeSingle<ExistingIntegration>();
  let previousCredentials: CrmCredentials = {};
  try { previousCredentials = decryptSecretPayload<CrmCredentials>(before?.credentials_encrypted ?? null) ?? {}; } catch { throw new Error("Saved credentials cannot be decrypted. Re-enter all credentials for this CRM."); }
  const credentials: CrmCredentials = {
    accessToken: parsed.data.access_token || previousCredentials.accessToken,
    clientId: parsed.data.client_id || previousCredentials.clientId,
    clientSecret: parsed.data.client_secret || previousCredentials.clientSecret,
    refreshToken: parsed.data.provider === "salesforce" ? undefined : parsed.data.refresh_token || previousCredentials.refreshToken,
  };
  validateApiUrl(parsed.data.provider, parsed.data.api_url);
  validateCredentials(parsed.data.provider, parsed.data.is_enabled, credentials);
  const { data: after, error } = await supabase.from("organization_integrations").upsert({ organization_id: user.organization_id, provider: parsed.data.provider, is_enabled: parsed.data.is_enabled, config: { api_url: parsed.data.api_url, account_identifier: parsed.data.account_identifier, sync_customers: true }, credentials_encrypted: Object.values(credentials).some(Boolean) ? encryptCrmCredentials(credentials) : null, credentials_last4: crmCredentialsLast4(credentials), updated_by: user.id, updated_at: new Date().toISOString() }, { onConflict: "organization_id,provider" }).select("id, provider, is_enabled, config, credentials_last4, updated_at").single<Record<string, unknown>>();
  if (error || !after) throw new Error(error?.message ?? "Could not save CRM integration.");
  await logAction({ user, action: `integration.${parsed.data.provider}.updated`, targetTable: "organization_integrations", targetId: typeof after.id === "string" ? after.id : undefined, before: before ? { id: before.id, provider: before.provider, is_enabled: before.is_enabled, config: before.config, credentials_last4: before.credentials_last4 } : null, after });
  revalidatePath("/admin/integrations/crm"); revalidatePath("/quotes/new");
  redirect(`/admin/integrations/crm?saved=${parsed.data.provider}`);
}

export async function syncCrmIntegration(formData: FormData): Promise<void> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role !== "admin") throw new Error("Only admins can synchronize CRM customers.");
  const provider = z.enum(CRM_PROVIDERS).parse(text(formData, "provider"));
  const supabase = await createClient();
  if (!supabase) throw new Error("Supabase is not configured for this workspace.");
  const result = await syncCrmCustomers({ user, supabase, provider });
  revalidatePath("/admin/integrations/crm"); revalidatePath("/quotes/new"); revalidatePath("/customers");
  redirect(`/admin/integrations/crm?synced=${provider}&count=${result.synced}`);
}

export async function seedSalesforceTestContacts(): Promise<void> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role !== "admin") throw new Error("Only admins can create Salesforce test contacts.");
  const supabase = await createClient();
  if (!supabase) throw new Error("Supabase is not configured for this workspace.");
  const result = await createSalesforceTestContacts({ user, supabase });
  redirect(`/admin/integrations/crm?seeded=${result.created}&skipped=${result.skipped}`);
}

function validateCredentials(provider: CrmProvider, enabled: boolean, credentials: CrmCredentials): void {
  if (!enabled) return;
  if ((provider === "pipedrive" || provider === "hubspot") && !credentials.accessToken) throw new Error("An access token is required when this CRM is enabled.");
  if (provider === "salesforce" && (!credentials.clientId || !credentials.clientSecret)) throw new Error("Client ID and client secret are required when Salesforce is enabled.");
  if (provider === "zoho" && (!credentials.clientId || !credentials.clientSecret || !credentials.refreshToken)) throw new Error("Client ID, client secret, and refresh token are required when Zoho is enabled.");
}

function validateApiUrl(provider: CrmProvider, value: string): void {
  const hostname = new URL(value).hostname.toLowerCase();
  const allowedSuffixes: Record<CrmProvider, string[]> = {
    pipedrive: ["pipedrive.com"],
    salesforce: ["salesforce.com", "force.com"],
    hubspot: ["hubapi.com"],
    zoho: ["zohoapis.com", "zohoapis.eu", "zohoapis.in", "zohoapis.com.au", "zohoapis.jp"],
  };
  if (!allowedSuffixes[provider].some((suffix) => hostname === suffix || hostname.endsWith(`.${suffix}`))) {
    throw new Error(`API URL is not a recognized ${provider} domain.`);
  }
}

function text(formData: FormData, key: string): string { const value = formData.get(key); return typeof value === "string" ? value.trim() : ""; }
