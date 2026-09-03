import { redirect } from "next/navigation";
import { z } from "zod";

import { logAction } from "@/lib/audit/log-action";
import { getCurrentUser } from "@/lib/auth/current-user";
import {
  credentialsLast4,
  encryptedGoogleSheetsCredentials,
  exchangeGoogleSheetsCode,
  normalizeGoogleSheetsConfig,
  verifyGoogleSheetsState,
  type GoogleSheetsIntegrationRecord,
} from "@/lib/integrations/google-sheets";
import { createAdminClient } from "@/lib/supabase/admin";

const callbackSchema = z.object({
  code: z.string().trim().min(1).max(4096),
  state: z.string().trim().min(1).max(4096),
});

export async function GET(request: Request): Promise<never> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role !== "admin") {
    redirect("/admin/integrations/google-sheets?error=unauthorized");
  }

  const url = new URL(request.url);
  const callback = callbackSchema.safeParse({
    code: url.searchParams.get("code"),
    state: url.searchParams.get("state"),
  });
  const verified = callback.success
    ? verifyGoogleSheetsState(callback.data.state)
    : null;

  if (
    !callback.success ||
    !verified ||
    verified.organizationId !== user.organization_id ||
    verified.userId !== user.id
  ) {
    redirect("/admin/integrations/google-sheets?error=invalid_oauth");
  }

  const supabase = createAdminClient();
  if (!supabase) {
    redirect("/admin/integrations/google-sheets?error=oauth_failed");
  }
  const { data: before } = await supabase
    .from("organization_integrations")
    .select(
      "id, organization_id, is_enabled, config, credentials_encrypted, credentials_last4, updated_at",
    )
    .eq("organization_id", user.organization_id)
    .eq("provider", "google_sheets")
    .maybeSingle<GoogleSheetsIntegrationRecord>();

  if (!before) {
    redirect("/admin/integrations/google-sheets?error=oauth_not_configured");
  }

  try {
    const credentials = await exchangeGoogleSheetsCode({
      code: callback.data.code,
      integration: before,
    });
    const config = {
      ...normalizeGoogleSheetsConfig(before.config),
      connectedBy: user.id,
    };
    const { data: after, error } = await supabase
      .from("organization_integrations")
      .update({
        config,
        credentials_encrypted: encryptedGoogleSheetsCredentials(credentials),
        credentials_last4: credentialsLast4(credentials),
        updated_by: user.id,
        updated_at: new Date().toISOString(),
      })
      .eq("organization_id", user.organization_id)
      .eq("id", before.id)
      .eq("provider", "google_sheets")
      .select("id, provider, is_enabled, config, credentials_last4, updated_at")
      .single<Record<string, unknown>>();

    if (error || !after) {
      throw new Error(error?.message ?? "Could not save Google credentials.");
    }

    await logAction({
      user,
      supabase,
      action: "integration.google_sheets.connected",
      targetTable: "organization_integrations",
      targetId: before.id,
      before: {
        is_enabled: before.is_enabled,
        config: before.config,
        credentials_last4: before.credentials_last4,
      },
      after,
    });
  } catch (error) {
    console.error(
      "Google Sheets OAuth failed.",
      error instanceof Error ? error.message : "Unknown error",
    );
    redirect("/admin/integrations/google-sheets?error=oauth_failed");
  }

  redirect("/admin/integrations/google-sheets?connected=1");
}
