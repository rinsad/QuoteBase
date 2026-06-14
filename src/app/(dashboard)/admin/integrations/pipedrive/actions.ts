"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { logAction } from "@/lib/audit/log-action";
import { getCurrentUser } from "@/lib/auth/current-user";
import {
  encryptedPipedriveCredentials,
  pushUnsyncedQuoteBaseCustomersToPipedrive,
  syncPipedriveCustomersForOrganization,
} from "@/lib/integrations/pipedrive";
import { decryptSecretPayload } from "@/lib/security/secret-box";
import { createAdminClient } from "@/lib/supabase/admin";
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

const pipedriveSettingsSchema = z.object({
  is_enabled: z.boolean(),
  api_base_url: z
    .string()
    .trim()
    .url("Enter a valid Pipedrive API base URL.")
    .default("https://api.pipedrive.com/v1"),
  sync_interval_minutes: z.coerce.number().int().min(1).max(1440).default(30),
  api_token: z.string().trim().optional().default(""),
});
const OUTBOUND_PUSH_LIMIT = 500;

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

  const parsed = pipedriveSettingsSchema.safeParse({
    is_enabled: formData.get("is_enabled") === "on",
    api_base_url:
      getString(formData, "api_base_url") || "https://api.pipedrive.com/v1",
    sync_interval_minutes: getString(formData, "sync_interval_minutes") || 30,
    api_token: getString(formData, "api_token"),
  });

  if (!parsed.success) {
    throw new Error(parsed.error.issues[0]?.message ?? "Invalid Pipedrive settings.");
  }

  const {
    is_enabled: isEnabled,
    api_base_url: apiBaseUrl,
    sync_interval_minutes: syncIntervalMinutes,
    api_token: apiToken,
  } = parsed.data;

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

export async function syncPipedriveNow() {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/login");
  }

  if (user.role !== "admin") {
    throw new Error("Only admins can sync Pipedrive customers.");
  }

  const admin = createAdminClient();

  if (!admin) {
    throw new Error("Supabase admin client is not configured.");
  }

  const pullResult = await syncPipedriveCustomersForOrganization({
    supabase: admin,
    organizationId: user.organization_id,
  });
  const pushResult = await pushUnsyncedQuoteBaseCustomersToPipedrive({
    supabase: admin,
    user,
    limit: OUTBOUND_PUSH_LIMIT,
  });
  const result = {
    pull: pullResult,
    push: pushResult,
  };

  await logAction({
    user,
    action: "integration.pipedrive.manual_sync",
    targetTable: "organization_integrations",
    after: result,
  });

  revalidatePath("/customers");
  revalidatePath("/quotes/new");
  revalidatePath("/admin/integrations/pipedrive");

  const params = new URLSearchParams({
    synced: "1",
    imported: String(pullResult.imported),
    skipped: pullResult.skipped ? "1" : "0",
    pushed: String(pushResult.pushed),
    attempted: String(pushResult.attempted),
    failed: String(pushResult.failed),
    eligible: String(pushResult.eligible),
  });

  redirect(`/admin/integrations/pipedrive?${params.toString()}`);
}

function getString(formData: FormData, key: string): string {
  const value = formData.get(key);

  return typeof value === "string" ? value.trim() : "";
}
