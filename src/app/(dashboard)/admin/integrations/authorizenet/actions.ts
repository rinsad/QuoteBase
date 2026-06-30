"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { logAction } from "@/lib/audit/log-action";
import { getCurrentUser } from "@/lib/auth/current-user";
import {
  authorizeNetCredentialsLast4,
  encryptedAuthorizeNetCredentials,
  type AuthorizeNetCredentials,
} from "@/lib/integrations/authorizenet";
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

const authorizeNetSettingsSchema = z.object({
  is_enabled: z.boolean(),
  environment: z.enum(["sandbox", "production"]).default("sandbox"),
  api_login_id: z.string().trim().max(120).optional().default(""),
  transaction_key: z.string().trim().max(180).optional().default(""),
});

export async function saveAuthorizeNetIntegration(formData: FormData) {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/login");
  }

  if (user.role !== "admin") {
    throw new Error("Only admins can update Authorize.net settings.");
  }

  const supabase = await createClient();

  if (!supabase) {
    throw new Error("Supabase is not configured for this workspace.");
  }

  const parsed = authorizeNetSettingsSchema.safeParse({
    is_enabled: formData.get("is_enabled") === "on",
    environment: getString(formData, "environment") || "sandbox",
    api_login_id: getString(formData, "api_login_id"),
    transaction_key: getString(formData, "transaction_key"),
  });

  if (!parsed.success) {
    throw new Error(
      parsed.error.issues[0]?.message ?? "Invalid Authorize.net settings.",
    );
  }

  const { data: before } = await supabase
    .from("organization_integrations")
    .select(
      "id, provider, is_enabled, config, credentials_encrypted, credentials_last4, updated_at",
    )
    .eq("organization_id", user.organization_id)
    .eq("provider", "authorizenet")
    .maybeSingle<ExistingIntegration>();

  let previousCredentials: Partial<AuthorizeNetCredentials> | null = null;

  try {
    previousCredentials = decryptSecretPayload<Partial<AuthorizeNetCredentials>>(
      before?.credentials_encrypted ?? null,
    );
  } catch (error) {
    console.error("Existing Authorize.net credentials could not be decrypted.", error);
  }

  const credentials: AuthorizeNetCredentials = {
    apiLoginId:
      parsed.data.api_login_id || previousCredentials?.apiLoginId || "",
    transactionKey:
      parsed.data.transaction_key || previousCredentials?.transactionKey || "",
  };

  if (parsed.data.is_enabled && (!credentials.apiLoginId || !credentials.transactionKey)) {
    throw new Error(
      "API Login ID and Transaction Key are required when Authorize.net is enabled.",
    );
  }

  const credentialsEncrypted =
    credentials.apiLoginId && credentials.transactionKey
      ? encryptedAuthorizeNetCredentials(credentials)
      : null;
  const credentialsLast4 = authorizeNetCredentialsLast4(credentials);

  const { data: after, error } = await supabase
    .from("organization_integrations")
    .upsert(
      {
        organization_id: user.organization_id,
        provider: "authorizenet",
        is_enabled: parsed.data.is_enabled,
        config: {
          environment: parsed.data.environment,
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
    throw new Error(error?.message ?? "Could not save Authorize.net settings.");
  }

  await logAction({
    user,
    action: "integration.authorizenet.updated",
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

  revalidatePath("/admin/integrations/authorizenet");
  redirect("/admin/integrations/authorizenet?saved=1");
}

function getString(formData: FormData, key: string): string {
  const value = formData.get(key);

  return typeof value === "string" ? value.trim() : "";
}
