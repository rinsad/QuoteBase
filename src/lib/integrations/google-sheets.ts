import crypto from "node:crypto";

import type { SupabaseClient } from "@supabase/supabase-js";

import { getBaseUrl } from "@/lib/env";
import {
  decryptSecretPayload,
  encryptSecretPayload,
} from "@/lib/security/secret-box";

export type GoogleSheetsCredentials = {
  clientId: string;
  clientSecret: string;
  accessToken?: string;
  refreshToken?: string;
  expiresAt?: string;
  email?: string | null;
};

export type GoogleSheetsConfig = {
  spreadsheetId: string;
  spreadsheetUrl: string;
  spreadsheetTitle?: string;
  headerRow: number;
  columns: {
    address: string;
    material: string;
    price: string;
    unit: string;
    lastUpdated: string;
    inventory: string;
    hours: string;
  };
  connectedBy?: string;
  lastSyncAt?: string;
  lastSyncStatus?: "success" | "failed";
  lastSyncError?: string;
  lastSyncSummary?: Record<string, unknown>;
  syncLog?: GoogleSheetsSyncLogEntry[];
};

export type GoogleSheetsSyncLogEntry = {
  at: string;
  status: "success" | "failed";
  message?: string;
  summary?: Record<string, unknown>;
};

export type GoogleSheetsIntegrationRecord = {
  id: string;
  organization_id: string;
  is_enabled: boolean;
  config: Record<string, unknown> | null;
  credentials_encrypted: string | null;
  credentials_last4: Record<string, unknown> | null;
  updated_at: string;
};

export type GoogleSheetTab = {
  title: string;
  values: unknown[][];
};

type TokenResponse = {
  access_token?: unknown;
  refresh_token?: unknown;
  expires_in?: unknown;
  id_token?: unknown;
};

const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const SHEETS_API_URL = "https://sheets.googleapis.com/v4/spreadsheets";
const GOOGLE_SHEETS_SCOPE =
  "openid email https://www.googleapis.com/auth/spreadsheets.readonly";
const REQUEST_TIMEOUT_MS = 20_000;

export function googleSheetsRedirectUri(): string {
  return `${getBaseUrl()}/api/integrations/google-sheets/callback`;
}

export function parseSpreadsheetId(value: string): string | null {
  const trimmed = value.trim();
  const urlMatch = trimmed.match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/);
  const candidate = urlMatch?.[1] ?? trimmed;

  return /^[a-zA-Z0-9_-]{20,}$/.test(candidate) ? candidate : null;
}

export function defaultGoogleSheetsConfig(): GoogleSheetsConfig {
  return {
    spreadsheetId: "",
    spreadsheetUrl: "",
    headerRow: 1,
    columns: {
      address: "A",
      material: "B",
      price: "C",
      unit: "D",
      lastUpdated: "E",
      inventory: "F",
      hours: "G",
    },
  };
}

export function normalizeGoogleSheetsConfig(
  config: Record<string, unknown> | null,
): GoogleSheetsConfig {
  const defaults = defaultGoogleSheetsConfig();
  const columns = objectValue(config?.columns);

  return {
    spreadsheetId: stringValue(config?.spreadsheetId) ?? "",
    spreadsheetUrl: stringValue(config?.spreadsheetUrl) ?? "",
    spreadsheetTitle: stringValue(config?.spreadsheetTitle) ?? undefined,
    headerRow: numberValue(config?.headerRow, 1),
    columns: {
      address: columnValue(columns?.address, defaults.columns.address),
      material: columnValue(columns?.material, defaults.columns.material),
      price: columnValue(columns?.price, defaults.columns.price),
      unit: columnValue(columns?.unit, defaults.columns.unit),
      lastUpdated: columnValue(
        columns?.lastUpdated,
        defaults.columns.lastUpdated,
      ),
      inventory: columnValue(columns?.inventory, defaults.columns.inventory),
      hours: columnValue(columns?.hours, defaults.columns.hours),
    },
    connectedBy: stringValue(config?.connectedBy) ?? undefined,
    lastSyncAt: stringValue(config?.lastSyncAt) ?? undefined,
    lastSyncStatus:
      config?.lastSyncStatus === "success" ||
      config?.lastSyncStatus === "failed"
        ? config.lastSyncStatus
        : undefined,
    lastSyncError: stringValue(config?.lastSyncError) ?? undefined,
    lastSyncSummary: objectValue(config?.lastSyncSummary) ?? undefined,
    syncLog: Array.isArray(config?.syncLog)
      ? config.syncLog.flatMap((entry) => {
          const value = objectValue(entry);
          const at = stringValue(value?.at);
          if (
            !at ||
            (value?.status !== "success" && value?.status !== "failed")
          ) return [];
          const status: GoogleSheetsSyncLogEntry["status"] =
            value.status === "success" ? "success" : "failed";
          return [{
            at,
            status,
            message: stringValue(value?.message) ?? undefined,
            summary: objectValue(value?.summary) ?? undefined,
          }];
        }).slice(0, 20)
      : [],
  };
}

