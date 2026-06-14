import type { SupabaseClient } from "@supabase/supabase-js";

import type { AppUser } from "@/lib/auth/current-user";
import { logAction } from "@/lib/audit/log-action";
import { isFeatureEnabled } from "@/lib/features/flags";
import { decryptSecretPayload } from "@/lib/security/secret-box";

type QuoterCredentials = {
  apiKey?: string;
};

type QuoterIntegrationRecord = {
  id: string;
  is_enabled: boolean;
  config: Record<string, unknown> | null;
  credentials_encrypted: string | null;
};

type QuoterQuoteRecord = {
  id: string;
  quote_number: string;
  total: number;
  customers:
    | { name: string; contact_name: string | null; email: string | null; phone: string | null }
    | { name: string; contact_name: string | null; email: string | null; phone: string | null }[]
    | null;
  job_sites:
    | { name: string; city: string; county: string; state: string; address: Record<string, unknown> }
    | { name: string; city: string; county: string; state: string; address: Record<string, unknown> }[]
    | null;
  quote_items: QuoterQuoteItemRecord[] | null;
};

type QuoterQuoteItemRecord = {
  quantity: number;
  unit: string;
  material_unit_price: number;
  line_total: number;
  materials: { name: string } | { name: string }[] | null;
};

const QUOTER_TIMEOUT_MS = 7000;

export async function pushQuoteToQuoterDraft({
  supabase,
  user,
  quoteId,
}: {
  supabase: SupabaseClient;
  user: AppUser;
  quoteId: string;
}): Promise<void> {
  try {
    await pushQuoteToQuoterDraftInternal({ supabase, user, quoteId });
  } catch (error) {
    console.error("Quoter draft push failed before sync could run.", error);

    await logQuoterResult({
      supabase,
      user,
      quoteId,
      status: "failed",
      reason: error instanceof Error ? error.message : "Quoter push failed.",
    });
  }
}

async function pushQuoteToQuoterDraftInternal({
  supabase,
  user,
  quoteId,
}: {
  supabase: SupabaseClient;
  user: AppUser;
  quoteId: string;
}): Promise<void> {
  const quoterEnabled = await isFeatureEnabled({
    supabase,
    organizationId: user.organization_id,
    featureName: "quoter_integration",
  });

  if (!quoterEnabled) {
    await logQuoterResult({
      supabase,
      user,
      quoteId,
      status: "skipped",
      reason: "Quoter integration feature flag is disabled.",
    });
    return;
  }

  const { data: integration } = await supabase
    .from("organization_integrations")
    .select("id, is_enabled, config, credentials_encrypted")
    .eq("organization_id", user.organization_id)
    .eq("provider", "quoter")
    .maybeSingle<QuoterIntegrationRecord>();

  if (!integration?.is_enabled) {
    await logQuoterResult({
      supabase,
      user,
      quoteId,
      status: "skipped",
      reason: "Quoter integration is not enabled.",
    });
    return;
  }

  const credentials = decryptSecretPayload<QuoterCredentials>(
    integration.credentials_encrypted,
  );
  const apiKey = stringValue(credentials?.apiKey);
  const apiBaseUrl =
    stringValue(integration.config?.api_base_url) ?? "https://api.quoter.com/v1";

  if (!apiKey) {
    await logQuoterResult({
      supabase,
      user,
      quoteId,
      status: "skipped",
      reason: "Quoter API key is not configured.",
    });
    return;
  }

  const quote = await getQuoterQuote({ supabase, user, quoteId });

  if (!quote) {
    await logQuoterResult({
      supabase,
      user,
      quoteId,
      status: "failed",
      reason: "Quote data was unavailable for Quoter.",
    });
    return;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), QUOTER_TIMEOUT_MS);

  try {
    const response = await fetch(`${apiBaseUrl.replace(/\/$/, "")}/quotes`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${apiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        status: "draft",
        external_id: quote.id,
        quote_number: quote.quote_number,
        total: Number(quote.total),
        customer: quote.customer,
        job_site: quote.jobSite,
        line_items: quote.items,
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      await logQuoterResult({
        supabase,
        user,
        quoteId,
        status: "failed",
        reason: `Quoter returned HTTP ${response.status}.`,
      });
      return;
    }

    const payload = await parseJsonObject(response);

    await logQuoterResult({
      supabase,
      user,
      quoteId,
      status: "pushed",
      reason: "Quote pushed to Quoter as draft.",
      quoterId: stringValue(payload?.id) ?? stringValue(payload?.quote_id),
    });
  } catch (error) {
    await logQuoterResult({
      supabase,
      user,
      quoteId,
      status: "failed",
      reason: error instanceof Error ? error.message : "Quoter push failed.",
    });
  } finally {
    clearTimeout(timeout);
  }
}

async function getQuoterQuote({
  supabase,
  user,
  quoteId,
}: {
  supabase: SupabaseClient;
  user: AppUser;
  quoteId: string;
}) {
  const { data } = await supabase
    .from("quotes")
    .select(
      "id, quote_number, total, customers(name, contact_name, email, phone), job_sites(name, city, county, state, address), quote_items(quantity, unit, material_unit_price, line_total, materials(name))",
    )
    .eq("organization_id", user.organization_id)
    .eq("id", quoteId)
    .eq("is_active", true)
    .single<QuoterQuoteRecord>();

  if (!data) {
    return null;
  }

  const customer = relationOne(data.customers);
  const jobSite = relationOne(data.job_sites);

  return {
    id: data.id,
    quote_number: data.quote_number,
    total: Number(data.total),
    customer,
    jobSite,
    items:
      data.quote_items?.map((item) => ({
        name: relationOne(item.materials)?.name ?? "Material",
        quantity: Number(item.quantity),
        unit: item.unit,
        unit_price: Number(item.material_unit_price),
        total: Number(item.line_total),
      })) ?? [],
  };
}

async function logQuoterResult({
  supabase,
  user,
  quoteId,
  status,
  reason,
  quoterId,
}: {
  supabase: SupabaseClient;
  user: AppUser;
  quoteId: string;
  status: "pushed" | "skipped" | "failed";
  reason: string;
  quoterId?: string | null;
}) {
  try {
    await logAction({
      supabase,
      user,
      action: "quote.quoter_draft_push",
      targetTable: "quotes",
      targetId: quoteId,
      before: null,
      after: {
        status,
        reason,
        quoter_id: quoterId ?? null,
      },
    });
  } catch (error) {
    console.error("Could not write Quoter integration audit log.", error);
  }
}

async function parseJsonObject(response: Response): Promise<Record<string, unknown> | null> {
  try {
    const payload: unknown = await response.json();

    return typeof payload === "object" && payload !== null
      ? (payload as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

function relationOne<T>(value: T | T[] | null): T | null {
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}
