import type { SupabaseClient } from "@supabase/supabase-js";

import {
  decryptSecretPayload,
  encryptSecretPayload,
} from "@/lib/security/secret-box";

export type OpenAIIntegrationCredentials = {
  apiKey: string;
};

export type OpenAIIntegration = {
  id: string;
  organizationId: string;
  isEnabled: boolean;
  model: string;
  apiKey: string | null;
};

export const OPENAI_MODEL_OPTIONS = [
  {
    value: "gpt-5.5",
    label: "GPT-5.5",
    description: "Best quality for complex reasoning",
  },
  {
    value: "gpt-5.4",
    label: "GPT-5.4",
    description: "Balanced professional work",
  },
  {
    value: "gpt-5.4-mini",
    label: "GPT-5.4 mini",
    description: "Recommended for QuoteBase",
  },
  {
    value: "gpt-5.4-nano",
    label: "GPT-5.4 nano",
    description: "Lowest latency and cost",
  },
  {
    value: "gpt-5-mini",
    label: "GPT-5 mini",
    description: "Legacy saved option",
  },
] as const;

export type OpenAIModel = (typeof OPENAI_MODEL_OPTIONS)[number]["value"];

type OpenAIIntegrationRecord = {
  id: string;
  organization_id: string;
  is_enabled: boolean;
  config: Record<string, unknown> | null;
  credentials_encrypted: string | null;
};

const DEFAULT_OPENAI_MODEL = "gpt-5.4-mini";
const OPENAI_RESPONSES_URL = "https://api.openai.com/v1/responses";
const OPENAI_TIMEOUT_MS = 20000;

export async function getOpenAIIntegration({
  supabase,
  organizationId,
}: {
  supabase: SupabaseClient;
  organizationId: string;
}): Promise<OpenAIIntegration | null> {
  const { data } = await supabase
    .from("organization_integrations")
    .select("id, organization_id, is_enabled, config, credentials_encrypted")
    .eq("organization_id", organizationId)
    .eq("provider", "openai")
    .maybeSingle<OpenAIIntegrationRecord>();

  if (!data) {
    return null;
  }

  let credentials: Partial<OpenAIIntegrationCredentials> | null = null;

  try {
    credentials = decryptSecretPayload<Partial<OpenAIIntegrationCredentials>>(
      data.credentials_encrypted,
    );
  } catch (error) {
    console.error("OpenAI credentials could not be decrypted.", error);
  }

  return {
    id: data.id,
    organizationId: data.organization_id,
    isEnabled: data.is_enabled,
    model: normalizeModel(data.config?.model),
    apiKey: stringValue(credentials?.apiKey),
  };
}

export async function createOpenAITextResponse({
  apiKey,
  model,
  input,
}: {
  apiKey: string;
  model: string;
  input: string;
}): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), OPENAI_TIMEOUT_MS);

  try {
    const response = await fetch(OPENAI_RESPONSES_URL, {
      method: "POST",
      headers: {
        authorization: `Bearer ${apiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model,
        input,
        max_output_tokens: 900,
      }),
      signal: controller.signal,
      cache: "no-store",
    });
    const payload = (await response.json()) as unknown;

    if (!response.ok) {
      throw new Error(openAIErrorMessage(payload) ?? `OpenAI returned HTTP ${response.status}.`);
    }

    return extractOutputText(payload);
  } finally {
    clearTimeout(timeout);
  }
}

export function encryptedOpenAICredentials(
  credentials: OpenAIIntegrationCredentials,
): string {
  return encryptSecretPayload(credentials);
}

export function openAICredentialsLast4(
  credentials: Partial<OpenAIIntegrationCredentials>,
): Record<string, unknown> {
  return {
    api_key: credentials.apiKey ? last4(credentials.apiKey) : null,
  };
}

export function normalizeModel(value: unknown): string {
  const model = typeof value === "string" ? value.trim() : "";

  return isOpenAIModel(model) ? model : DEFAULT_OPENAI_MODEL;
}

export function isOpenAIModel(value: string): value is OpenAIModel {
  return OPENAI_MODEL_OPTIONS.some((model) => model.value === value);
}

function extractOutputText(payload: unknown): string {
  if (!isRecord(payload)) {
    return "";
  }

  if (typeof payload.output_text === "string") {
    return payload.output_text;
  }

  const output = Array.isArray(payload.output) ? payload.output : [];
  const chunks: string[] = [];

  for (const item of output) {
    if (!isRecord(item) || !Array.isArray(item.content)) {
      continue;
    }

    for (const content of item.content) {
      if (isRecord(content) && typeof content.text === "string") {
        chunks.push(content.text);
      }
    }
  }

  return chunks.join("\n").trim();
}

function openAIErrorMessage(payload: unknown): string | null {
  if (!isRecord(payload) || !isRecord(payload.error)) {
    return null;
  }

  return typeof payload.error.message === "string"
    ? payload.error.message
    : null;
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function last4(value: string): string {
  return value.slice(-4);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