export async function createGoogleSheetsAuthorizationUrl({
  integration,
  organizationId,
  userId,
}: {
  integration: GoogleSheetsIntegrationRecord;
  organizationId: string;
  userId: string;
}): Promise<string> {
  const credentials = readCredentials(integration.credentials_encrypted);

  if (!credentials.clientId || !credentials.clientSecret) {
    throw new Error("Google OAuth client credentials are not configured.");
  }

  const url = new URL(GOOGLE_AUTH_URL);
  url.searchParams.set("client_id", credentials.clientId);
  url.searchParams.set("redirect_uri", googleSheetsRedirectUri());
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", GOOGLE_SHEETS_SCOPE);
  url.searchParams.set("access_type", "offline");
  url.searchParams.set("prompt", "consent");
  url.searchParams.set(
    "state",
    signState({ organizationId, userId, issuedAt: Date.now() }),
  );
  return url.toString();
}

export function verifyGoogleSheetsState(
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
  const actualBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);

  if (
    actualBuffer.length !== expectedBuffer.length ||
    !crypto.timingSafeEqual(actualBuffer, expectedBuffer)
  ) {
    return null;
  }

  try {
    const payload: unknown = JSON.parse(
      Buffer.from(body, "base64url").toString("utf8"),
    );
    const value = objectValue(payload);

    if (
      !value ||
      typeof value.organizationId !== "string" ||
      typeof value.userId !== "string" ||
      typeof value.issuedAt !== "number" ||
      Date.now() - value.issuedAt > 10 * 60 * 1000
    ) {
      return null;
    }

    return {
      organizationId: value.organizationId,
      userId: value.userId,
      issuedAt: value.issuedAt,
    };
  } catch {
    return null;
  }
}

export async function exchangeGoogleSheetsCode({
  code,
  integration,
}: {
  code: string;
  integration: GoogleSheetsIntegrationRecord;
}): Promise<GoogleSheetsCredentials> {
  const existing = readCredentials(integration.credentials_encrypted);
  const response = await googleRequest(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: existing.clientId,
      client_secret: existing.clientSecret,
      redirect_uri: googleSheetsRedirectUri(),
      grant_type: "authorization_code",
    }).toString(),
  });
  const token = (await response.json()) as TokenResponse;

  if (
    typeof token.access_token !== "string" ||
    typeof token.refresh_token !== "string"
  ) {
    throw new Error("Google OAuth did not return reusable credentials.");
  }

  return {
    clientId: existing.clientId,
    clientSecret: existing.clientSecret,
    accessToken: token.access_token,
    refreshToken: token.refresh_token,
    expiresAt: expiresAt(token.expires_in),
    email:
      typeof token.id_token === "string"
        ? emailFromIdToken(token.id_token)
        : null,
  };
}

export async function getGoogleSheetsAccessToken({
  supabase,
  integration,
}: {
  supabase: SupabaseClient;
  integration: GoogleSheetsIntegrationRecord;
}): Promise<string> {
  let credentials = readCredentials(integration.credentials_encrypted);

  if (!credentials.refreshToken) {
    throw new Error("Google Sheets is not connected.");
  }

  if (
    credentials.accessToken &&
    credentials.expiresAt &&
    new Date(credentials.expiresAt).getTime() > Date.now() + 60_000
  ) {
    return credentials.accessToken;
  }

  const response = await googleRequest(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: credentials.clientId,
      client_secret: credentials.clientSecret,
      refresh_token: credentials.refreshToken,
      grant_type: "refresh_token",
    }).toString(),
  });
  const token = (await response.json()) as TokenResponse;

  if (typeof token.access_token !== "string") {
    throw new Error("Google token refresh did not return an access token.");
  }

  const accessToken = token.access_token;
  credentials = {
    ...credentials,
    accessToken,
    expiresAt: expiresAt(token.expires_in),
  };
  const { error } = await supabase
    .from("organization_integrations")
    .update({
      credentials_encrypted: encryptSecretPayload(credentials),
      credentials_last4: credentialsLast4(credentials),
      updated_at: new Date().toISOString(),
    })
    .eq("organization_id", integration.organization_id)
    .eq("id", integration.id)
    .eq("provider", "google_sheets");

  if (error) {
    throw new Error(error.message);
  }

  return accessToken;
}

