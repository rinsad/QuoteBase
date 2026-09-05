"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { logAction } from "@/lib/audit/log-action";
import { getCurrentUser } from "@/lib/auth/current-user";
import {
  credentialsLast4,
  disconnectedGoogleSheetsCredentials,
  encryptedGoogleSheetsCredentials,
  mergeOAuthSettings,
  normalizeGoogleSheetsConfig,
  parseSpreadsheetId,
  type GoogleSheetsIntegrationRecord,
} from "@/lib/integrations/google-sheets";
import {
  recordGoogleSheetsSyncFailure,
  runGoogleSheetsSync,
} from "@/lib/integrations/google-sheets-sync";
import { createClient } from "@/lib/supabase/server";

const oauthSchema = z.object({
  client_id: z.string().trim().min(10).max(500),
  client_secret: z.string().trim().min(8).max(500),
});
const linkSchema = z.object({
  spreadsheet_url: z.string().trim().min(20).max(1000),
  header_row: z.coerce.number().int().min(1).max(100),
  address_column: columnSchema(),
  material_column: columnSchema(),
  price_column: columnSchema(),
  unit_column: columnSchema(),
  last_updated_column: columnSchema(),
  inventory_column: columnSchema(),
  hours_column: columnSchema(),
});

export async function saveGoogleSheetsOAuthSettings(
  formData: FormData,
): Promise<void> {
  const { user, supabase } = await requireAdmin();
  const input = oauthSchema.parse(Object.fromEntries(formData));
  const before = await getIntegration(supabase, user.organization_id);
  const credentials = mergeOAuthSettings({
    encrypted: before?.credentials_encrypted ?? null,
    clientId: input.client_id,
    clientSecret: input.client_secret,
  });
  const { data: after, error } = await supabase
    .from("organization_integrations")
    .upsert(
      {
        organization_id: user.organization_id,
        provider: "google_sheets",
        is_enabled: before?.is_enabled ?? false,
        config: before?.config ?? {},
        credentials_encrypted: encryptedGoogleSheetsCredentials(credentials),
        credentials_last4: credentialsLast4(credentials),
        updated_by: user.id,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "organization_id,provider" },
    )
    .select("id, provider, is_enabled, config, credentials_last4, updated_at")
    .single<Record<string, unknown>>();

  if (error || !after) {
    throw new Error(error?.message ?? "Could not save Google OAuth settings.");
  }

  await logAction({
    user,
    supabase,
    action: "integration.google_sheets.oauth_settings_updated",
    targetTable: "organization_integrations",
    targetId: typeof after.id === "string" ? after.id : undefined,
    before: publicIntegration(before),
    after,
  });
  revalidatePath("/admin/integrations/google-sheets");
  redirect("/admin/integrations/google-sheets?saved=1");
}

export async function saveGoogleSheetsLink(formData: FormData): Promise<void> {
  const { user, supabase } = await requireAdmin();
  const input = linkSchema.parse(Object.fromEntries(formData));
  const spreadsheetId = parseSpreadsheetId(input.spreadsheet_url);

  if (!spreadsheetId) {
    throw new Error("Enter a valid Google Sheets URL.");
  }

  const before = await getIntegration(supabase, user.organization_id);
  if (!before?.credentials_last4?.connected) {
    throw new Error("Connect a Google account before linking a spreadsheet.");
  }

  const existingConfig = normalizeGoogleSheetsConfig(before.config);
  const config = {
    ...existingConfig,
    spreadsheetId,
    spreadsheetUrl: input.spreadsheet_url,
    headerRow: input.header_row,
    columns: {
      address: input.address_column,
      material: input.material_column,
      price: input.price_column,
      unit: input.unit_column,
      lastUpdated: input.last_updated_column,
      inventory: input.inventory_column,
      hours: input.hours_column,
    },
    connectedBy: user.id,
  };
  const { data: integration, error } = await supabase
    .from("organization_integrations")
    .update({
      is_enabled: true,
      config,
      updated_by: user.id,
      updated_at: new Date().toISOString(),
    })
    .eq("organization_id", user.organization_id)
    .eq("id", before.id)
    .eq("provider", "google_sheets")
    .select(
      "id, organization_id, is_enabled, config, credentials_encrypted, credentials_last4, updated_at",
    )
    .single<GoogleSheetsIntegrationRecord>();

  if (error || !integration) {
    throw new Error(error?.message ?? "Could not link the spreadsheet.");
  }

  try {
    await runGoogleSheetsSync({ supabase, integration });
  } catch (syncError) {
    await recordGoogleSheetsSyncFailure({
      supabase,
      integration,
      error: syncError,
    });
    throw syncError;
  }

  await logAction({
    user,
    supabase,
    action: "integration.google_sheets.linked",
    targetTable: "organization_integrations",
    targetId: integration.id,
    before: publicIntegration(before),
    after: publicIntegration(integration),
  });
  revalidateSyncPaths();
  redirect("/admin/integrations/google-sheets?linked=1");
}

