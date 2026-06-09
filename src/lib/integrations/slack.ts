import crypto from "node:crypto";

import type { SupabaseClient } from "@supabase/supabase-js";

import {
  decryptSecretPayload,
  encryptSecretPayload,
} from "@/lib/security/secret-box";

export type SlackIntegration = {
  id: string;
  isEnabled: boolean;
  approverEmail: string | null;
  webhookUrl: string | null;
  signingSecret: string | null;
  botToken: string | null;
};

type SlackIntegrationRecord = {
  id: string;
  is_enabled: boolean;
  config: Record<string, unknown> | null;
  credentials_encrypted: string | null;
};

type SlackCredentials = {
  webhookUrl?: string;
  signingSecret?: string;
  botToken?: string;
};

const SIGNATURE_VERSION = "v0";
const MAX_REQUEST_AGE_SECONDS = 60 * 5;

export async function getSlackIntegration({
  supabase,
  organizationId,
}: {
  supabase: SupabaseClient;
  organizationId: string;
}): Promise<SlackIntegration | null> {
  const { data } = await supabase
    .from("organization_integrations")
    .select("id, is_enabled, config, credentials_encrypted")
    .eq("organization_id", organizationId)
    .eq("provider", "slack")
    .maybeSingle<SlackIntegrationRecord>();

  if (!data) {
    return null;
  }

  const credentials = decryptSecretPayload<SlackCredentials>(
    data.credentials_encrypted,
  );

  return {
    id: data.id,
    isEnabled: data.is_enabled,
    approverEmail: stringValue(data.config?.approver_email),
    webhookUrl: stringValue(credentials?.webhookUrl),
    signingSecret: stringValue(credentials?.signingSecret),
    botToken: stringValue(credentials?.botToken),
  };
}

export function encryptedSlackCredentials(credentials: {
  webhookUrl?: string;
  signingSecret?: string;
  botToken?: string;
}): string {
  return encryptSecretPayload(credentials);
}

export function verifySlackSignature({
  rawBody,
  timestamp,
  signature,
  signingSecret,
}: {
  rawBody: string;
  timestamp: string | null;
  signature: string | null;
  signingSecret: string;
}): { ok: true } | { ok: false; message: string; status: number } {
  if (!timestamp || !signature) {
    return {
      ok: false,
      message: "Slack signature headers are missing.",
      status: 401,
    };
  }

  const timestampValue = Number(timestamp);

  if (
    !Number.isFinite(timestampValue) ||
    Math.abs(Date.now() / 1000 - timestampValue) > MAX_REQUEST_AGE_SECONDS
  ) {
    return {
      ok: false,
      message: "Slack request timestamp is invalid or expired.",
      status: 401,
    };
  }

  const baseString = `${SIGNATURE_VERSION}:${timestamp}:${rawBody}`;
  const expectedSignature = `${SIGNATURE_VERSION}=${crypto
    .createHmac("sha256", signingSecret)
    .update(baseString)
    .digest("hex")}`;
  const expected = Buffer.from(expectedSignature);
  const received = Buffer.from(signature);

  if (
    expected.length !== received.length ||
    !crypto.timingSafeEqual(expected, received)
  ) {
    return {
      ok: false,
      message: "Slack signature is invalid.",
      status: 401,
    };
  }

  return { ok: true };
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}
