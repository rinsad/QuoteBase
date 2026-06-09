import crypto from "node:crypto";

import type { SupabaseClient } from "@supabase/supabase-js";

import { getBaseUrl } from "@/lib/env";
import {
  decryptSecretPayload,
  encryptSecretPayload,
} from "@/lib/security/secret-box";

export type EmailAttachment = {
  filename: string;
  contentType: string;
  contentBase64: string;
};

export type GmailDeliveryResult = {
  status: "sent" | "skipped" | "failed";
  provider: "gmail";
  messageId: string | null;
  reason: string | null;
};

type GmailCredentials = {
  clientId: string;
  clientSecret: string;
  accessToken: string;
  refreshToken: string;
  expiresAt: string;
  email: string | null;
};

type GmailIntegrationRecord = {
  id: string;
  organization_id: string;
  is_enabled: boolean;
  credentials_last4: Record<string, unknown> | null;
  credentials_encrypted: string | null;
};

export type GmailOAuthSettings = {
  clientId: string;
  clientSecret: string;
};

type GmailTokenResponse = {
  access_token?: unknown;
  refresh_token?: unknown;
  expires_in?: unknown;
  id_token?: unknown;
};

type GmailSendResponse = {
  id?: unknown;
};

const GMAIL_SCOPE = "openid email https://www.googleapis.com/auth/gmail.send";
const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GMAIL_SEND_URL = "https://gmail.googleapis.com/gmail/v1/users/me/messages/send";
const GMAIL_TIMEOUT_MS = 15000;

export function gmailRedirectUri(): string {
  return `${getBaseUrl()}/api/integrations/gmail/callback`;
}

export async function createGmailAuthorizationUrl({
  supabase,
  organizationId,
  userId,
}: {
  supabase: SupabaseClient;
  organizationId: string;
  userId: string;
}): Promise<string | null> {
  const settings = await getGmailOAuthSettings({ supabase, organizationId });

  if (!settings) {
    return null;
  }

  const url = new URL(GOOGLE_AUTH_URL);

  url.searchParams.set("client_id", settings.clientId);
  url.searchParams.set("redirect_uri", gmailRedirectUri());
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", GMAIL_SCOPE);
  url.searchParams.set("access_type", "offline");
  url.searchParams.set("prompt", "consent");
  url.searchParams.set(
    "state",
    signGmailState({
      organizationId,
      userId,
      issuedAt: Date.now(),
    }),
  );

  return url.toString();
}

export function signGmailState(payload: {
  organizationId: string;
  userId: string;
  issuedAt: number;
}): string {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = crypto
    .createHmac("sha256", requiredEnv("INTEGRATION_ENCRYPTION_KEY"))
    .update(body)
    .digest("base64url");

  return `${body}.${signature}`;
}

export function verifyGmailState(
  state: string,
): { organizationId: string; userId: string; issuedAt: number } | null {
  const [body, signature] = state.split(".");

  if (!body || !signature) {
    return null;
  }

  const expected = crypto
    .createHmac("sha256", requiredEnv("INTEGRATION_ENCRYPTION_KEY"))
    .update(body)
    .digest("base64url");

  const signatureBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);

  if (
    signatureBuffer.length !== expectedBuffer.length ||
    !crypto.timingSafeEqual(signatureBuffer, expectedBuffer)
  ) {
    return null;
  }

  const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as {
    organizationId?: unknown;
    userId?: unknown;
    issuedAt?: unknown;
  };

  if (
    typeof payload.organizationId !== "string" ||
    typeof payload.userId !== "string" ||
    typeof payload.issuedAt !== "number" ||
    Date.now() - payload.issuedAt > 10 * 60 * 1000
  ) {
    return null;
  }

  return {
    organizationId: payload.organizationId,
    userId: payload.userId,
    issuedAt: payload.issuedAt,
  };
}

export async function exchangeGmailCode({
  code,
  settings,
}: {
  code: string;
  settings: GmailOAuthSettings;
}): Promise<GmailCredentials> {
  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      code,
      client_id: settings.clientId,
      client_secret: settings.clientSecret,
      redirect_uri: gmailRedirectUri(),
      grant_type: "authorization_code",
    }),
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`Google OAuth returned HTTP ${response.status}.`);
  }

  const token = (await response.json()) as GmailTokenResponse;

  if (typeof token.access_token !== "string") {
    throw new Error("Google OAuth did not return an access token.");
  }

  if (typeof token.refresh_token !== "string") {
    throw new Error("Google OAuth did not return a refresh token.");
  }

  const email =
    typeof token.id_token === "string" ? emailFromIdToken(token.id_token) : null;

  return {
    clientId: settings.clientId,
    clientSecret: settings.clientSecret,
    accessToken: token.access_token,
    refreshToken: token.refresh_token,
    expiresAt: expiresAt(token.expires_in),
    email,
  };
}

