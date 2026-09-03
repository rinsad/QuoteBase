import { redirect } from "next/navigation";

import { getCurrentUser } from "@/lib/auth/current-user";
import {
  createGoogleSheetsAuthorizationUrl,
  type GoogleSheetsIntegrationRecord,
} from "@/lib/integrations/google-sheets";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET(): Promise<never> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role !== "admin") {
    redirect("/admin/integrations/google-sheets?error=unauthorized");
  }

  const supabase = createAdminClient();
  if (!supabase) {
    redirect("/admin/integrations/google-sheets?error=oauth_failed");
  }
  const { data: integration } = await supabase
    .from("organization_integrations")
    .select(
      "id, organization_id, is_enabled, config, credentials_encrypted, credentials_last4, updated_at",
    )
    .eq("organization_id", user.organization_id)
    .eq("provider", "google_sheets")
    .maybeSingle<GoogleSheetsIntegrationRecord>();

  if (!integration) {
    redirect("/admin/integrations/google-sheets?error=oauth_not_configured");
  }

  let authorizationUrl: string;
  try {
    authorizationUrl = await createGoogleSheetsAuthorizationUrl({
      integration,
      organizationId: user.organization_id,
      userId: user.id,
    });
  } catch {
    redirect("/admin/integrations/google-sheets?error=oauth_not_configured");
  }

  redirect(authorizationUrl);
}
