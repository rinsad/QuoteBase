"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { logAction } from "@/lib/audit/log-action";
import { getCurrentUser } from "@/lib/auth/current-user";
import {
  encryptedMapboxCredentials,
  mapboxCredentialsLast4,
  type MapboxCredentials,
} from "@/lib/integrations/mapbox";
import { decryptSecretPayload } from "@/lib/security/secret-box";
import { createClient } from "@/lib/supabase/server";

type ExistingIntegration = {
  id: string;
  provider: string;
  is_enabled: boolean;
  config: Record<string, unknown> | null;
  credentials_encrypted: string | null;
  credentials_last4: Record<string, unknown> | null;
  updated_at: string;
};

const mapboxSettingsSchema = z.object({
  is_enabled: z.boolean(),
  public_access_token: z.string().trim().max(260).optional().default(""),
});

export async function saveMapboxIntegration(formData: FormData) {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/login");
  }

  if (user.role !== "admin") {
    throw new Error("Only admins can update Mapbox settings.");
  }

  const supabase = await createClient();

  if (!supabase) {
    throw new Error("Supabase is not configured for this workspace.");
  }

  const parsed = mapboxSettingsSchema.safeParse({
    is_enabled: formData.get("is_enabled") === "on",
    public_access_token: getString(formData, "public_access_token"),
  });

  if (!parsed.success) {
    throw new Error(parsed.error.issues[0]?.message ?? "Invalid Mapbox settings.");
  }

  const { data: before } = await supabase
    .from("organization_integrations")
    .select(
      "id, provider, is_enabled, config, credentials_encrypted, credentials_last4, updated_at",
    )
    .eq("organization_id", user.organization_id)
    .eq("provider", "mapbox")
    .maybeSingle<ExistingIntegration>();

  let previousCredentials: Partial<MapboxCredentials> | null = null;

  try {
    previousCredentials = decryptSecretPayload<Partial<MapboxCredentials>>(
      before?.credentials_encrypted ?? null,
    );
  } catch (error) {
    console.error("Existing Mapbox credentials could not be decrypted.", error);
  }

  const credentials: MapboxCredentials = {
    publicAccessToken:
      parsed.data.public_access_token ||
      previousCredentials?.publicAccessToken ||
      "",
  };

  if (parsed.data.is_enabled && !credentials.publicAccessToken) {
    throw new Error("A Mapbox public access token is required when Mapbox is enabled.");
  }

  if (
    credentials.publicAccessToken &&
    !credentials.publicAccessToken.startsWith("pk.")
  ) {
    throw new Error("Mapbox browser/search token should start with pk.");
  }

  const credentialsEncrypted = credentials.publicAccessToken
    ? encryptedMapboxCredentials(credentials)
    : null;
  const credentialsLast4 = mapboxCredentialsLast4(credentials);

  const { data: after, error } = await supabase
    .from("organization_integrations")
    .upsert(
      {
        organization_id: user.organization_id,
        provider: "mapbox",
        is_enabled: parsed.data.is_enabled,
        config: {},
        credentials_encrypted: credentialsEncrypted,
        credentials_last4: credentialsLast4,
        updated_by: user.id,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "organization_id,provider" },
    )
    .select("id, provider, is_enabled, config, credentials_last4, updated_at")
    .single<Record<string, unknown>>();

  if (error || !after) {
    throw new Error(error?.message ?? "Could not save Mapbox settings.");
  }

  await logAction({
    user,
    action: "integration.mapbox.updated",
    targetTable: "organization_integrations",
    targetId: typeof after.id === "string" ? after.id : undefined,
    before: before
      ? {
          id: before.id,
          provider: before.provider,
          is_enabled: before.is_enabled,
          config: before.config,
          credentials_last4: before.credentials_last4,
          updated_at: before.updated_at,
        }
      : null,
    after,
  });

  revalidatePath("/admin/integrations/mapbox");
  redirect("/admin/integrations/mapbox?saved=1");
}

function getString(formData: FormData, key: string): string {
  const value = formData.get(key);

  return typeof value === "string" ? value.trim() : "";
}
