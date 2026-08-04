import type { SupabaseClient } from "@supabase/supabase-js";

import {
  decryptSecretPayload,
  encryptSecretPayload,
} from "@/lib/security/secret-box";

export type MapboxCredentials = {
  publicAccessToken: string;
};

export type MapboxIntegration = {
  id: string;
  isEnabled: boolean;
  publicAccessToken: string | null;
};

type MapboxIntegrationRecord = {
  id: string;
  is_enabled: boolean;
  credentials_encrypted: string | null;
};

export async function getMapboxIntegration({
  supabase,
  organizationId,
}: {
  supabase: SupabaseClient;
  organizationId: string;
}): Promise<MapboxIntegration | null> {
  const { data } = await supabase
    .from("organization_integrations")
    .select("id, is_enabled, credentials_encrypted")
    .eq("organization_id", organizationId)
    .eq("provider", "mapbox")
    .maybeSingle<MapboxIntegrationRecord>();

  if (!data) {
    return null;
  }

  let credentials: Partial<MapboxCredentials> | null = null;

  try {
    credentials = decryptSecretPayload<Partial<MapboxCredentials>>(
      data.credentials_encrypted,
    );
  } catch (error) {
    console.error("Mapbox credentials could not be decrypted.", error);
  }

  return {
    id: data.id,
    isEnabled: data.is_enabled,
    publicAccessToken: stringValue(credentials?.publicAccessToken),
  };
}

export function encryptedMapboxCredentials(
  credentials: MapboxCredentials,
): string {
  return encryptSecretPayload(credentials);
}

export function mapboxCredentialsLast4(
  credentials: Partial<MapboxCredentials>,
): Record<string, unknown> {
  return {
    public_access_token: credentials.publicAccessToken
      ? last4(credentials.publicAccessToken)
      : null,
  };
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function last4(value: string): string {
  return value.slice(-4);
}
