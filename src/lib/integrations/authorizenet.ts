import type { SupabaseClient } from "@supabase/supabase-js";

import {
  decryptSecretPayload,
  encryptSecretPayload,
} from "@/lib/security/secret-box";

export type AuthorizeNetEnvironment = "sandbox" | "production";

export type AuthorizeNetCredentials = {
  apiLoginId: string;
  transactionKey: string;
};

export type AuthorizeNetIntegration = {
  id: string;
  organizationId: string;
  isEnabled: boolean;
  environment: AuthorizeNetEnvironment;
  apiLoginId: string | null;
  transactionKey: string | null;
};

export type AuthorizeNetHostedPaymentInput = {
  supabase: SupabaseClient;
  organizationId: string;
  quoteNumber: string;
  amount: number;
  customerEmail: string | null;
  returnUrl: string;
  cancelUrl: string;
  communicatorUrl: string;
};

type AuthorizeNetIntegrationRecord = {
  id: string;
  organization_id: string;
  is_enabled: boolean;
  config: Record<string, unknown> | null;
  credentials_encrypted: string | null;
};

type AuthorizeNetHostedPaymentResponse = {
  token?: unknown;
  messages?: {
    resultCode?: unknown;
    message?: Array<{
      code?: unknown;
      text?: unknown;
    }>;
  };
};

const API_URLS: Record<AuthorizeNetEnvironment, string> = {
  sandbox: "https://apitest.authorize.net/xml/v1/request.api",
  production: "https://api.authorize.net/xml/v1/request.api",
};

const HOSTED_PAYMENT_URLS: Record<AuthorizeNetEnvironment, string> = {
  sandbox: "https://test.authorize.net/payment/payment",
  production: "https://accept.authorize.net/payment/payment",
};

const AUTHORIZE_NET_TIMEOUT_MS = 15000;

export async function getAuthorizeNetIntegration({
  supabase,
  organizationId,
}: {
  supabase: SupabaseClient;
  organizationId: string;
}): Promise<AuthorizeNetIntegration | null> {
  const { data } = await supabase
    .from("organization_integrations")
    .select("id, organization_id, is_enabled, config, credentials_encrypted")
    .eq("organization_id", organizationId)
    .eq("provider", "authorizenet")
    .maybeSingle<AuthorizeNetIntegrationRecord>();

  if (!data) {
    return null;
  }

  let credentials: Partial<AuthorizeNetCredentials> | null = null;

  try {
    credentials = decryptSecretPayload<Partial<AuthorizeNetCredentials>>(
      data.credentials_encrypted,
    );
  } catch (error) {
    console.error("Authorize.net credentials could not be decrypted.", error);
  }

  return {
    id: data.id,
    organizationId: data.organization_id,
    isEnabled: data.is_enabled,
    environment: normalizeEnvironment(data.config?.environment),
    apiLoginId: stringValue(credentials?.apiLoginId),
    transactionKey: stringValue(credentials?.transactionKey),
  };
}

