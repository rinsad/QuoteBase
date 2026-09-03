import { apiOk, forbidden, serverError } from "@/lib/api/responses";
import type { GoogleSheetsIntegrationRecord } from "@/lib/integrations/google-sheets";
import {
  recordGoogleSheetsSyncFailure,
  runGoogleSheetsSync,
} from "@/lib/integrations/google-sheets-sync";
import { createAdminClient } from "@/lib/supabase/admin";

export const maxDuration = 300;

export async function GET(request: Request): Promise<Response> {
  const cronSecret = process.env.CRON_SECRET;

  if (
    !cronSecret ||
    request.headers.get("authorization") !== `Bearer ${cronSecret}`
  ) {
    return forbidden("Invalid cron secret.");
  }

  const supabase = createAdminClient();
  if (!supabase) {
    return serverError("Supabase admin access is not configured.");
  }

  const { data: integrations, error } = await supabase
    .from("organization_integrations")
    .select(
      "id, organization_id, is_enabled, config, credentials_encrypted, credentials_last4, updated_at",
    )
    .eq("provider", "google_sheets")
    .eq("is_enabled", true)
    .returns<GoogleSheetsIntegrationRecord[]>();

  if (error) {
    console.error("Could not load Google Sheets integrations.", error.message);
    return serverError("Could not load Google Sheets integrations.");
  }

  let succeeded = 0;
  let failed = 0;

  for (const integration of integrations ?? []) {
    try {
      await runGoogleSheetsSync({ supabase, integration });
      succeeded += 1;
    } catch (syncError) {
      failed += 1;
      await recordGoogleSheetsSyncFailure({
        supabase,
        integration,
        error: syncError,
      });
      console.error(
        "Google Sheets synchronization failed.",
        integration.organization_id,
        syncError instanceof Error ? syncError.message : "Unknown error",
      );
    }
  }

  return apiOk({
    processed: integrations?.length ?? 0,
    succeeded,
    failed,
  });
}