export async function fetchGoogleSpreadsheet({
  accessToken,
  spreadsheetId,
}: {
  accessToken: string;
  spreadsheetId: string;
}): Promise<{ title: string; tabs: GoogleSheetTab[] }> {
  const metadataUrl = new URL(`${SHEETS_API_URL}/${spreadsheetId}`);
  metadataUrl.searchParams.set(
    "fields",
    "properties.title,sheets.properties(title,index)",
  );
  const metadataResponse = await googleRequest(metadataUrl.toString(), {
    headers: { authorization: `Bearer ${accessToken}` },
  });
  const metadata: unknown = await metadataResponse.json();
  const metadataObject = objectValue(metadata);
  const properties = objectValue(metadataObject?.properties);
  const sheets = Array.isArray(metadataObject?.sheets)
    ? metadataObject.sheets
    : [];
  const titles = sheets
    .map((sheet) => objectValue(objectValue(sheet)?.properties)?.title)
    .filter((title): title is string => typeof title === "string");

  if (!titles.length) {
    throw new Error("The linked spreadsheet has no visible tabs.");
  }

  const valuesUrl = new URL(
    `${SHEETS_API_URL}/${spreadsheetId}/values:batchGet`,
  );
  valuesUrl.searchParams.set("majorDimension", "ROWS");
  valuesUrl.searchParams.set("valueRenderOption", "FORMATTED_VALUE");
  for (const title of titles) {
    valuesUrl.searchParams.append("ranges", `${title}!A:ZZ`);
  }
  const valuesResponse = await googleRequest(valuesUrl.toString(), {
    headers: { authorization: `Bearer ${accessToken}` },
  });
  const valuesPayload: unknown = await valuesResponse.json();
  const rawValueRanges = objectValue(valuesPayload)?.valueRanges;
  const valueRanges: unknown[] = Array.isArray(rawValueRanges)
    ? rawValueRanges
    : [];

  return {
    title:
      typeof properties?.title === "string"
        ? properties.title
        : "Google spreadsheet",
    tabs: titles.map((title, index) => {
      const range = objectValue(valueRanges?.[index]);
      return {
        title,
        values: Array.isArray(range?.values)
          ? range.values.filter(Array.isArray)
          : [],
      };
    }),
  };
}

export function encryptedGoogleSheetsCredentials(
  credentials: GoogleSheetsCredentials,
): string {
  return encryptSecretPayload(credentials);
}

export function disconnectedGoogleSheetsCredentials(encrypted: string | null): {
  encrypted: string;
  last4: Record<string, unknown>;
} {
  const existing = readCredentials(encrypted);
  const credentials: GoogleSheetsCredentials = {
    clientId: existing.clientId,
    clientSecret: existing.clientSecret,
  };
  return {
    encrypted: encryptSecretPayload(credentials),
    last4: credentialsLast4(credentials),
  };
}

export function credentialsLast4(
  credentials: Partial<GoogleSheetsCredentials>,
): Record<string, unknown> {
  return {
    client_id: credentials.clientId?.slice(-4) ?? null,
    client_secret: Boolean(credentials.clientSecret),
    email: credentials.email ?? null,
    connected: Boolean(credentials.refreshToken),
  };
}

export function mergeOAuthSettings({
  encrypted,
  clientId,
  clientSecret,
}: {
  encrypted: string | null;
  clientId: string;
  clientSecret: string;
}): GoogleSheetsCredentials {
  let existing: Partial<GoogleSheetsCredentials> = {};
  try {
    existing =
      decryptSecretPayload<Partial<GoogleSheetsCredentials>>(encrypted) ?? {};
  } catch {
    existing = {};
  }

  return { ...existing, clientId, clientSecret };
}

function readCredentials(encrypted: string | null): GoogleSheetsCredentials {
  const credentials =
    decryptSecretPayload<Partial<GoogleSheetsCredentials>>(encrypted);

  if (!credentials?.clientId || !credentials.clientSecret) {
    throw new Error("Google OAuth client credentials are not configured.");
  }

  return {
    clientId: credentials.clientId,
    clientSecret: credentials.clientSecret,
    accessToken: credentials.accessToken,
    refreshToken: credentials.refreshToken,
    expiresAt: credentials.expiresAt,
    email: credentials.email ?? null,
  };
}

function signState(payload: {
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

async function googleRequest(
  url: string,
  init: RequestInit,
): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      ...init,
      cache: "no-store",
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`Google API returned HTTP ${response.status}.`);
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

function emailFromIdToken(idToken: string): string | null {
  const payload = idToken.split(".")[1];
  if (!payload) return null;

  try {
    const value = objectValue(
      JSON.parse(Buffer.from(payload, "base64url").toString("utf8")),
    );
    return stringValue(value?.email);
  } catch {
    return null;
  }
}

function requiredEnv(key: string): string {
  const value = process.env[key]?.trim();
  if (!value) throw new Error(`${key} is not configured.`);
  return value;
}

function objectValue(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function numberValue(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isInteger(value)
    ? value
    : fallback;
}

function columnValue(value: unknown, fallback: string): string {
  return typeof value === "string" && /^[A-Z]{1,3}$/i.test(value.trim())
    ? value.trim().toUpperCase()
    : fallback;
}
