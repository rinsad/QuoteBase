"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { logAction } from "@/lib/audit/log-action";
import { getCurrentUser } from "@/lib/auth/current-user";
import { encryptedSlackCredentials } from "@/lib/integrations/slack";
import { decryptSecretPayload } from "@/lib/security/secret-box";
import { createClient } from "@/lib/supabase/server";

type SlackCredentials = {
  webhookUrl?: string;
  signingSecret?: string;
  botToken?: string;
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

export async function saveSlackIntegration(formData: FormData) {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/login");
  }

  if (user.role !== "admin") {
    throw new Error("Only admins can update Slack integration settings.");
  }

  const supabase = await createClient();

  if (!supabase) {
    throw new Error("Supabase is not configured for this workspace.");
  }

  const isEnabled = formData.get("is_enabled") === "on";
  const approverEmail = getString(formData, "approver_email").toLowerCase();
  const channelName = normalizeChannelName(getString(formData, "channel_name"));
  const webhookUrl = getString(formData, "webhook_url");
  const signingSecret = getString(formData, "signing_secret");
  const botToken = getString(formData, "bot_token");

  if (isEnabled && !approverEmail) {
    redirectSlackError("Approver email is required when Slack is enabled.");
  }

  if (approverEmail) {
    const { data: approver } = await supabase
      .from("users")
      .select("id")
      .eq("organization_id", user.organization_id)
      .eq("email", approverEmail)
      .eq("is_active", true)
      .eq("role", "admin")
      .maybeSingle<{ id: string }>();

    if (!approver) {
      redirectSlackError(
        "Approver email must belong to an active admin in this organization.",
      );
    }
  }

  const { data: before } = await supabase
    .from("organization_integrations")
    .select(
      "id, provider, is_enabled, config, credentials_encrypted, credentials_last4, updated_at",
    )
    .eq("organization_id", user.organization_id)
    .eq("provider", "slack")
    .maybeSingle<ExistingIntegration>();

  const previousCredentialsResult = getPreviousSlackCredentials(
    before?.credentials_encrypted ?? null,
  );
  const previousCredentials = previousCredentialsResult.credentials;
  const credentials = {
    webhookUrl: webhookUrl || previousCredentials?.webhookUrl,
    signingSecret: signingSecret || previousCredentials?.signingSecret,
    botToken: botToken || previousCredentials?.botToken,
  };

  if (
    previousCredentialsResult.invalid &&
    (!webhookUrl || !signingSecret)
  ) {
    redirectSlackError(
      "Saved Slack credentials cannot be read with the current encryption key. Re-enter the incoming webhook URL and signing secret, then save again.",
    );
  }

  if (isEnabled && (!credentials.webhookUrl || !credentials.signingSecret)) {
    redirectSlackError(
      "Webhook URL and signing secret are required when Slack is enabled.",
    );
  }

  const credentialsEncrypted =
    credentials.webhookUrl || credentials.signingSecret || credentials.botToken
      ? encryptedSlackCredentials(credentials)
      : null;
  const credentialsLast4 = {
    webhook_url: Boolean(credentials.webhookUrl),
    signing_secret: Boolean(credentials.signingSecret),
    bot_token: Boolean(credentials.botToken),
  };

  const { data: after, error } = await supabase
    .from("organization_integrations")
    .upsert(
      {
        organization_id: user.organization_id,
        provider: "slack",
        is_enabled: isEnabled,
        config: {
          approver_email: approverEmail || null,
          channel_name: channelName || null,
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
    redirectSlackError(error?.message ?? "Could not save Slack integration.");
  }

  await logAction({
    user,
    action: "integration.slack.updated",
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

  revalidatePath("/admin/integrations/slack");
  redirect("/admin/integrations/slack?saved=1");
}

function getString(formData: FormData, key: string): string {
  const value = formData.get(key);

  return typeof value === "string" ? value.trim() : "";
}

function normalizeChannelName(value: string): string {
  if (!value) {
    return "";
  }

  return value.startsWith("#") ? value : `#${value}`;
}

function getPreviousSlackCredentials(value: string | null): {
  credentials: SlackCredentials | null;
  invalid: boolean;
} {
  try {
    return {
      credentials: decryptSecretPayload<SlackCredentials>(value),
      invalid: false,
    };
  } catch {
    return {
      credentials: null,
      invalid: Boolean(value),
    };
  }
}

function redirectSlackError(message: string): never {
  redirect(`/admin/integrations/slack?error=${encodeURIComponent(message)}`);
}
