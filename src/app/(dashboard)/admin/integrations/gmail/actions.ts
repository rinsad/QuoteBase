"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { logAction } from "@/lib/audit/log-action";
import { getCurrentUser } from "@/lib/auth/current-user";
import {
  encryptedGmailOAuthSettings,
  encryptedGmailOAuthSettingsWithoutMailbox,
  gmailCredentialsLast4,
} from "@/lib/integrations/gmail";
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

export async function saveGmailOAuthSettings(formData: FormData) {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/login");
  }

  if (user.role !== "admin") {
    throw new Error("Only admins can update Gmail OAuth settings.");
  }

  const supabase = await createClient();

  if (!supabase) {
    throw new Error("Supabase is not configured for this workspace.");
  }

  const clientId = getString(formData, "client_id");
  const clientSecret = getString(formData, "client_secret");

  if (!clientId || !clientSecret) {
    throw new Error("Google OAuth client ID and client secret are required.");
  }

  const { data: before } = await supabase
    .from("organization_integrations")
    .select(
      "id, provider, is_enabled, config, credentials_encrypted, credentials_last4, updated_at",
    )
    .eq("organization_id", user.organization_id)
    .eq("provider", "gmail")
    .maybeSingle<ExistingIntegration>();
  const encrypted = encryptedGmailOAuthSettings({
    clientId,
    clientSecret,
    existingCredentials: before?.credentials_encrypted ?? null,
  });
  const { data: after, error } = await supabase
    .from("organization_integrations")
    .upsert(
      {
        organization_id: user.organization_id,
        provider: "gmail",
        is_enabled: false,
        config: {},
        credentials_encrypted: encrypted,
        credentials_last4: gmailCredentialsLast4({
          clientId,
          clientSecret,
          email: null,
        }),
        updated_by: user.id,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "organization_id,provider" },
    )
    .select("id, provider, is_enabled, config, credentials_last4, updated_at")
    .single<Record<string, unknown>>();

  if (error || !after) {
    throw new Error(error?.message ?? "Could not save Gmail OAuth settings.");
  }

  await logAction({
    user,
    action: "integration.gmail.oauth_settings_updated",
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

  revalidatePath("/admin/integrations/gmail");
  redirect("/admin/integrations/gmail?saved=1");
}

export async function disconnectGmailIntegration() {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/login");
  }

  if (user.role !== "admin") {
    throw new Error("Only admins can disconnect Gmail.");
  }

  const supabase = await createClient();

  if (!supabase) {
    throw new Error("Supabase is not configured for this workspace.");
  }

  const { data: before } = await supabase
    .from("organization_integrations")
    .select(
      "id, provider, is_enabled, config, credentials_encrypted, credentials_last4, updated_at",
    )
    .eq("organization_id", user.organization_id)
    .eq("provider", "gmail")
    .maybeSingle<ExistingIntegration>();
  const mailboxCleared = encryptedGmailOAuthSettingsWithoutMailbox(
    before?.credentials_encrypted ?? null,
  );

  const { data: after, error } = await supabase
    .from("organization_integrations")
    .upsert(
      {
        organization_id: user.organization_id,
        provider: "gmail",
        is_enabled: false,
        config: {},
        credentials_encrypted: mailboxCleared.encrypted,
        credentials_last4: mailboxCleared.last4,
        updated_by: user.id,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "organization_id,provider" },
    )
    .select("id, provider, is_enabled, config, credentials_last4, updated_at")
    .single<Record<string, unknown>>();

  if (error || !after) {
    throw new Error(error?.message ?? "Could not disconnect Gmail.");
  }

  await logAction({
    user,
    action: "integration.gmail.disconnected",
    targetTable: "organization_integrations",
    targetId: typeof after.id === "string" ? after.id : undefined,
    before,
    after,
  });

  revalidatePath("/admin/integrations/gmail");
  redirect("/admin/integrations/gmail?disconnected=1");
}

function getString(formData: FormData, key: string): string {
  const value = formData.get(key);

  return typeof value === "string" ? value.trim() : "";
}
