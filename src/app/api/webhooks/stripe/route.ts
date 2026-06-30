import { NextResponse } from "next/server";

import {
  verifyStripeWebhookSignature,
  type StripeCredentials,
} from "@/lib/integrations/stripe";
import { decryptSecretPayload } from "@/lib/security/secret-box";
import { completeStripeQuotePaymentAttempt } from "@/lib/quotes/delivery";
import { createAdminClient } from "@/lib/supabase/admin";

type StripeIntegrationRecord = {
  organization_id: string;
  credentials_encrypted: string | null;
};

type StripeWebhookEvent = {
  id?: unknown;
  type?: unknown;
  data?: {
    object?: Record<string, unknown>;
  };
};

const SUPPORTED_EVENTS = new Set([
  "checkout.session.completed",
  "checkout.session.async_payment_succeeded",
]);

export async function POST(request: Request) {
  const payload = await request.text();
  const signatureHeader = request.headers.get("stripe-signature");

  if (!signatureHeader) {
    return NextResponse.json({ error: "Missing signature." }, { status: 401 });
  }

  const admin = createAdminClient();

  if (!admin) {
    return NextResponse.json({ error: "Supabase is not configured." }, { status: 503 });
  }

  const match = await findVerifiedIntegration({
    payload,
    signatureHeader,
  });

  if (!match) {
    return NextResponse.json({ error: "Invalid signature." }, { status: 401 });
  }

  let event: StripeWebhookEvent;

  try {
    event = JSON.parse(payload) as StripeWebhookEvent;
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const eventId = stringValue(event.id);
  const eventType = stringValue(event.type);

  if (!eventId || !eventType) {
    return NextResponse.json({ error: "Invalid Stripe event." }, { status: 400 });
  }

  const session = event.data?.object ?? {};
  const sessionId = stringValue(session.id);
  const paymentStatus = stringValue(session.payment_status);
  const paymentIntentId = stringValue(session.payment_intent);

  const { data: attempt } = sessionId
    ? await admin
        .from("quote_payment_attempts")
        .select("id")
        .eq("organization_id", match.organizationId)
        .eq("provider", "stripe")
        .eq("provider_transaction_id", sessionId)
        .maybeSingle<{ id: string }>()
    : { data: null };

  const insert = await admin
    .from("payment_webhook_events")
    .insert({
      organization_id: match.organizationId,
      provider: "stripe",
      provider_event_id: eventId,
      event_type: eventType,
      status: SUPPORTED_EVENTS.has(eventType) ? "processing" : "ignored",
      payment_attempt_id: attempt?.id ?? null,
      raw_event: event as Record<string, unknown>,
    })
    .select("id")
    .single<{ id: string }>();

  if (insert.error?.code === "23505") {
    return NextResponse.json({ received: true, duplicate: true });
  }

  if (insert.error || !insert.data) {
    return NextResponse.json({ error: "Could not record webhook." }, { status: 500 });
  }

  if (!SUPPORTED_EVENTS.has(eventType)) {
    return NextResponse.json({ received: true, ignored: true });
  }

  if (!attempt || !sessionId) {
    await markWebhookEventFailed({
      eventRowId: insert.data.id,
      organizationId: match.organizationId,
      failureReason: "No matching Stripe payment attempt was found.",
    });

    return NextResponse.json({ error: "Payment attempt not found." }, { status: 404 });
  }

  const result = await completeStripeQuotePaymentAttempt({
    organizationId: match.organizationId,
    attemptId: attempt.id,
    sessionId,
    paymentStatus,
    paymentIntentId,
    rawResponse: session,
    requestMetadata: {
      requestIp: requestIp(request.headers),
      userAgent: request.headers.get("user-agent"),
    },
  });

  await admin
    .from("payment_webhook_events")
    .update({
      status: result ? "processed" : "failed",
      failure_reason: result ? null : "Stripe Checkout Session was not paid.",
      processed_at: new Date().toISOString(),
    })
    .eq("organization_id", match.organizationId)
    .eq("id", insert.data.id);

  if (!result) {
    return NextResponse.json({ error: "Payment was not completed." }, { status: 400 });
  }

  return NextResponse.json({ received: true });
}

async function findVerifiedIntegration({
  payload,
  signatureHeader,
}: {
  payload: string;
  signatureHeader: string;
}): Promise<{ organizationId: string } | null> {
  const admin = createAdminClient();

  if (!admin) {
    return null;
  }

  const { data } = await admin
    .from("organization_integrations")
    .select("organization_id, credentials_encrypted")
    .eq("provider", "stripe")
    .eq("is_enabled", true)
    .returns<StripeIntegrationRecord[]>();

  for (const integration of data ?? []) {
    let credentials: Partial<StripeCredentials> | null = null;

    try {
      credentials = decryptSecretPayload<Partial<StripeCredentials>>(
        integration.credentials_encrypted,
      );
    } catch {
      credentials = null;
    }

    if (
      credentials?.webhookSecret &&
      verifyStripeWebhookSignature({
        payload,
        signatureHeader,
        webhookSecret: credentials.webhookSecret,
      })
    ) {
      return { organizationId: integration.organization_id };
    }
  }

  return null;
}

async function markWebhookEventFailed({
  eventRowId,
  organizationId,
  failureReason,
}: {
  eventRowId: string;
  organizationId: string;
  failureReason: string;
}): Promise<void> {
  const admin = createAdminClient();

  if (!admin) {
    return;
  }

  await admin
    .from("payment_webhook_events")
    .update({
      status: "failed",
      failure_reason: failureReason,
      processed_at: new Date().toISOString(),
    })
    .eq("organization_id", organizationId)
    .eq("id", eventRowId);
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function requestIp(headers: Headers): string | null {
  const forwardedFor = headers.get("x-forwarded-for");

  return forwardedFor?.split(",")[0]?.trim() || headers.get("x-real-ip") || null;
}
