import crypto from "node:crypto";

import type { SupabaseClient } from "@supabase/supabase-js";

import {
  decryptSecretPayload,
  encryptSecretPayload,
} from "@/lib/security/secret-box";

export type StripeCredentials = {
  secretKey: string;
  webhookSecret?: string;
};

export type StripeIntegration = {
  id: string;
  organizationId: string;
  isEnabled: boolean;
  secretKey: string | null;
  webhookSecret: string | null;
};

export type StripeCheckoutSessionInput = {
  supabase: SupabaseClient;
  organizationId: string;
  quoteNumber: string;
  amount: number;
  customerEmail: string | null;
  successUrl: string;
  cancelUrl: string;
};

type StripeIntegrationRecord = {
  id: string;
  organization_id: string;
  is_enabled: boolean;
  credentials_encrypted: string | null;
};

type StripeCheckoutSession = {
  id?: unknown;
  url?: unknown;
  payment_status?: unknown;
  payment_intent?: unknown;
};

type StripeErrorPayload = {
  error?: {
    message?: unknown;
  };
};

const STRIPE_API_BASE_URL = "https://api.stripe.com/v1";
const STRIPE_TIMEOUT_MS = 15000;

export async function getStripeIntegration({
  supabase,
  organizationId,
}: {
  supabase: SupabaseClient;
  organizationId: string;
}): Promise<StripeIntegration | null> {
  const { data } = await supabase
    .from("organization_integrations")
    .select("id, organization_id, is_enabled, credentials_encrypted")
    .eq("organization_id", organizationId)
    .eq("provider", "stripe")
    .maybeSingle<StripeIntegrationRecord>();

  if (!data) {
    return null;
  }

  let credentials: Partial<StripeCredentials> | null = null;

  try {
    credentials = decryptSecretPayload<Partial<StripeCredentials>>(
      data.credentials_encrypted,
    );
  } catch (error) {
    console.error("Stripe credentials could not be decrypted.", error);
  }

  return {
    id: data.id,
    organizationId: data.organization_id,
    isEnabled: data.is_enabled,
    secretKey: stringValue(credentials?.secretKey),
    webhookSecret: stringValue(credentials?.webhookSecret),
  };
}

export async function createStripeCheckoutSession({
  supabase,
  organizationId,
  quoteNumber,
  amount,
  customerEmail,
  successUrl,
  cancelUrl,
}: StripeCheckoutSessionInput): Promise<{ id: string; url: string }> {
  const integration = await getStripeIntegration({
    supabase,
    organizationId,
  });

  if (!integration?.isEnabled || !integration.secretKey) {
    throw new Error(
      "Stripe is not connected. Configure it in Admin > Integrations before accepting COD quotes.",
    );
  }

  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error("Quote total must be greater than zero before payment.");
  }

  const cents = Math.round(amount * 100);
  const params = new URLSearchParams({
    mode: "payment",
    success_url: successUrl,
    cancel_url: cancelUrl,
    "line_items[0][quantity]": "1",
    "line_items[0][price_data][currency]": "usd",
    "line_items[0][price_data][unit_amount]": String(cents),
    "line_items[0][price_data][product_data][name]": `Quote ${quoteNumber}`,
    "payment_method_types[0]": "card",
  });

  if (customerEmail) {
    params.set("customer_email", customerEmail);
  }

  const session = await stripeFetch<StripeCheckoutSession>({
    secretKey: integration.secretKey,
    path: "/checkout/sessions",
    method: "POST",
    body: params,
  });

  if (typeof session.id !== "string" || typeof session.url !== "string") {
    throw new Error("Stripe did not return a checkout URL.");
  }

  return {
    id: session.id,
    url: session.url,
  };
}

export async function getStripeCheckoutSession({
  supabase,
  organizationId,
  sessionId,
}: {
  supabase: SupabaseClient;
  organizationId: string;
  sessionId: string;
}): Promise<{
  id: string;
  paymentStatus: string | null;
  paymentIntentId: string | null;
}> {
  const integration = await getStripeIntegration({
    supabase,
    organizationId,
  });

  if (!integration?.isEnabled || !integration.secretKey) {
    throw new Error("Stripe is not connected.");
  }

  const session = await stripeFetch<StripeCheckoutSession>({
    secretKey: integration.secretKey,
    path: `/checkout/sessions/${encodeURIComponent(sessionId)}`,
    method: "GET",
  });

  if (typeof session.id !== "string") {
    throw new Error("Stripe checkout session was not found.");
  }

  return {
    id: session.id,
    paymentStatus:
      typeof session.payment_status === "string"
        ? session.payment_status
        : null,
    paymentIntentId:
      typeof session.payment_intent === "string"
        ? session.payment_intent
        : null,
  };
}

export function encryptedStripeCredentials(
  credentials: StripeCredentials,
): string {
  return encryptSecretPayload(credentials);
}

export function stripeCredentialsLast4(
  credentials: Partial<StripeCredentials>,
): Record<string, unknown> {
  return {
    secret_key: credentials.secretKey ? last4(credentials.secretKey) : null,
    webhook_secret: Boolean(credentials.webhookSecret),
  };
}

export function verifyStripeWebhookSignature({
  payload,
  signatureHeader,
  webhookSecret,
  toleranceSeconds = 300,
  now = new Date(),
}: {
  payload: string;
  signatureHeader: string;
  webhookSecret: string;
  toleranceSeconds?: number;
  now?: Date;
}): boolean {
  const parts = new Map(
    signatureHeader.split(",").map((part) => {
      const [key, value] = part.split("=");

      return [key, value] as const;
    }),
  );
  const timestamp = Number(parts.get("t"));
  const signature = parts.get("v1");

  if (!Number.isFinite(timestamp) || !signature) {
    return false;
  }

  const ageSeconds = Math.abs(now.getTime() / 1000 - timestamp);

  if (ageSeconds > toleranceSeconds) {
    return false;
  }

  const expected = crypto
    .createHmac("sha256", webhookSecret)
    .update(`${timestamp}.${payload}`)
    .digest("hex");

  return timingSafeEqual(expected, signature);
}

async function stripeFetch<T>({
  secretKey,
  path,
  method,
  body,
}: {
  secretKey: string;
  path: string;
  method: "GET" | "POST";
  body?: URLSearchParams;
}): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), STRIPE_TIMEOUT_MS);

  try {
    const response = await fetch(`${STRIPE_API_BASE_URL}${path}`, {
      method,
      headers: {
        authorization: `Bearer ${secretKey}`,
        ...(body ? { "content-type": "application/x-www-form-urlencoded" } : {}),
      },
      body,
      signal: controller.signal,
      cache: "no-store",
    });
    const payload = (await response.json()) as T & StripeErrorPayload;

    if (!response.ok) {
      throw new Error(
        typeof payload.error?.message === "string"
          ? payload.error.message
          : `Stripe returned HTTP ${response.status}.`,
      );
    }

    return payload;
  } finally {
    clearTimeout(timeout);
  }
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function last4(value: string): string {
  return value.slice(-4);
}

function timingSafeEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);

  return (
    leftBuffer.length === rightBuffer.length &&
    crypto.timingSafeEqual(leftBuffer, rightBuffer)
  );
}
