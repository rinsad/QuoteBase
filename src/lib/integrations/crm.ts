import { encryptSecretPayload } from "@/lib/security/secret-box";
import { createClient } from "@/lib/supabase/server";

export const CRM_PROVIDERS = ["pipedrive", "salesforce", "hubspot", "zoho"] as const;
export type CrmProvider = (typeof CRM_PROVIDERS)[number];

export type CrmCredentials = {
  accessToken?: string;
  clientId?: string;
  clientSecret?: string;
  refreshToken?: string;
};

export type AdminCrmIntegration = {
  id: string | null;
  provider: CrmProvider;
  isEnabled: boolean;
  apiUrl: string;
  accountIdentifier: string;
  credentialsLast4: Record<string, string>;
};

export const CRM_PROVIDER_DETAILS: Record<CrmProvider, { label: string; defaultApiUrl: string; credentialFields: Array<{ key: keyof CrmCredentials; label: string }> }> = {
  pipedrive: { label: "Pipedrive", defaultApiUrl: "https://api.pipedrive.com/v1", credentialFields: [{ key: "accessToken", label: "API token" }] },
  salesforce: { label: "Salesforce", defaultApiUrl: "https://login.salesforce.com", credentialFields: [{ key: "clientId", label: "Consumer key / Client ID" }, { key: "clientSecret", label: "Consumer secret / Client secret" }] },
  hubspot: { label: "HubSpot", defaultApiUrl: "https://api.hubapi.com", credentialFields: [{ key: "accessToken", label: "Private app access token" }] },
  zoho: { label: "Zoho", defaultApiUrl: "https://www.zohoapis.com/crm/v7", credentialFields: [{ key: "clientId", label: "Client ID" }, { key: "clientSecret", label: "Client secret" }, { key: "refreshToken", label: "Refresh token" }] },
};

export async function getAdminCrmIntegrations(organizationId: string): Promise<AdminCrmIntegration[]> {
  const supabase = await createClient();
  if (!supabase) return defaults();

  const { data } = await supabase
    .from("organization_integrations")
    .select("id, provider, is_enabled, config, credentials_last4")
    .eq("organization_id", organizationId)
    .in("provider", [...CRM_PROVIDERS])
    .returns<Array<{ id: string; provider: CrmProvider; is_enabled: boolean; config: Record<string, unknown> | null; credentials_last4: Record<string, unknown> | null }>>();

  return CRM_PROVIDERS.map((provider) => {
    const row = data?.find((item) => item.provider === provider);
    const details = CRM_PROVIDER_DETAILS[provider];
    return {
      id: row?.id ?? null,
      provider,
      isEnabled: row?.is_enabled ?? false,
      apiUrl: stringValue(row?.config?.api_url) || details.defaultApiUrl,
      accountIdentifier: stringValue(row?.config?.account_identifier),
      credentialsLast4: Object.fromEntries(Object.entries(row?.credentials_last4 ?? {}).filter((entry): entry is [string, string] => typeof entry[1] === "string")),
    };
  });
}

export function encryptCrmCredentials(credentials: CrmCredentials): string {
  return encryptSecretPayload(credentials);
}

export function crmCredentialsLast4(credentials: CrmCredentials): Record<string, string> {
  return Object.fromEntries(Object.entries(credentials).filter((entry): entry is [string, string] => Boolean(entry[1])).map(([key, value]) => [key, value.slice(-4)]));
}

function defaults(): AdminCrmIntegration[] {
  return CRM_PROVIDERS.map((provider) => ({ id: null, provider, isEnabled: false, apiUrl: CRM_PROVIDER_DETAILS[provider].defaultApiUrl, accountIdentifier: "", credentialsLast4: {} }));
}

function stringValue(value: unknown): string { return typeof value === "string" ? value : ""; }
