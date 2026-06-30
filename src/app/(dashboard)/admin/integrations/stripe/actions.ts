"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { logAction } from "@/lib/audit/log-action";
import { getCurrentUser } from "@/lib/auth/current-user";
import {
  encryptedStripeCredentials,
  stripeCredentialsLast4,
  type StripeCredentials,
} from "@/lib/integrations/stripe";
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

const stripeSettingsSchema = z.object({
  is_enabled: z.boolean(),
  secret_key: z.string().trim().max(240).optional().default(""),
  webhook_secret: z.string().trim().max(240).optional().default(""),
});

export async function saveStripeIntegration(formData: FormData) {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/login");
  }

  if (user.role !== "admin") {
    throw new Error("Only admins can update Stripe settings.");
  }

  const supabase = await createClient();

  if (!supabase) {
    throw new Error("Supabase is not configured for this workspace.");
  }

  const parsed = stripeSettingsSchema.safeParse({
    is_enabled: formData.get("is_enabled") === "on",
    secret_key: getString(formData, "secret_key"),
    webhook_secret: getString(formData, "webhook_secret"),
  });

  if (!parsed.success) {
    throw new Error(parsed.error.issues[0]?.message ?? "Invalid Stripe settings.");
  }

  const { data: before } = await supabase
    .from("organization_integrations")
    .select(
      "id, provider, is_enabled, config, credentials_encrypted, credentials_last4, updated_at",
    )
    .eq("organization_id", user.organization_id)
    .eq("provider", "stripe")
    .maybeSingle<ExistingIntegration>();

  let previousCredentials: Partial<StripeCredentials> | null = null;

  try {
    previousCredentials = decryptSecretPayload<Partial<StripeCredentials>>(
      before?.credentials_encrypted ?? null,
    );
  } catch (error) {
    console.error("Existing Stripe credentials could not be decrypted.", error);
  }

  const credentials: StripeCredentials = {
    secretKey: parsed.data.secret_key || previousCredentials?.secretKey || "",
    webhookSecret:
      parsed.data.webhook_secret || previousCredentials?.webhookSecret || "",
  };

  if (parsed.data.is_enabled && !credentials.secretKey) {
    throw new Error("A Stripe secret key is required when Stripe is enabled.");
  }

  if (
    credentials.secretKey &&
    !credentials.secretKey.startsWith("sk_test_") &&
    !credentials.secretKey.startsWith("sk_live_")
  ) {
    throw new Error("Stripe secret key must start with sk_test_ or sk_live_.");
  }

  if (
    credentials.webhookSecret &&
    !credentials.webhookSecret.startsWith("whsec_")
  ) {
    throw new Error("Stripe webhook signing secret must start with whsec_.");
  }

  const credentialsEncrypted = credentials.secretKey
    ? encryptedStripeCredentials(credentials)
    : null;
  const credentialsLast4 = stripeCredentialsLast4(credentials);

  const { data: after, error } = await supabase
    .from("organization_integrations")
    .upsert(
      {
        organization_id: user.organization_id,
        provider: "stripe",
        is_enabled: parsed.data.is_enabled,
        config: {},
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
    throw new Error(error?.message ?? "Could not save Stripe settings.");
  }

  await logAction({
    user,
    action: "integration.stripe.updated",
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

  revalidatePath("/admin/integrations/stripe");
  redirect("/admin/integrations/stripe?saved=1");
}

function getString(formData: FormData, key: string): string {
  const value = formData.get(key);

  return typeof value === "string" ? value.trim() : "";
}