export async function sendGmailQuoteEmail({
  supabase,
  organizationId,
  to,
  subject,
  text,
  attachments,
}: {
  supabase: SupabaseClient;
  organizationId: string;
  to: string;
  subject: string;
  text: string;
  attachments: EmailAttachment[];
}): Promise<GmailDeliveryResult> {
  const { data: integration } = await supabase
    .from("organization_integrations")
    .select("id, organization_id, is_enabled, credentials_last4, credentials_encrypted")
    .eq("organization_id", organizationId)
    .eq("provider", "gmail")
    .maybeSingle<GmailIntegrationRecord>();

  if (!integration?.is_enabled || !integration.credentials_encrypted) {
    return {
      status: "skipped",
      provider: "gmail",
      messageId: null,
      reason: "Gmail is not connected for this organization.",
    };
  }

  let credentials = decryptSecretPayload<GmailCredentials>(
    integration.credentials_encrypted,
  );

  if (!credentials?.refreshToken || !credentials.clientId || !credentials.clientSecret) {
    return {
      status: "skipped",
      provider: "gmail",
      messageId: null,
      reason: "Gmail credentials are incomplete.",
    };
  }

  credentials = await refreshGmailCredentialsIfNeeded({
    supabase,
    integration,
    credentials,
  });

  const raw = createMimeMessage({
    to,
    from: credentials.email,
    subject,
    text,
    attachments,
  });

  try {
    const response = await gmailFetch(GMAIL_SEND_URL, {
      accessToken: credentials.accessToken,
      body: JSON.stringify({ raw }),
    });
    const body = (await response.json()) as GmailSendResponse;

    return {
      status: "sent",
      provider: "gmail",
      messageId: typeof body.id === "string" ? body.id : null,
      reason: null,
    };
  } catch (error) {
    return {
      status: "failed",
      provider: "gmail",
      messageId: null,
      reason:
        error instanceof Error ? error.message : "Gmail send request failed.",
    };
  }
}

export function encryptedGmailCredentials(
  credentials: GmailCredentials,
): string {
  return encryptSecretPayload(credentials);
}

function createMimeMessage({
  to,
  from,
  subject,
  text,
  attachments,
}: {
  to: string;
  from: string | null;
  subject: string;
  text: string;
  attachments: EmailAttachment[];
}): string {
  const boundary = `quotebase-${crypto.randomBytes(12).toString("hex")}`;
  const headers = [
    `To: ${to}`,
    ...(from ? [`From: ${from}`] : []),
    `Subject: ${encodeMimeHeader(subject)}`,
    "MIME-Version: 1.0",
    `Content-Type: multipart/mixed; boundary="${boundary}"`,
  ];
  const parts = [
    `--${boundary}`,
    'Content-Type: text/plain; charset="UTF-8"',
    "Content-Transfer-Encoding: 7bit",
    "",
    text,
    ...attachments.flatMap((attachment) => [
      `--${boundary}`,
      `Content-Type: ${attachment.contentType}; name="${attachment.filename}"`,
      "Content-Transfer-Encoding: base64",
      `Content-Disposition: attachment; filename="${attachment.filename}"`,
      "",
      wrapBase64(attachment.contentBase64),
    ]),
    `--${boundary}--`,
    "",
  ];
  const message = [...headers, "", ...parts].join("\r\n");

  return Buffer.from(message)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

async function refreshGmailCredentialsIfNeeded({
  supabase,
  integration,
  credentials,
}: {
  supabase: SupabaseClient;
  integration: GmailIntegrationRecord;
  credentials: GmailCredentials;
}): Promise<GmailCredentials> {
  if (new Date(credentials.expiresAt).getTime() > Date.now() + 60_000) {
    return credentials;
  }

  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      client_id: credentials.clientId,
      client_secret: credentials.clientSecret,
      refresh_token: credentials.refreshToken,
      grant_type: "refresh_token",
    }),
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`Google token refresh returned HTTP ${response.status}.`);
  }

  const token = (await response.json()) as GmailTokenResponse;
  const refreshed = {
    ...credentials,
    accessToken:
      typeof token.access_token === "string"
        ? token.access_token
        : credentials.accessToken,
    expiresAt: expiresAt(token.expires_in),
  };

  await supabase
    .from("organization_integrations")
    .update({
      credentials_encrypted: encryptedGmailCredentials(refreshed),
      credentials_last4: {
        client_id: last4(refreshed.clientId),
        client_secret: true,
        email: refreshed.email,
      },
      updated_at: new Date().toISOString(),
    })
    .eq("organization_id", integration.organization_id)
    .eq("id", integration.id);

  return refreshed;
}

