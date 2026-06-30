import { redirect } from "next/navigation";

import { logAction } from "@/lib/audit/log-action";
import { getCurrentUser } from "@/lib/auth/current-user";
import {
  encryptedGmailCredentials,
  exchangeGmailCode,
  getGmailOAuthSettings,
  gmailCredentialsLast4,
  verifyGmailState,
} from "@/lib/integrations/gmail";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const user = await getCurrentUser();

  if (!user) {
    redirect("/login");
  }

  if (!state) {
    redirect("/admin/integrations/gmail?error=invalid_state");
  }

  const verifiedState = verifyGmailState(state);

  if (
    !verifiedState ||
    verifiedState.organizationId !== user.organization_id ||
    verifiedState.userId !== user.id
  ) {
    redirect("/admin/integrations/gmail?error=invalid_state");
  }

  if (!code) {
    redirect("/admin/integrations/gmail?error=missing_code");
  }

  const supabase = await createClient();

  if (!supabase) {
    redirect("/admin/integrations/gmail?error=oauth_failed");
  }

  try {
    const admin = createAdminClient();

    if (!admin) {
      redirect("/admin/integrations/gmail?error=oauth_failed");
    }

    const settings = await getGmailOAuthSettings({
      supabase: admin,
      organizationId: user.organization_id,
    });

    if (!settings) {
      redirect("/admin/integrations/gmail?error=google_not_configured");
    }

    const credentials = await exchangeGmailCode({ code, settings });
    const encrypted = encryptedGmailCredentials(credentials);
    const { data: before } = await supabase
      .from("user_integrations")
      .select("id, provider, is_enabled, config, credentials_last4, updated_at")
      .eq("organization_id", user.organization_id)
      .eq("user_id", user.id)
      .eq("provider", "gmail")
      .maybeSingle<Record<string, unknown>>();
    const { data: after, error } = await supabase
      .from("user_integrations")
      .upsert(
        {
          organization_id: user.organization_id,
          user_id: user.id,
          provider: "gmail",
          is_enabled: true,
          config: {},
          credentials_encrypted: encrypted,
          credentials_last4: gmailCredentialsLast4({
            clientId: credentials.clientId,
            clientSecret: credentials.clientSecret,
            email: credentials.email,
          }),
          updated_by: user.id,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "organization_id,user_id,provider" },
      )
      .select("id, provider, is_enabled, config, credentials_last4, updated_at")
      .single<Record<string, unknown>>();

    if (error || !after) {
      redirect("/admin/integrations/gmail?error=oauth_failed");
    }

    await logAction({
      user,
      action: "integration.gmail.connected",
      targetTable: "user_integrations",
      targetId: typeof after.id === "string" ? after.id : undefined,
      before,
      after,
    });
  } catch (error) {
    console.error(
      "Gmail OAuth connection failed",
      error instanceof Error ? error.message : "Unknown error",
    );
    redirect("/admin/integrations/gmail?error=oauth_failed");
  }

  redirect("/admin/integrations/gmail?connected=1");
}
