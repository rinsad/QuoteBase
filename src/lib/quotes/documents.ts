import type { SupabaseClient } from "@supabase/supabase-js";

import type { AppUser } from "@/lib/auth/current-user";
import type { QuoteStatus } from "@/lib/quotes/quotes";

export type QuoteDocument = {
  id: string;
  quote_id: string;
  version: number;
  document_type: "html" | "pdf";
  storage_bucket: string;
  storage_path: string;
  status: "generated" | "archived" | "voided";
  generated_at: string;
  generated_by_name: string | null;
};

type QuoteDocumentRecord = Omit<QuoteDocument, "generated_by_name"> & {
  users: { full_name: string } | { full_name: string }[] | null;
};

type QuoteSnapshotRecord = {
  id: string;
  quote_number: string;
  status: QuoteStatus;
  material_subtotal: number;
  trucking_subtotal: number;
  fees_subtotal: number;
  tax_total: number;
  total: number;
  notes: string | null;
  created_at: string;
  customers:
    | {
        name: string;
        contact_name: string | null;
        email: string | null;
        phone: string | null;
      }
    | {
        name: string;
        contact_name: string | null;
        email: string | null;
        phone: string | null;
      }[]
    | null;
  job_sites:
    | {
        name: string;
        city: string;
        county: string;
        state: string;
        address: Record<string, unknown>;
      }
    | {
        name: string;
        city: string;
        county: string;
        state: string;
        address: Record<string, unknown>;
      }[]
    | null;
  users:
    | { full_name: string; email: string }
    | { full_name: string; email: string }[]
    | null;
  quote_items: QuoteSnapshotItemRecord[] | null;
};

type QuoteSnapshotItemRecord = {
  quantity: number;
  unit: string;
  load_count: number;
  line_total: number;
  materials:
    | { name: string; tier: string }
    | { name: string; tier: string }[]
    | null;
  suppliers: { name: string } | { name: string }[] | null;
  vehicle_types: { name: string } | { name: string }[] | null;
};

type ExistingVersionRecord = {
  version: number;
};

const BUCKET = "quote-documents";

export async function getQuoteDocuments({
  supabase,
  organizationId,
  quoteId,
}: {
  supabase: SupabaseClient;
  organizationId: string;
  quoteId: string;
}): Promise<QuoteDocument[]> {
  const { data } = await supabase
    .from("quote_documents")
    .select(
      "id, quote_id, version, document_type, storage_bucket, storage_path, status, generated_at, users(full_name)",
    )
    .eq("organization_id", organizationId)
    .eq("quote_id", quoteId)
    .order("generated_at", { ascending: false })
    .returns<QuoteDocumentRecord[]>();

  return (
    data?.map((document) => ({
      id: document.id,
      quote_id: document.quote_id,
      version: Number(document.version),
      document_type: document.document_type,
      storage_bucket: document.storage_bucket,
      storage_path: document.storage_path,
      status: document.status,
      generated_at: document.generated_at,
      generated_by_name: relationOne(document.users)?.full_name ?? null,
    })) ?? []
  );
}

