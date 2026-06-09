import { createClient } from "@/lib/supabase/server";

export type AdminGmailIntegration = {
  id: string | null;
  is_enabled: boolean;
  email: string | null;
  oauth_configured: boolean;
  client_id_last4: string | null;
  updated_at: string | null;
};

export type AdminSlackIntegration = {
  id: string | null;
  is_enabled: boolean;
  channel_name: string;
  approver_email: string;
  webhook_configured: boolean;
  signing_secret_configured: boolean;
  bot_token_configured: boolean;
  updated_at: string | null;
};

export type AdminPipedriveIntegration = {
  id: string | null;
  is_enabled: boolean;
  api_base_url: string;
  sync_interval_minutes: number;
  api_token_configured: boolean;
  updated_at: string | null;
};

type OrganizationIntegrationRecord = {
  id: string;
  is_enabled: boolean;
  config: Record<string, unknown> | null;
  credentials_last4: Record<string, unknown> | null;
  updated_at: string;
};

export async function getAdminGmailIntegration(
  organizationId: string,
): Promise<AdminGmailIntegration> {
  const supabase = await createClient();

  if (!supabase) {
    return emptyGmailIntegration();
  }

  const { data } = await supabase
    .from("organization_integrations")
    .select("id, is_enabled, credentials_last4, updated_at")
    .eq("organization_id", organizationId)
    .eq("provider", "gmail")
    .maybeSingle<OrganizationIntegrationRecord>();

  if (!data) {
    return emptyGmailIntegration();
  }

  return {
    id: data.id,
    is_enabled: data.is_enabled,
    email: stringValue(data.credentials_last4?.email) ?? null,
    oauth_configured: Boolean(data.credentials_last4?.client_secret),
    client_id_last4: stringValue(data.credentials_last4?.client_id) ?? null,
    updated_at: data.updated_at,
  };
}

export async function getAdminSlackIntegration(
  organizationId: string,
): Promise<AdminSlackIntegration> {
  const supabase = await createClient();

  if (!supabase) {
    return emptySlackIntegration();
  }

  const { data } = await supabase
    .from("organization_integrations")
    .select("id, is_enabled, config, credentials_last4, updated_at")
    .eq("organization_id", organizationId)
    .eq("provider", "slack")
    .maybeSingle<OrganizationIntegrationRecord>();

  if (!data) {
    return emptySlackIntegration();
  }

  return {
    id: data.id,
    is_enabled: data.is_enabled,
    channel_name: stringValue(data.config?.channel_name) ?? "",
    approver_email: stringValue(data.config?.approver_email) ?? "",
    webhook_configured: Boolean(data.credentials_last4?.webhook_url),
    signing_secret_configured: Boolean(data.credentials_last4?.signing_secret),
    bot_token_configured: Boolean(data.credentials_last4?.bot_token),
    updated_at: data.updated_at,
  };
}

export async function getAdminPipedriveIntegration(
  organizationId: string,
): Promise<AdminPipedriveIntegration> {
  const supabase = await createClient();

  if (!supabase) {
    return emptyPipedriveIntegration();
  }

  const { data } = await supabase
    .from("organization_integrations")
    .select("id, is_enabled, config, credentials_last4, updated_at")
    .eq("organization_id", organizationId)
    .eq("provider", "pipedrive")
    .maybeSingle<OrganizationIntegrationRecord>();

  if (!data) {
    return emptyPipedriveIntegration();
  }

  return {
    id: data.id,
    is_enabled: data.is_enabled,
    api_base_url:
      stringValue(data.config?.api_base_url) ?? "https://api.pipedrive.com/v1",
    sync_interval_minutes: numberValue(data.config?.sync_interval_minutes) ?? 30,
    api_token_configured: Boolean(data.credentials_last4?.api_token),
    updated_at: data.updated_at,
  };
}

function emptyGmailIntegration(): AdminGmailIntegration {
  return {
    id: null,
    is_enabled: false,
    email: null,
    oauth_configured: false,
    client_id_last4: null,
    updated_at: null,
  };
}

function emptySlackIntegration(): AdminSlackIntegration {
  return {
    id: null,
    is_enabled: false,
    channel_name: "",
    approver_email: "",
    webhook_configured: false,
    signing_secret_configured: false,
    bot_token_configured: false,
    updated_at: null,
  };
}

function emptyPipedriveIntegration(): AdminPipedriveIntegration {
  return {
    id: null,
    is_enabled: false,
    api_base_url: "https://api.pipedrive.com/v1",
    sync_interval_minutes: 30,
    api_token_configured: false,
    updated_at: null,
  };
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function numberValue(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}
