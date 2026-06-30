"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { logAction } from "@/lib/audit/log-action";
import { getCurrentUser } from "@/lib/auth/current-user";
import {
  encryptedOpenAICredentials,
  OPENAI_MODEL_OPTIONS,
  normalizeModel,
  openAICredentialsLast4,
  type OpenAIIntegrationCredentials,
} from "@/lib/integrations/openai";
import {
  encryptedGoogleMapsCredentials,
  googleMapsCredentialsLast4,
  type GoogleMapsIntegrationCredentials,
} from "@/lib/integrations/google-maps";
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

const openAISettingsSchema = z.object({
  is_enabled: z.boolean(),
  model: z.enum(OPENAI_MODEL_OPTIONS.map((model) => model.value)).default("gpt-5.4-mini"),
  api_key: z.string().trim().max(300).optional().default(""),
});

const googleMapsSettingsSchema = z.object({
  is_enabled: z.boolean(),
  api_key: z.string().trim().max(300).optional().default(""),
});

export async function saveOpenAIIntegration(formData: FormData) {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/login");
  }

  if (user.role !== "admin") {
    throw new Error("Only admins can update OpenAI settings.");
  }

  const supabase = await createClient();

  if (!supabase) {
    throw new Error("Supabase is not configured for this workspace.");
  }

  const parsed = openAISettingsSchema.safeParse({
    is_enabled: formData.get("openai_is_enabled") === "on",
    model: getString(formData, "openai_model") || "gpt-5.4-mini",
    api_key: getString(formData, "openai_api_key"),
  });

  if (!parsed.success) {
    throw new Error(parsed.error.issues[0]?.message ?? "Invalid OpenAI settings.");
  }

  const { data: before } = await supabase
    .from("organization_integrations")
    .select(
      "id, provider, is_enabled, config, credentials_encrypted, credentials_last4, updated_at",
    )
    .eq("organization_id", user.organization_id)
    .eq("provider", "openai")
    .maybeSingle<ExistingIntegration>();

  let previousCredentials: Partial<OpenAIIntegrationCredentials> | null = null;

  try {
    previousCredentials = decryptSecretPayload<Partial<OpenAIIntegrationCredentials>>(
      before?.credentials_encrypted ?? null,
    );
  } catch (error) {
    console.error("Existing OpenAI credentials could not be decrypted.", error);
  }

  const credentials: OpenAIIntegrationCredentials = {
    apiKey: parsed.data.api_key || previousCredentials?.apiKey || "",
  };

  if (parsed.data.is_enabled && !credentials.apiKey) {
    throw new Error("An OpenAI API key is required when the assistant is enabled.");
  }

  const credentialsEncrypted = credentials.apiKey
    ? encryptedOpenAICredentials(credentials)
    : null;
  const credentialsLast4 = openAICredentialsLast4(credentials);

  const { data: after, error } = await supabase
    .from("organization_integrations")
    .upsert(
      {
        organization_id: user.organization_id,
        provider: "openai",
        is_enabled: parsed.data.is_enabled,
        config: {
          model: normalizeModel(parsed.data.model),
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
    throw new Error(error?.message ?? "Could not save OpenAI settings.");
  }

  await logAction({
    user,
    action: "integration.openai.updated",
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
    supabase,
  });

  revalidatePath("/admin/integrations/gmail");
  revalidatePath("/dashboard");
  redirect("/admin/integrations/gmail?openai_saved=1");
}

export async function saveGoogleMapsIntegration(formData: FormData) {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/login");
  }

  if (user.role !== "admin") {
    throw new Error("Only admins can update Google Maps settings.");
  }

  const supabase = await createClient();

  if (!supabase) {
    throw new Error("Supabase is not configured for this workspace.");
  }

  const parsed = googleMapsSettingsSchema.safeParse({
    is_enabled: formData.get("google_maps_is_enabled") === "on",
    api_key: getString(formData, "google_maps_api_key"),
  });

  if (!parsed.success) {
    throw new Error(parsed.error.issues[0]?.message ?? "Invalid Google Maps settings.");
  }

  const { data: before } = await supabase
    .from("organization_integrations")
    .select(
      "id, provider, is_enabled, config, credentials_encrypted, credentials_last4, updated_at",
    )
    .eq("organization_id", user.organization_id)
    .eq("provider", "google_maps")
    .maybeSingle<ExistingIntegration>();

  let previousCredentials: Partial<GoogleMapsIntegrationCredentials> | null = null;

  try {
    previousCredentials = decryptSecretPayload<Partial<GoogleMapsIntegrationCredentials>>(
      before?.credentials_encrypted ?? null,
    );
  } catch (error) {
    console.error("Existing Google Maps credentials could not be decrypted.", error);
  }

  const credentials: GoogleMapsIntegrationCredentials = {
    apiKey: parsed.data.api_key || previousCredentials?.apiKey || "",
  };

  if (parsed.data.is_enabled && !credentials.apiKey) {
    throw new Error("A Google Maps API key is required when geocoding is enabled.");
  }

  const credentialsEncrypted = credentials.apiKey
    ? encryptedGoogleMapsCredentials(credentials)
    : null;
  const credentialsLast4 = googleMapsCredentialsLast4(credentials);

  const { data: after, error } = await supabase
    .from("organization_integrations")
    .upsert(
      {
        organization_id: user.organization_id,
        provider: "google_maps",
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
    throw new Error(error?.message ?? "Could not save Google Maps settings.");
  }

  await logAction({
    user,
    action: "integration.google_maps.updated",
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
    supabase,
  });

  revalidatePath("/admin/integrations/gmail");
  revalidatePath("/quotes/new");
  redirect("/admin/integrations/gmail?google_maps_saved=1");
}

function getString(formData: FormData, key: string): string {
  const value = formData.get(key);

  return typeof value === "string" ? value.trim() : "";
}
