import type { SupabaseClient } from "@supabase/supabase-js";

import {
  decryptSecretPayload,
  encryptSecretPayload,
} from "@/lib/security/secret-box";

export type GoogleMapsIntegrationCredentials = {
  apiKey: string;
};

export type GoogleMapsIntegration = {
  id: string;
  organizationId: string;
  isEnabled: boolean;
  apiKey: string | null;
};

type GoogleMapsIntegrationRecord = {
  id: string;
  organization_id: string;
  is_enabled: boolean;
  credentials_encrypted: string | null;
};

export async function getGoogleMapsIntegration({
  supabase,
  organizationId,
}: {
  supabase: SupabaseClient;
  organizationId: string;
}): Promise<GoogleMapsIntegration | null> {
  const { data } = await supabase
    .from("organization_integrations")
    .select("id, organization_id, is_enabled, credentials_encrypted")
    .eq("organization_id", organizationId)
    .eq("provider", "google_maps")
    .maybeSingle<GoogleMapsIntegrationRecord>();

  if (!data) {
    return null;
  }

  let credentials: Partial<GoogleMapsIntegrationCredentials> | null = null;

  try {
    credentials = decryptSecretPayload<Partial<GoogleMapsIntegrationCredentials>>(
      data.credentials_encrypted,
    );
  } catch (error) {
    console.error("Google Maps credentials could not be decrypted.", error);
  }

  return {
    id: data.id,
    organizationId: data.organization_id,
    isEnabled: data.is_enabled,
    apiKey: stringValue(credentials?.apiKey),
  };
}

export function encryptedGoogleMapsCredentials(
  credentials: GoogleMapsIntegrationCredentials,
): string {
  return encryptSecretPayload(credentials);
}

export function googleMapsCredentialsLast4(
  credentials: Partial<GoogleMapsIntegrationCredentials>,
): Record<string, unknown> {
  return {
    api_key: credentials.apiKey ? last4(credentials.apiKey) : null,
  };
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function last4(value: string): string {
  return value.slice(-4);
}
