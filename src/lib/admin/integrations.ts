import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export type AdminGmailIntegration = {
  id: string | null;
  is_enabled: boolean;
  email: string | null;
  oauth_configured: boolean;
  client_id_last4: string | null;
  user_integration_id: string | null;
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

export type AdminAuthorizeNetIntegration = {
  id: string | null;
  is_enabled: boolean;
  environment: "sandbox" | "production";
  api_login_id_last4: string | null;
  transaction_key_configured: boolean;
  updated_at: string | null;
};

export type AdminStripeIntegration = {
  id: string | null;
  is_enabled: boolean;
  secret_key_last4: string | null;
  webhook_secret_configured: boolean;
  updated_at: string | null;
};

export type AdminOpenAIIntegration = {
  id: string | null;
  is_enabled: boolean;
  model: string;
  api_key_last4: string | null;
  updated_at: string | null;
};

export type AdminGoogleMapsIntegration = {
  id: string | null;
  is_enabled: boolean;
  api_key_last4: string | null;
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
  userId: string,
): Promise<AdminGmailIntegration> {
  const supabase = createAdminClient();

  if (!supabase) {
    return emptyGmailIntegration();
  }

  const [{ data: organizationIntegration }, { data: userIntegration }] =
    await Promise.all([
      supabase
        .from("organization_integrations")
        .select("id, is_enabled, credentials_last4, updated_at")
        .eq("organization_id", organizationId)
        .eq("provider", "gmail")
        .maybeSingle<OrganizationIntegrationRecord>(),
      supabase
        .from("user_integrations")
        .select("id, is_enabled, credentials_last4, updated_at")
        .eq("organization_id", organizationId)
        .eq("user_id", userId)
        .eq("provider", "gmail")
        .maybeSingle<OrganizationIntegrationRecord>(),
    ]);

  return {
    id: organizationIntegration?.id ?? null,
    is_enabled: Boolean(userIntegration?.is_enabled),
    email: stringValue(userIntegration?.credentials_last4?.email) ?? null,
    oauth_configured: Boolean(
      organizationIntegration?.credentials_last4?.client_secret,
    ),
    client_id_last4:
      stringValue(organizationIntegration?.credentials_last4?.client_id) ?? null,
    user_integration_id: userIntegration?.id ?? null,
    updated_at:
      userIntegration?.updated_at ?? organizationIntegration?.updated_at ?? null,
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

export async function getAdminAuthorizeNetIntegration(
  organizationId: string,
): Promise<AdminAuthorizeNetIntegration> {
  const supabase = await createClient();

  if (!supabase) {
    return emptyAuthorizeNetIntegration();
  }

  const { data } = await supabase
    .from("organization_integrations")
    .select("id, is_enabled, config, credentials_last4, updated_at")
    .eq("organization_id", organizationId)
    .eq("provider", "authorizenet")
    .maybeSingle<OrganizationIntegrationRecord>();

  if (!data) {
    return emptyAuthorizeNetIntegration();
  }

  return {
    id: data.id,
    is_enabled: data.is_enabled,
    environment:
      stringValue(data.config?.environment) === "production"
        ? "production"
        : "sandbox",
    api_login_id_last4:
      stringValue(data.credentials_last4?.api_login_id) ?? null,
    transaction_key_configured: Boolean(
      data.credentials_last4?.transaction_key,
    ),
    updated_at: data.updated_at,
  };
}

export async function getAdminStripeIntegration(
  organizationId: string,
): Promise<AdminStripeIntegration> {
  const supabase = await createClient();

  if (!supabase) {
    return emptyStripeIntegration();
  }

  const { data } = await supabase
    .from("organization_integrations")
    .select("id, is_enabled, credentials_last4, updated_at")
    .eq("organization_id", organizationId)
    .eq("provider", "stripe")
    .maybeSingle<OrganizationIntegrationRecord>();

  if (!data) {
    return emptyStripeIntegration();
  }

  return {
    id: data.id,
    is_enabled: data.is_enabled,
    secret_key_last4: stringValue(data.credentials_last4?.secret_key) ?? null,
    webhook_secret_configured: Boolean(
      data.credentials_last4?.webhook_secret,
    ),
    updated_at: data.updated_at,
  };
}

export async function getAdminOpenAIIntegration(
  organizationId: string,
): Promise<AdminOpenAIIntegration> {
  const supabase = await createClient();

  if (!supabase) {
    return emptyOpenAIIntegration();
  }

  const { data } = await supabase
    .from("organization_integrations")
    .select("id, is_enabled, config, credentials_last4, updated_at")
    .eq("organization_id", organizationId)
    .eq("provider", "openai")
    .maybeSingle<OrganizationIntegrationRecord>();

  if (!data) {
    return emptyOpenAIIntegration();
  }

  return {
    id: data.id,
    is_enabled: data.is_enabled,
    model: stringValue(data.config?.model) ?? "gpt-5.4-mini",
    api_key_last4: stringValue(data.credentials_last4?.api_key) ?? null,
    updated_at: data.updated_at,
  };
}

export async function getAdminGoogleMapsIntegration(
  organizationId: string,
): Promise<AdminGoogleMapsIntegration> {
  const supabase = await createClient();

  if (!supabase) {
    return emptyGoogleMapsIntegration();
  }

  const { data } = await supabase
    .from("organization_integrations")
    .select("id, is_enabled, credentials_last4, updated_at")
    .eq("organization_id", organizationId)
    .eq("provider", "google_maps")
    .maybeSingle<OrganizationIntegrationRecord>();

  if (!data) {
    return emptyGoogleMapsIntegration();
  }

  return {
    id: data.id,
    is_enabled: data.is_enabled,
    api_key_last4: stringValue(data.credentials_last4?.api_key) ?? null,
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
    user_integration_id: null,
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

function emptyAuthorizeNetIntegration(): AdminAuthorizeNetIntegration {
  return {
    id: null,
    is_enabled: false,
    environment: "sandbox",
    api_login_id_last4: null,
    transaction_key_configured: false,
    updated_at: null,
  };
}

function emptyStripeIntegration(): AdminStripeIntegration {
  return {
    id: null,
    is_enabled: false,
    secret_key_last4: null,
    webhook_secret_configured: false,
    updated_at: null,
  };
}

function emptyOpenAIIntegration(): AdminOpenAIIntegration {
  return {
    id: null,
    is_enabled: false,
    model: "gpt-5.4-mini",
    api_key_last4: null,
    updated_at: null,
  };
}

function emptyGoogleMapsIntegration(): AdminGoogleMapsIntegration {
  return {
    id: null,
    is_enabled: false,
    api_key_last4: null,
    updated_at: null,
  };
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}