export async function runGoogleSheetsSyncNow(): Promise<void> {
  const { user, supabase } = await requireAdmin();
  const integration = await getIntegration(supabase, user.organization_id);

  if (!integration) {
    throw new Error("Google Sheets integration was not found.");
  }

  const startedAt = Date.now();
  console.info(JSON.stringify({
    level: "info",
    message: "Google Sheets manual synchronization started.",
    organizationId: user.organization_id,
  }));
  try {
    const summary = await runGoogleSheetsSync({ supabase, integration });
    console.info(JSON.stringify({
      level: "info",
      message: "Google Sheets manual synchronization completed.",
      organizationId: user.organization_id,
      durationMs: Date.now() - startedAt,
      summary,
    }));
  } catch (syncError) {
    await recordGoogleSheetsSyncFailure({
      supabase,
      integration,
      error: syncError,
    });
    console.error(JSON.stringify({
      level: "error",
      message: "Google Sheets manual synchronization failed.",
      organizationId: user.organization_id,
      durationMs: Date.now() - startedAt,
      error: syncError instanceof Error ? syncError.message : "Unknown error",
    }));
    throw syncError;
  }

  revalidateSyncPaths();
  redirect("/admin/integrations/google-sheets?synced=1");
}

export async function disconnectGoogleSheets(): Promise<void> {
  const { user, supabase } = await requireAdmin();
  const before = await getIntegration(supabase, user.organization_id);
  if (!before) {
    redirect("/admin/integrations/google-sheets");
  }

  const disconnected = disconnectedGoogleSheetsCredentials(
    before.credentials_encrypted,
  );
  const { data: after, error } = await supabase
    .from("organization_integrations")
    .update({
      is_enabled: false,
      credentials_encrypted: disconnected.encrypted,
      credentials_last4: disconnected.last4,
      updated_by: user.id,
      updated_at: new Date().toISOString(),
    })
    .eq("organization_id", user.organization_id)
    .eq("id", before.id)
    .eq("provider", "google_sheets")
    .select("id, provider, is_enabled, config, credentials_last4, updated_at")
    .single<Record<string, unknown>>();
  if (error || !after) {
    throw new Error(error?.message ?? "Could not disconnect Google Sheets.");
  }

  await logAction({
    user,
    supabase,
    action: "integration.google_sheets.disconnected",
    targetTable: "organization_integrations",
    targetId: before.id,
    before: publicIntegration(before),
    after,
  });
  revalidateSyncPaths();
  redirect("/admin/integrations/google-sheets?disconnected=1");
}

async function requireAdmin() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role !== "admin") {
    throw new Error("Only admins can manage Google Sheets synchronization.");
  }
  const supabase = await createClient();
  if (!supabase) throw new Error("Supabase is not configured.");
  return { user, supabase };
}

async function getIntegration(
  supabase: NonNullable<Awaited<ReturnType<typeof createClient>>>,
  organizationId: string,
): Promise<GoogleSheetsIntegrationRecord | null> {
  const { data, error } = await supabase
    .from("organization_integrations")
    .select(
      "id, organization_id, is_enabled, config, credentials_encrypted, credentials_last4, updated_at",
    )
    .eq("organization_id", organizationId)
    .eq("provider", "google_sheets")
    .maybeSingle<GoogleSheetsIntegrationRecord>();
  if (error) throw new Error(error.message);
  return data;
}

function publicIntegration(
  integration: GoogleSheetsIntegrationRecord | null,
): Record<string, unknown> | null {
  if (!integration) return null;
  return {
    id: integration.id,
    is_enabled: integration.is_enabled,
    config: integration.config,
    credentials_last4: integration.credentials_last4,
    updated_at: integration.updated_at,
  };
}

function columnSchema() {
  return z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z]{1,3}$/);
}

function revalidateSyncPaths(): void {
  revalidatePath("/admin/integrations/google-sheets");
  revalidatePath("/admin/suppliers");
  revalidatePath("/admin/plants");
  revalidatePath("/admin/material-prices");
  revalidatePath("/quotes/new");
}