export async function createAuthorizeNetHostedPayment({
  supabase,
  organizationId,
  quoteNumber,
  amount,
  customerEmail,
  returnUrl,
  cancelUrl,
  communicatorUrl,
}: AuthorizeNetHostedPaymentInput): Promise<{
  token: string;
  hostedPaymentUrl: string;
  environment: AuthorizeNetEnvironment;
}> {
  const integration = await getAuthorizeNetIntegration({
    supabase,
    organizationId,
  });

  if (!integration?.isEnabled || !integration.apiLoginId || !integration.transactionKey) {
    throw new Error(
      "Authorize.net is not connected. Configure it in Admin > Integrations before accepting COD quotes.",
    );
  }

  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error("Quote total must be greater than zero before payment.");
  }

  const response = await authorizeNetFetch<AuthorizeNetHostedPaymentResponse>({
    environment: integration.environment,
    body: {
      getHostedPaymentPageRequest: {
        merchantAuthentication: {
          name: integration.apiLoginId,
          transactionKey: integration.transactionKey,
        },
        transactionRequest: {
          transactionType: "authCaptureTransaction",
          amount: amount.toFixed(2),
          order: {
            invoiceNumber: truncate(quoteNumber, 20),
            description: truncate(`Quote ${quoteNumber}`, 255),
          },
          customer: customerEmail ? { email: customerEmail } : undefined,
        },
        hostedPaymentSettings: {
          setting: [
            hostedSetting("hostedPaymentReturnOptions", {
              showReceipt: false,
              url: returnUrl,
              urlText: "Return to quote",
              cancelUrl,
              cancelUrlText: "Cancel",
            }),
            hostedSetting("hostedPaymentButtonOptions", {
              text: "Pay and accept quote",
            }),
            hostedSetting("hostedPaymentPaymentOptions", {
              cardCodeRequired: true,
              showCreditCard: true,
              showBankAccount: false,
            }),
            hostedSetting("hostedPaymentStyleOptions", {
              bgColor: "#3D6652",
            }),
            hostedSetting("hostedPaymentShippingAddressOptions", {
              show: false,
              required: false,
            }),
            hostedSetting("hostedPaymentBillingAddressOptions", {
              show: true,
              required: false,
            }),
            hostedSetting("hostedPaymentCustomerOptions", {
              showEmail: Boolean(customerEmail),
              requiredEmail: false,
              addPaymentProfile: false,
            }),
            hostedSetting("hostedPaymentIFrameCommunicatorUrl", {
              url: communicatorUrl,
            }),
          ],
        },
      },
    },
  });

  if (typeof response.token !== "string" || !response.token.trim()) {
    throw new Error(authorizeNetMessage(response) ?? "Authorize.net did not return a hosted payment token.");
  }

  return {
    token: response.token,
    hostedPaymentUrl: HOSTED_PAYMENT_URLS[integration.environment],
    environment: integration.environment,
  };
}

export function encryptedAuthorizeNetCredentials(
  credentials: AuthorizeNetCredentials,
): string {
  return encryptSecretPayload(credentials);
}

export function authorizeNetCredentialsLast4(
  credentials: Partial<AuthorizeNetCredentials>,
): Record<string, unknown> {
  return {
    api_login_id: credentials.apiLoginId ? last4(credentials.apiLoginId) : null,
    transaction_key: Boolean(credentials.transactionKey),
  };
}

export function hostedAuthorizeNetPaymentUrl(
  environment: AuthorizeNetEnvironment,
): string {
  return HOSTED_PAYMENT_URLS[environment];
}

async function authorizeNetFetch<T>({
  environment,
  body,
}: {
  environment: AuthorizeNetEnvironment;
  body: Record<string, unknown>;
}): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), AUTHORIZE_NET_TIMEOUT_MS);

  try {
    const response = await fetch(API_URLS[environment], {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify(body),
      signal: controller.signal,
      cache: "no-store",
    });
    const payload = (await response.json()) as AuthorizeNetHostedPaymentResponse;

    if (!response.ok || payload.messages?.resultCode === "Error") {
      throw new Error(
        authorizeNetMessage(payload) ?? `Authorize.net returned HTTP ${response.status}.`,
      );
    }

    return payload as T;
  } finally {
    clearTimeout(timeout);
  }
}

function hostedSetting(settingName: string, value: Record<string, unknown>) {
  return {
    settingName,
    settingValue: JSON.stringify(value),
  };
}

function authorizeNetMessage(
  payload: AuthorizeNetHostedPaymentResponse,
): string | null {
  const message = payload.messages?.message?.[0];
  const text = typeof message?.text === "string" ? message.text : null;
  const code = typeof message?.code === "string" ? message.code : null;

  return [code, text].filter(Boolean).join(": ") || null;
}

function normalizeEnvironment(value: unknown): AuthorizeNetEnvironment {
  return value === "production" ? "production" : "sandbox";
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function last4(value: string): string {
  return value.slice(-4);
}

function truncate(value: string, maxLength: number): string {
  return value.length > maxLength ? value.slice(0, maxLength) : value;
}