async function gmailFetch(
  url: string,
  {
    accessToken,
    body,
    method = "POST",
  }: {
    accessToken: string;
    body: string | null;
    method?: "GET" | "POST";
  },
): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), GMAIL_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      method,
      headers: {
        authorization: `Bearer ${accessToken}`,
        accept: "application/json",
        ...(body ? { "content-type": "application/json" } : {}),
      },
      body,
      signal: controller.signal,
      cache: "no-store",
    });

    if (!response.ok) {
      throw new Error(`Gmail API returned HTTP ${response.status}.`);
    }

    return response;
  } finally {
    clearTimeout(timeout);
  }
}

function expiresAt(expiresIn: unknown): string {
  const seconds = typeof expiresIn === "number" ? expiresIn : 3600;

  return new Date(Date.now() + seconds * 1000).toISOString();
}

function encodeMimeHeader(value: string): string {
  return `=?UTF-8?B?${Buffer.from(value).toString("base64")}?=`;
}

function wrapBase64(value: string): string {
  return value.match(/.{1,76}/g)?.join("\r\n") ?? value;
}

function emailFromIdToken(idToken: string): string | null {
  const [, payload] = idToken.split(".");

  if (!payload) {
    return null;
  }

  try {
    const decoded = JSON.parse(
      Buffer.from(payload, "base64url").toString("utf8"),
    ) as { email?: unknown };

    return typeof decoded.email === "string" ? decoded.email : null;
  } catch {
    return null;
  }
}

function requiredEnv(key: string): string {
  const value = process.env[key];

  if (!value?.trim()) {
    throw new Error(`${key} is not configured.`);
  }

  return value.trim();
}

export async function getGmailOAuthSettings({
  supabase,
  organizationId,
}: {
  supabase: SupabaseClient;
  organizationId: string;
}): Promise<GmailOAuthSettings | null> {
  const { data } = await supabase
    .from("organization_integrations")
    .select("credentials_encrypted")
    .eq("organization_id", organizationId)
    .eq("provider", "gmail")
    .maybeSingle<{ credentials_encrypted: string | null }>();
  const credentials = decryptSecretPayload<Partial<GmailCredentials>>(
    data?.credentials_encrypted ?? null,
  );

  if (!credentials?.clientId || !credentials.clientSecret) {
    return null;
  }

  return {
    clientId: credentials.clientId,
    clientSecret: credentials.clientSecret,
  };
}

export function encryptedGmailOAuthSettings({
  clientId,
  clientSecret,
  existingCredentials,
}: GmailOAuthSettings & {
  existingCredentials?: string | null;
}): string {
  const existing = decryptSecretPayload<Partial<GmailCredentials>>(
    existingCredentials ?? null,
  );

  return encryptSecretPayload({
    ...existing,
    clientId,
    clientSecret,
    accessToken: undefined,
    refreshToken: undefined,
    expiresAt: undefined,
    email: undefined,
  });
}

export function encryptedGmailOAuthSettingsWithoutMailbox(
  existingCredentials: string | null,
): {
  encrypted: string | null;
  last4: Record<string, unknown>;
} {
  const existing = decryptSecretPayload<Partial<GmailCredentials>>(
    existingCredentials,
  );

  if (!existing?.clientId || !existing.clientSecret) {
    return {
      encrypted: null,
      last4: {},
    };
  }

  return {
    encrypted: encryptSecretPayload({
      clientId: existing.clientId,
      clientSecret: existing.clientSecret,
    }),
    last4: gmailCredentialsLast4({
      clientId: existing.clientId,
      clientSecret: existing.clientSecret,
      email: null,
    }),
  };
}

export function mergeGmailConnectedCredentials({
  settings,
  credentials,
}: {
  settings: GmailOAuthSettings;
  credentials: Omit<GmailCredentials, "clientId" | "clientSecret">;
}): GmailCredentials {
  return {
    ...credentials,
    clientId: settings.clientId,
    clientSecret: settings.clientSecret,
  };
}

export function gmailCredentialsLast4({
  clientId,
  clientSecret,
  email,
}: {
  clientId?: string | null;
  clientSecret?: string | null;
  email?: string | null;
}): Record<string, unknown> {
  return {
    client_id: clientId ? last4(clientId) : null,
    client_secret: Boolean(clientSecret),
    email: email ?? null,
  };
}

function last4(value: string): string {
  return value.slice(-4);
}