export async function createQuoteHtmlDocument({
  supabase,
  user,
  quoteId,
}: {
  supabase: SupabaseClient;
  user: AppUser;
  quoteId: string;
}): Promise<QuoteDocument | null> {
  if (user.role !== "admin" && user.role !== "account_manager") {
    throw new Error("You do not have permission to create quote documents.");
  }

  const { data: quote } = await supabase
    .from("quotes")
    .select(
      "id, quote_number, status, material_subtotal, trucking_subtotal, fees_subtotal, tax_total, total, notes, created_at, customers(name, contact_name, email, phone), job_sites(name, city, county, state, address), users(full_name, email), quote_items(quantity, unit, load_count, line_total, materials(name, tier), suppliers(name), vehicle_types(name))",
    )
    .eq("organization_id", user.organization_id)
    .eq("id", quoteId)
    .eq("is_active", true)
    .single<QuoteSnapshotRecord>();

  if (!quote) {
    throw new Error("Quote not found.");
  }

  if (!["approved", "sent", "viewed", "accepted", "declined"].includes(quote.status)) {
    throw new Error("Quote documents are available after approval.");
  }

  const version = await getNextDocumentVersion({
    supabase,
    organizationId: user.organization_id,
    quoteId,
  });
  const storagePath = `${user.organization_id}/${quote.id}/v${version}-${quote.quote_number}.html`;
  const html = renderQuoteHtml(quote, version);
  const upload = await supabase.storage
    .from(BUCKET)
    .upload(storagePath, new Blob([html], { type: "text/html" }), {
      contentType: "text/html",
      upsert: false,
    });

  if (upload.error) {
    throw new Error(upload.error.message);
  }

  const { data: document } = await supabase
    .from("quote_documents")
    .insert({
      organization_id: user.organization_id,
      quote_id: quote.id,
      version,
      document_type: "html",
      storage_bucket: BUCKET,
      storage_path: storagePath,
      status: "generated",
      generated_by: user.id,
    })
    .select(
      "id, quote_id, version, document_type, storage_bucket, storage_path, status, generated_at, users(full_name)",
    )
    .single<QuoteDocumentRecord>();

  if (!document) {
    await supabase.storage.from(BUCKET).remove([storagePath]);
    return null;
  }

  return {
    id: document.id,
    quote_id: document.quote_id,
    version: Number(document.version),
    document_type: document.document_type,
    storage_bucket: document.storage_bucket,
    storage_path: document.storage_path,
    status: document.status,
    generated_at: document.generated_at,
    generated_by_name: relationOne(document.users)?.full_name ?? null,
  };
}

export async function createQuoteDocumentSignedUrl({
  supabase,
  organizationId,
  documentId,
}: {
  supabase: SupabaseClient;
  organizationId: string;
  documentId: string;
}): Promise<string | null> {
  const { data: document } = await supabase
    .from("quote_documents")
    .select("id, storage_bucket, storage_path, status")
    .eq("organization_id", organizationId)
    .eq("id", documentId)
    .neq("status", "voided")
    .single<{
      id: string;
      storage_bucket: string;
      storage_path: string;
      status: string;
    }>();

  if (!document) {
    return null;
  }

  const { data } = await supabase.storage
    .from(document.storage_bucket)
    .createSignedUrl(document.storage_path, 60);

  return data?.signedUrl ?? null;
}

async function getNextDocumentVersion({
  supabase,
  organizationId,
  quoteId,
}: {
  supabase: SupabaseClient;
  organizationId: string;
  quoteId: string;
}): Promise<number> {
  const { data } = await supabase
    .from("quote_documents")
    .select("version")
    .eq("organization_id", organizationId)
    .eq("quote_id", quoteId)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle<ExistingVersionRecord>();

  return Number(data?.version ?? 0) + 1;
}

