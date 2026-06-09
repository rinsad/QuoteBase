"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { logAction } from "@/lib/audit/log-action";
import { getCurrentUser } from "@/lib/auth/current-user";
import { encryptedPipedriveCredentials } from "@/lib/integrations/pipedrive";
import { decryptSecretPayload } from "@/lib/security/secret-box";
import { createClient } from "@/lib/supabase/server";

type PipedriveCredentials = {
  apiToken?: string;
};

type ExistingIntegration = {
  id: string;
  provider: string;
  is_enabled: boolean;
  config: Record<string, unknown> | null;
  credentials_encrypted: string | null;
  credentials_last4: Record<string, unknown> | null;
  updated_at: string;
};

export async function savePipedriveIntegration(formData: FormData) {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/login");
  }

  if (user.role !== "admin") {
    throw new Error("Only admins can update Pipedrive integration settings.");
  }

  const supabase = await createClient();

  if (!supabase) {
    throw new Error("Supabase is not configured for this workspace.");
  }

  const isEnabled = formData.get("is_enabled") === "on";
  const apiBaseUrl =
    getString(formData, "api_base_url") || "https://api.pipedrive.com/v1";
  const syncIntervalMinutes = getPositiveInteger(
    formData,
    "sync_interval_minutes",
    30,
  );
  const apiToken = getString(formData, "api_token");

  const { data: before } = await supabase
    .from("organization_integrations")
    .select(
      "id, provider, is_enabled, config, credentials_encrypted, credentials_last4, updated_at",
    )
    .eq("organization_id", user.organization_id)
    .eq("provider", "pipedrive")
    .maybeSingle<ExistingIntegration>();

  const previousCredentials = decryptSecretPayload<PipedriveCredentials>(
    before?.credentials_encrypted ?? null,
  );
  const credentials = {
    apiToken: apiToken || previousCredentials?.apiToken,
  };

  if (isEnabled && !credentials.apiToken) {
    throw new Error("Pipedrive API token is required when enabled.");
  }

  const credentialsEncrypted =
    credentials.apiToken
      ? encryptedPipedriveCredentials(credentials)
      : null;
  const credentialsLast4 = {
    api_token: Boolean(credentials.apiToken),
  };

  const { data: after, error } = await supabase
    .from("organization_integrations")
    .upsert(
      {
        organization_id: user.organization_id,
        provider: "pipedrive",
        is_enabled: isEnabled,
        config: {
          api_base_url: apiBaseUrl,
          sync_interval_minutes: syncIntervalMinutes,
          source_of_truth: "pipedrive",
        },
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
    throw new Error(error?.message ?? "Could not save Pipedrive integration.");
  }

  await logAction({
    user,
    action: "integration.pipedrive.updated",
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

  revalidatePath("/admin/integrations/pipedrive");
  redirect("/admin/integrations/pipedrive?saved=1");
}

function getString(formData: FormData, key: string): string {
  const value = formData.get(key);

  return typeof value === "string" ? value.trim() : "";
}

function getPositiveInteger(
  formData: FormData,
  key: string,
  fallback: number,
): number {
  const value = Number(getString(formData, key));

  if (!Number.isInteger(value) || value <= 0 || value > 1440) {
    return fallback;
  }

  return value;
}