function renderQuoteHtml(quote: QuoteSnapshotRecord, version: number): string {
  const customer = relationOne(quote.customers);
  const site = relationOne(quote.job_sites);
  const owner = relationOne(quote.users);
  const rows =
    quote.quote_items
      ?.map((item) => {
        const material = relationOne(item.materials);
        const supplier = relationOne(item.suppliers);
        const vehicle = relationOne(item.vehicle_types);

        return `<tr>
          <td>
            <strong>${escapeHtml(material?.name ?? "Unknown material")}</strong><br />
            <span>${escapeHtml(supplier?.name ?? "Unknown supplier")} - ${escapeHtml(material?.tier ?? "")}</span>
          </td>
          <td>${Number(item.quantity).toLocaleString()} ${escapeHtml(item.unit)}</td>
          <td>${Number(item.load_count).toFixed(0)}${vehicle?.name ? ` via ${escapeHtml(vehicle.name)}` : ""}</td>
          <td class="right">${formatCurrency(Number(item.line_total))}</td>
        </tr>`;
      })
      .join("") ?? "";

  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(quote.quote_number)} v${version}</title>
  <style>
    body { color: #0f172a; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Arial, sans-serif; margin: 40px; }
    header { border-bottom: 1px solid #dbe3ef; padding-bottom: 24px; }
    h1 { font-size: 36px; margin: 8px 0; }
    .muted { color: #64748b; }
    .grid { display: grid; gap: 24px; grid-template-columns: 1fr 1fr; margin: 28px 0; }
    table { border-collapse: collapse; width: 100%; }
    th { background: #0f172a; color: white; font-size: 12px; letter-spacing: .08em; padding: 12px; text-align: left; text-transform: uppercase; }
    td { border-bottom: 1px solid #e2e8f0; padding: 14px 12px; vertical-align: top; }
    .right { text-align: right; }
    .totals { margin-left: auto; margin-top: 28px; width: 340px; }
    .totals div { display: flex; justify-content: space-between; padding: 8px 0; }
    .total { border-top: 1px solid #cbd5e1; font-size: 22px; font-weight: 700; margin-top: 8px; padding-top: 14px !important; }
    footer { border-top: 1px solid #dbe3ef; color: #64748b; font-size: 12px; margin-top: 40px; padding-top: 16px; }
  </style>
</head>
<body>
  <header>
    <p class="muted">Western Materials</p>
    <h1>Quote ${escapeHtml(quote.quote_number)}</h1>
    <p class="muted">Version ${version} - ${escapeHtml(formatStatus(quote.status))} - ${formatDate(quote.created_at)}</p>
  </header>
  <section class="grid">
    <div>
      <p class="muted">Prepared for</p>
      <h2>${escapeHtml(customer?.name ?? "Unknown customer")}</h2>
      <p>${escapeHtml(customer?.contact_name ?? "")}<br />${escapeHtml(customer?.email ?? "")}<br />${escapeHtml(customer?.phone ?? "")}</p>
    </div>
    <div>
      <p class="muted">Job site</p>
      <h2>${escapeHtml(site?.name ?? "Unknown site")}</h2>
      <p>${escapeHtml(formatAddress(site?.address ?? {}))}<br />${escapeHtml(site?.city ?? "")}, ${escapeHtml(site?.state ?? "")}</p>
    </div>
  </section>
  <table>
    <thead>
      <tr><th>Material</th><th>Quantity</th><th>Loads</th><th class="right">Line total</th></tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>
  <section class="totals">
    <div><span>Material</span><strong>${formatCurrency(Number(quote.material_subtotal))}</strong></div>
    <div><span>Trucking</span><strong>${formatCurrency(Number(quote.trucking_subtotal))}</strong></div>
    <div><span>Fees</span><strong>${formatCurrency(Number(quote.fees_subtotal))}</strong></div>
    <div><span>Tax</span><strong>${formatCurrency(Number(quote.tax_total))}</strong></div>
    <div class="total"><span>Total</span><span>${formatCurrency(Number(quote.total))}</span></div>
  </section>
  <section>
    <h2>Notes</h2>
    <p>${escapeHtml(quote.notes ?? "Pricing is subject to material availability, trucking availability, and final job-site conditions.")}</p>
  </section>
  <footer>
    Prepared by ${escapeHtml(owner?.full_name ?? "QuoteBase")} on ${formatDate(new Date().toISOString())}.
  </footer>
</body>
</html>`;
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(value);
}

function formatStatus(status: string): string {
  return status
    .split("_")
    .map((part) => part[0]?.toUpperCase() + part.slice(1))
    .join(" ");
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  }).format(new Date(value));
}

function formatAddress(address: Record<string, unknown>): string {
  const line1 = typeof address.line1 === "string" ? address.line1 : "";
  const city = typeof address.city === "string" ? address.city : "";
  const state = typeof address.state === "string" ? address.state : "";

  return [line1, city, state].filter(Boolean).join(", ") || "Address pending";
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function relationOne<T>(value: T | T[] | null): T | null {
  return Array.isArray(value) ? (value[0] ?? null) : value;
}
