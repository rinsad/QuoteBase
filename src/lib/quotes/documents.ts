import { deflateSync, inflateSync } from "node:zlib";

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
  quote_date: string;
  expires_at: string;
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
  material_unit_price: number;
  material_subtotal: number;
  trucking_subtotal: number;
  fees_subtotal: number;
  line_total: number;
  materials:
    | { name: string; tier: string }
    | { name: string; tier: string }[]
    | null;
  supplier_plants: { name: string } | { name: string }[] | null;
};

type QuoteDocumentPricingConfig = {
  fuel_surcharge_per_load: number;
  environmental_fee_per_load: number;
};

type QuoteBrandingConfig = {
  company_name: string;
  logo_url: string | null;
  address_line1: string;
  address_line2: string | null;
  city: string;
  state: string;
  postal_code: string;
  country: string;
  phone: string;
  footer_note: string | null;
  disclaimer: string;
};

type ExistingVersionRecord = {
  version: number;
};

type PdfImageInput = {
  width: number;
  height: number;
  data: Buffer;
  filter: "DCTDecode" | "FlateDecode";
};

type PdfImageRef = {
  name: string;
  width: number;
  height: number;
};

type PdfLink = {
  url: string;
  x: number;
  y: number;
  width: number;
  height: number;
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
      "id, quote_number, status, material_subtotal, trucking_subtotal, fees_subtotal, tax_total, total, notes, created_at, quote_date, expires_at, customers(name, contact_name, email, phone), job_sites(name, city, county, state, address), users(full_name, email), quote_items(quantity, unit, load_count, material_unit_price, material_subtotal, trucking_subtotal, fees_subtotal, line_total, materials(name, tier), supplier_plants(name))",
    )
    .eq("organization_id", user.organization_id)
    .eq("id", quoteId)
    .eq("is_active", true)
    .single<QuoteSnapshotRecord>();

  if (!quote) {
    throw new Error("Quote not found.");
  }

  if (
    !["approved", "sent", "viewed", "follow_up", "won", "lost", "accepted", "declined"].includes(
      quote.status,
    )
  ) {
    throw new Error("Quote documents are available after approval.");
  }

  const version = await getNextDocumentVersion({
    supabase,
    organizationId: user.organization_id,
    quoteId,
  });
  const { data: branding } = await supabase
    .from("quote_branding")
    .select(
      "company_name, logo_url, address_line1, address_line2, city, state, postal_code, country, phone, footer_note, disclaimer",
    )
    .eq("organization_id", user.organization_id)
    .maybeSingle<QuoteBrandingConfig>();
  const storagePath = `${user.organization_id}/${quote.id}/v${version}-${quote.quote_number}.html`;
  const html = renderQuoteHtml(quote, version, branding);
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

export async function createQuotePdfDocument({
  supabase,
  user,
  quoteId,
  quoteUrl,
}: {
  supabase: SupabaseClient;
  user: AppUser;
  quoteId: string;
  quoteUrl?: string | null;
}): Promise<QuoteDocument | null> {
  if (user.role !== "admin" && user.role !== "account_manager") {
    throw new Error("You do not have permission to create quote documents.");
  }

  const { data: quote } = await supabase
    .from("quotes")
    .select(
      "id, quote_number, status, material_subtotal, trucking_subtotal, fees_subtotal, tax_total, total, notes, created_at, quote_date, expires_at, customers(name, contact_name, email, phone), job_sites(name, city, county, state, address), users(full_name, email), quote_items(quantity, unit, load_count, material_unit_price, material_subtotal, trucking_subtotal, fees_subtotal, line_total, materials(name, tier), supplier_plants(name))",
    )
    .eq("organization_id", user.organization_id)
    .eq("id", quoteId)
    .eq("is_active", true)
    .single<QuoteSnapshotRecord>();

  if (!quote) {
    throw new Error("Quote not found.");
  }

  if (
    !["approved", "sent", "viewed", "follow_up", "won", "lost", "accepted", "declined"].includes(
      quote.status,
    )
  ) {
    throw new Error("Quote documents are available after approval.");
  }

  const version = await getNextDocumentVersion({
    supabase,
    organizationId: user.organization_id,
    quoteId,
  });
  const { data: pricingConfig } = await supabase
    .from("pricing_config")
    .select("fuel_surcharge_per_load, environmental_fee_per_load")
    .eq("organization_id", user.organization_id)
    .single<QuoteDocumentPricingConfig>();
  const { data: branding } = await supabase
    .from("quote_branding")
    .select(
      "company_name, logo_url, address_line1, address_line2, city, state, postal_code, country, phone, footer_note, disclaimer",
    )
    .eq("organization_id", user.organization_id)
    .maybeSingle<QuoteBrandingConfig>();
  const storagePath = `${user.organization_id}/${quote.id}/v${version}-${quote.quote_number}.pdf`;
  const pdf = await renderQuotePdf(quote, version, pricingConfig, branding, quoteUrl ?? null);
  const upload = await supabase.storage
    .from(BUCKET)
    .upload(storagePath, new Blob([Buffer.from(pdf)], { type: "application/pdf" }), {
      contentType: "application/pdf",
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
      document_type: "pdf",
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

export async function getQuoteDocumentAttachment({
  supabase,
  organizationId,
  documentId,
}: {
  supabase: SupabaseClient;
  organizationId: string;
  documentId: string;
}): Promise<{
  filename: string;
  contentType: string;
  contentBase64: string;
} | null> {
  const { data: document } = await supabase
    .from("quote_documents")
    .select("id, version, document_type, storage_bucket, storage_path, status")
    .eq("organization_id", organizationId)
    .eq("id", documentId)
    .neq("status", "voided")
    .single<{
      id: string;
      version: number;
      document_type: "html" | "pdf";
      storage_bucket: string;
      storage_path: string;
      status: string;
    }>();

  if (!document) {
    return null;
  }

  const { data } = await supabase.storage
    .from(document.storage_bucket)
    .download(document.storage_path);

  if (!data) {
    return null;
  }

  const bytes = Buffer.from(await data.arrayBuffer());

  return {
    filename:
      document.storage_path.split("/").pop() ??
      `quote-v${document.version}.${document.document_type}`,
    contentType:
      document.document_type === "pdf" ? "application/pdf" : "text/html",
    contentBase64: bytes.toString("base64"),
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

function renderQuoteHtml(
  quote: QuoteSnapshotRecord,
  version: number,
  branding: QuoteBrandingConfig | null,
): string {
  const customer = relationOne(quote.customers);
  const site = relationOne(quote.job_sites);
  const owner = relationOne(quote.users);
  const activeBranding = branding ?? defaultQuoteBranding();
  const brandHeader = activeBranding.logo_url
    ? `<img class="logo" src="${escapeHtml(activeBranding.logo_url)}" alt="${escapeHtml(activeBranding.company_name)} logo" />`
    : `<p class="muted">${escapeHtml(activeBranding.company_name)}</p>`;
  const rows =
    quote.quote_items
      ?.map((item) => {
        const material = relationOne(item.materials);
        const supplier = relationOne(item.supplier_plants);

        return `<tr>
          <td>
            <strong>${escapeHtml(material?.name ?? "Unknown material")}</strong><br />
            <span>${escapeHtml(supplier?.name ?? "Unknown supplier")} - ${escapeHtml(material?.tier ?? "")}</span>
          </td>
          <td>${Number(item.quantity).toLocaleString()} ${escapeHtml(item.unit)}</td>
          <td>${Number(item.load_count).toFixed(0)}</td>
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
    .logo { display: block; max-height: 56px; max-width: 260px; object-fit: contain; object-position: left center; }
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
    ${brandHeader}
    <h1>Quote ${escapeHtml(quote.quote_number)}</h1>
    <p class="muted">Version ${version} - ${escapeHtml(formatStatus(quote.status))} - ${formatDate(quote.quote_date)} - Expires ${formatDate(quote.expires_at)}</p>
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

async function renderQuotePdf(
  quote: QuoteSnapshotRecord,
  version: number,
  pricingConfig: QuoteDocumentPricingConfig | null,
  branding: QuoteBrandingConfig | null,
  quoteUrl: string | null,
): Promise<Uint8Array> {
  const customer = relationOne(quote.customers);
  const site = relationOne(quote.job_sites);
  const owner = relationOne(quote.users);
  const pdf = new PdfBuilder();
  let page = pdf.addPage();
  let pageNumber = 1;
  const activeBranding = branding ?? defaultQuoteBranding();
  const logo = activeBranding.logo_url
    ? pdf.embedImage(await loadPdfLogo(activeBranding.logo_url))
    : null;

  let y = drawEmailedQuoteHeader({
    page,
    quote,
    customer,
    site,
    owner,
    branding: activeBranding,
    logo,
    quoteUrl,
  });
  y = drawEmailedQuoteTableHeader(page, y, site);

  for (const item of quote.quote_items ?? []) {
    if (y < 250) {
      drawEmailedQuoteFooter(page, pageNumber);
      page = pdf.addPage();
      pageNumber += 1;
      y = drawEmailedQuoteContinuationHeader(page, quote, version, site);
      y = drawEmailedQuoteTableHeader(page, y, site);
    }

    y = drawEmailedQuoteLineItem(page, y, item);
  }

  if (Number(quote.fees_subtotal) > 0) {
    if (y < 250) {
      drawEmailedQuoteFooter(page, pageNumber);
      page = pdf.addPage();
      pageNumber += 1;
      y = drawEmailedQuoteContinuationHeader(page, quote, version, site);
      y = drawEmailedQuoteTableHeader(page, y, site);
    }

    y = drawEmailedQuoteFeeRows(page, y, quote, pricingConfig, activeBranding);
  }

  if (y < 335) {
    drawEmailedQuoteFooter(page, pageNumber);
    page = pdf.addPage();
    pageNumber += 1;
    y = drawEmailedQuoteContinuationHeader(page, quote, version, site);
  }

  y = drawEmailedQuoteClosing(page, y, quote, activeBranding, quoteUrl);
  y = drawEmailedQuoteJobDetails(page, y, quote, site, customer);
  drawEmailedQuoteDisclaimer(page, y, activeBranding);
  drawEmailedQuoteFooter(page, pageNumber);

  return pdf.render();
}

function drawEmailedQuoteHeader({
  page,
  quote,
  customer,
  site,
  owner,
  branding,
  logo,
  quoteUrl,
}: {
  page: PdfPage;
  quote: QuoteSnapshotRecord;
  customer:
    | {
        name: string;
        contact_name: string | null;
        email: string | null;
        phone: string | null;
      }
    | null;
  site:
    | {
        name: string;
        city: string;
        county: string;
        state: string;
        address: Record<string, unknown>;
      }
    | null;
  owner: { full_name: string; email: string } | null;
  branding: QuoteBrandingConfig;
  logo: PdfImageRef | null;
  quoteUrl: string | null;
}
): number {
  drawBrandLogo(page, 44, 730, branding, logo);
  page.text({
    value: "Quote",
    x: 568,
    y: 746,
    size: 20,
    color: "#7a7d80",
    align: "right",
  });

  page.text({ value: branding.company_name, x: 44, y: 680, size: 10, bold: true });
  getBrandAddressLines(branding).forEach((line, index) => {
    if (!line) {
      return;
    }

    page.text({ value: line, x: 44, y: 666 - index * 12, size: 9, color: "#000000" });
  });

  drawQuoteMetadataBox(page, 426, 666, [
    ["Quote #", quote.quote_number],
    ["Date", formatDate(quote.quote_date)],
    ["Expires", formatDate(quote.expires_at)],
    ["Contact", owner?.full_name ?? branding.company_name],
  ]);
  drawAcceptQuoteButton(page, quoteUrl, 426, 572);

  page.text({ value: "Prepared for", x: 44, y: 542, size: 9, bold: true });
  [
    customer?.name,
    customer?.contact_name,
    getAddressLine(site),
    ".",
    getCityStateZip(site),
    "United States",
    "",
    customer?.phone ? `Phone: ${customer.phone}` : null,
    customer?.email ? `Email: ${customer.email}` : null,
  ].forEach((line, index) => {
    if (!line) {
      return;
    }

    page.text({ value: truncate(line, 44), x: 130, y: 542 - index * 12, size: 9 });
  });

  return 394;
}

function drawEmailedQuoteContinuationHeader(
  page: PdfPage,
  quote: QuoteSnapshotRecord,
  version: number,
  site:
    | {
        name: string;
        city: string;
        county: string;
        state: string;
        address: Record<string, unknown>;
      }
    | null,
): number {
  page.text({
    value: getSiteHeading(site),
    x: 44,
    y: 748,
    size: 21,
    color: "#000000",
    bold: true,
  });
  page.text({
    value: `${quote.quote_number} - v${version}`,
    x: 568,
    y: 748,
    size: 8,
    color: "#7a7d80",
    align: "right",
  });

  return 710;
}

function drawEmailedQuoteTableHeader(
  page: PdfPage,
  y: number,
  site:
    | {
        name: string;
        city: string;
        county: string;
        state: string;
        address: Record<string, unknown>;
      }
    | null,
): number {
  page.text({
    value: getSiteHeading(site),
    x: 44,
    y,
    size: 21,
    color: "#000000",
    bold: true,
  });
  page.line(44, y - 18, 568, y - 18, "#000000", 1.2);
  page.text({ value: "Type", x: 48, y: y - 34, size: 8.5, bold: true });
  page.text({ value: "Description", x: 112, y: y - 34, size: 8.5, bold: true });
  page.text({ value: "Quantity", x: 434, y: y - 34, size: 8.5, bold: true, align: "right" });
  page.text({ value: "Price", x: 500, y: y - 34, size: 8.5, bold: true, align: "right" });
  page.text({ value: "Total", x: 568, y: y - 34, size: 8.5, bold: true, align: "right" });
  page.line(44, y - 44, 568, y - 44, "#000000", 0.8);

  return y - 60;
}

function drawEmailedQuoteLineItem(
  page: PdfPage,
  y: number,
  item: QuoteSnapshotItemRecord,
): number {
  const material = relationOne(item.materials);
  const loads = Math.max(1, Number(item.load_count) || 1);
  const itemSubtotal = Number(item.material_subtotal) + Number(item.trucking_subtotal);
  const pricePerLoad = itemSubtotal / loads;
  const description = `${material?.name ?? "Material"} ${formatQuantity(
    Number(item.quantity),
  )} ${item.unit} (${loads} load${loads === 1 ? "" : "s"})`;

  page.text({ value: "Sand & Gravel", x: 48, y, size: 8.5 });
  page.text({ value: truncate(description, 52), x: 112, y, size: 8.5, bold: true });
  page.text({ value: String(loads), x: 434, y, size: 8.5, align: "right" });
  page.text({
    value: formatCurrency(pricePerLoad),
    x: 500,
    y,
    size: 8.5,
    align: "right",
  });
  page.text({
    value: formatCurrency(itemSubtotal),
    x: 568,
    y,
    size: 8.5,
    bold: true,
    align: "right",
  });
  page.text({
    value: "Your Unit Price Includes the Materials, Tax and Delivery",
    x: 112,
    y: y - 22,
    size: 8.5,
    bold: true,
  });

  return y - 50;
}

function drawEmailedQuoteFeeRows(
  page: PdfPage,
  y: number,
  quote: QuoteSnapshotRecord,
  pricingConfig: QuoteDocumentPricingConfig | null,
  branding: QuoteBrandingConfig,
): number {
  const loads = Math.max(
    1,
    (quote.quote_items ?? []).reduce((sum, item) => sum + Number(item.load_count || 0), 0),
  );
  const total = Number(quote.fees_subtotal);
  const configuredRows =
    pricingConfig === null
      ? []
      : [
          {
            label: "Environmental Fee Per Load",
            perLoad: Number(pricingConfig.environmental_fee_per_load),
          },
          {
            label: "Per Load Fuel Surcharge",
            perLoad: Number(pricingConfig.fuel_surcharge_per_load),
          },
        ].filter((row) => row.perLoad > 0);
  const configuredTotal = configuredRows.reduce(
    (sum, row) => sum + row.perLoad * loads,
    0,
  );
  const rows =
    configuredRows.length > 0 && configuredTotal <= total + 0.01
      ? [
          ...configuredRows.map((row) => ({
            ...row,
            total: row.perLoad * loads,
          })),
          ...(total - configuredTotal > 0.01
            ? [
                {
                  label: "Payment Processing Surcharge",
                  perLoad: (total - configuredTotal) / loads,
                  total: total - configuredTotal,
                },
              ]
            : []),
        ]
      : [
          {
            label: "Fees and Surcharges Per Load",
            perLoad: total / loads,
            total,
          },
        ];

  rows.forEach((row, index) => {
    const rowY = y - index * 36;

    page.text({
      value: truncate(branding.company_name, 18),
      x: 48,
      y: rowY,
      size: 8.5,
    });
    page.text({ value: row.label, x: 112, y: rowY, size: 8.5, bold: true });
    page.text({ value: String(loads), x: 434, y: rowY, size: 8.5, align: "right" });
    page.text({
      value: formatCurrency(row.perLoad),
      x: 500,
      y: rowY,
      size: 8.5,
      align: "right",
    });
    page.text({
      value: formatCurrency(row.total),
      x: 568,
      y: rowY,
      size: 8.5,
      bold: true,
      align: "right",
    });
  });

  return y - rows.length * 36 - 12;
}

function drawEmailedQuoteClosing(
  page: PdfPage,
  y: number,
  quote: QuoteSnapshotRecord,
  branding: QuoteBrandingConfig,
  quoteUrl: string | null,
): number {
  page.line(44, y + 8, 568, y + 8, "#000000", 0.8);
  const paragraph =
    branding.footer_note ??
    `Thank you for contacting ${branding.company_name} for your Sand and Gravel needs. Please contact us if you would like to schedule a delivery or if you have any questions. Have a wonderful day.`;

  drawPdfParagraph({
    page,
    value: paragraph,
    x: 48,
    y: y - 10,
    maxChars: 70,
    lineHeight: 11,
    size: 8.3,
    color: "#000000",
  });

  page.line(472, y - 2, 568, y - 2, "#000000", 0.8);
  page.text({ value: "Total", x: 444, y: y - 20, size: 9.5, bold: true, align: "right" });
  page.text({
    value: `${formatCurrency(Number(quote.total))} USD`,
    x: 568,
    y: y - 20,
    size: 9.5,
    bold: true,
    align: "right",
  });
  page.line(472, y - 32, 568, y - 32, "#000000", 0.8);

  if (quoteUrl) {
    drawAcceptQuoteButton(page, quoteUrl, 426, y - 78);
  }

  return y - 146;
}

function drawAcceptQuoteButton(
  page: PdfPage,
  quoteUrl: string | null,
  x: number,
  y: number,
): void {
  if (!quoteUrl) {
    return;
  }

  const width = 142;
  const height = 22;

  page.rect(x, y, width, height, "#0f9d58");
  page.text({
    value: "ACCEPT QUOTE",
    x: x + width / 2,
    y: y + 7,
    size: 8.2,
    color: "#ffffff",
    bold: true,
    align: "center",
  });
  page.link(quoteUrl, x, y, width, height);
}

function drawEmailedQuoteJobDetails(
  page: PdfPage,
  y: number,
  quote: QuoteSnapshotRecord,
  site:
    | {
        name: string;
        city: string;
        county: string;
        state: string;
        address: Record<string, unknown>;
      }
    | null,
  customer:
    | {
        name: string;
        contact_name: string | null;
        email: string | null;
        phone: string | null;
      }
    | null,
): number {
  page.text({ value: "Job Address:", x: 48, y, size: 8.5, bold: true });
  page.text({ value: getAddressLine(site), x: 48, y: y - 12, size: 8.5 });
  page.text({
    value: "Estimated Start Date: To be scheduled",
    x: 48,
    y: y - 28,
    size: 8.5,
    bold: true,
  });
  page.text({
    value: customer?.phone ? `Cell Phone: ${customer.phone}` : "Cell Phone: .",
    x: 48,
    y: y - 44,
    size: 8.5,
    bold: true,
  });

  return y - 86;
}

function drawEmailedQuoteDisclaimer(
  page: PdfPage,
  y: number,
  branding: QuoteBrandingConfig,
): void {
  drawPdfParagraph({
    page,
    value: `Disclaimer: ${branding.disclaimer}`,
    x: 48,
    y,
    maxWidth: 520,
    lineHeight: 9,
    size: 7.3,
    color: "#000000",
    maxLines: 14,
  });
}

function drawEmailedQuoteFooter(page: PdfPage, pageNumber: number): void {
  page.text({
    value: `Page ${pageNumber}`,
    x: 568,
    y: 34,
    size: 8,
    color: "#53645c",
    align: "right",
  });
}

function drawBrandLogo(
  page: PdfPage,
  x: number,
  y: number,
  branding: QuoteBrandingConfig,
  logo: PdfImageRef | null,
): void {
  if (logo) {
    const maxWidth = 178;
    const maxHeight = 46;
    const scale = Math.min(maxWidth / logo.width, maxHeight / logo.height, 1);
    const width = logo.width * scale;
    const height = logo.height * scale;

    page.image(logo, x, y - height + 8, width, height);
    return;
  }

  page.text({
    value: truncate(branding.company_name.toUpperCase(), 28),
    x,
    y,
    size: 13,
    color: "#164a9b",
    bold: true,
  });
  page.text({
    value: "SAND & GRAVEL",
    x,
    y: y - 16,
    size: 6,
    color: "#164a9b",
    bold: true,
  });
}

function drawQuoteMetadataBox(page: PdfPage, x: number, y: number, rows: string[][]): void {
  rows.forEach(([label, value], index) => {
    const rowY = y - index * 24;

    page.rect(x, rowY - 20, 142, 22, index % 2 === 0 ? "#d8d8d8" : "#eeeeee");
    page.text({ value: label, x: x + 6, y: rowY - 12, size: 8.8, bold: true });
    page.text({
      value: truncate(value, 20),
      x: x + 136,
      y: rowY - 12,
      size: 8.2,
      bold: true,
      align: "right",
    });
  });
}

function drawPdfParagraph({
  page,
  value,
  x,
  y,
  maxChars,
  maxWidth,
  lineHeight,
  size,
  color,
  maxLines,
  align = "left",
}: {
  page: PdfPage;
  value: string;
  x: number;
  y: number;
  maxChars?: number;
  maxWidth?: number;
  lineHeight: number;
  size: number;
  color: string;
  maxLines?: number;
  align?: "left" | "center" | "right";
}): number {
  const lines = (maxWidth
    ? wrapTextByWidth(value, maxWidth, size)
    : wrapText(value, maxChars ?? 80)
  ).slice(0, maxLines);

  lines.forEach((line, index) => {
    page.text({
      value: line,
      x,
      y: y - index * lineHeight,
      size,
      color,
      align,
    });
  });

  return y - lines.length * lineHeight;
}

function getSiteHeading(
  site:
    | {
        name: string;
        city: string;
        county: string;
        state: string;
        address: Record<string, unknown>;
      }
    | null,
): string {
  return site?.city || site?.name || "Job Site";
}

function getAddressLine(
  site:
    | {
        name: string;
        city: string;
        county: string;
        state: string;
        address: Record<string, unknown>;
      }
    | null,
): string {
  const line1 = typeof site?.address.line1 === "string" ? site.address.line1 : "";

  return line1 || site?.name || ".";
}

function getCityStateZip(
  site:
    | {
        name: string;
        city: string;
        county: string;
        state: string;
        address: Record<string, unknown>;
      }
    | null,
): string {
  const address = site?.address ?? {};
  const postalCode =
    typeof address.postal_code === "string"
      ? address.postal_code
      : typeof address.zip === "string"
        ? address.zip
        : "";
  const city = site?.city || (typeof address.city === "string" ? address.city : "");
  const state = site?.state || (typeof address.state === "string" ? address.state : "");
  const place = [city, state].filter(Boolean).join(", ");

  return [place, postalCode].filter(Boolean).join(" ") || ".";
}

function getBrandAddressLines(branding: QuoteBrandingConfig): string[] {
  return [
    branding.address_line1,
    branding.address_line2,
    [branding.city, branding.state, branding.postal_code].filter(Boolean).join(" "),
    branding.country,
    "",
    `Phone: ${branding.phone}`,
  ].filter((line): line is string => typeof line === "string");
}

function defaultQuoteBranding(): QuoteBrandingConfig {
  return {
    company_name: "QuoteBase",
    logo_url: null,
    address_line1: "",
    address_line2: null,
    city: "",
    state: "",
    postal_code: "",
    country: "United States",
    phone: "",
    footer_note: null,
    disclaimer:
      "All quotes are valid for 30 days. All materials quoted are subject to availability. This estimated price is subject to change at any time. All prices include material, tax and freight unless otherwise specified. Delivery minimums, standby time, returned materials, restocking, fuel, environmental, and other applicable charges follow the current approved quote configuration and customer terms. Once customer orders materials, and material are loaded into the truck at the plant, the customer owns the material and is responsible for the payment; FOB Shipping Point. All invoices are due according to approved payment terms. Late balances may be subject to service charges, collection costs, and attorney fees where permitted. Upon acceptance of this quote, buyer may be required to sign this quote, complete credit documentation, and provide preliminary lien notice information prior to the commencement of delivery.",
  };
}

async function loadPdfLogo(url: string): Promise<PdfImageInput | null> {
  try {
    const response = await fetch(url, { cache: "no-store" });

    if (!response.ok) {
      return null;
    }

    const buffer = Buffer.from(await response.arrayBuffer());
    const contentType = response.headers.get("content-type") ?? "";

    if (contentType.includes("jpeg") || contentType.includes("jpg") || isJpeg(buffer)) {
      return parseJpegImage(buffer);
    }

    if (contentType.includes("png") || isPng(buffer)) {
      return parsePngImage(buffer);
    }

    return null;
  } catch {
    return null;
  }
}

function parseJpegImage(buffer: Buffer): PdfImageInput | null {
  if (!isJpeg(buffer)) {
    return null;
  }

  let offset = 2;

  while (offset < buffer.length) {
    if (buffer[offset] !== 0xff) {
      return null;
    }

    const marker = buffer[offset + 1];
    const length = buffer.readUInt16BE(offset + 2);
    const isStartOfFrame =
      (marker >= 0xc0 && marker <= 0xc3) ||
      (marker >= 0xc5 && marker <= 0xc7) ||
      (marker >= 0xc9 && marker <= 0xcb) ||
      (marker >= 0xcd && marker <= 0xcf);

    if (isStartOfFrame) {
      return {
        width: buffer.readUInt16BE(offset + 7),
        height: buffer.readUInt16BE(offset + 5),
        data: buffer,
        filter: "DCTDecode",
      };
    }

    offset += 2 + length;
  }

  return null;
}

function parsePngImage(buffer: Buffer): PdfImageInput | null {
  if (!isPng(buffer)) {
    return null;
  }

  let offset = 8;
  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = 0;
  const idatChunks: Buffer[] = [];

  while (offset < buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.toString("ascii", offset + 4, offset + 8);
    const dataStart = offset + 8;
    const dataEnd = dataStart + length;

    if (type === "IHDR") {
      width = buffer.readUInt32BE(dataStart);
      height = buffer.readUInt32BE(dataStart + 4);
      bitDepth = buffer[dataStart + 8];
      colorType = buffer[dataStart + 9];
    } else if (type === "IDAT") {
      idatChunks.push(buffer.subarray(dataStart, dataEnd));
    } else if (type === "IEND") {
      break;
    }

    offset = dataEnd + 4;
  }

  const channels = getPngChannels(colorType);

  if (!width || !height || bitDepth !== 8 || !channels || idatChunks.length === 0) {
    return null;
  }

  const inflated = inflateSync(Buffer.concat(idatChunks));
  const bytesPerPixel = channels;
  const sourceStride = width * channels;
  const rgb = Buffer.alloc(width * height * 3);
  let sourceOffset = 0;
  let rgbOffset = 0;
  let previous = Buffer.alloc(sourceStride);

  for (let row = 0; row < height; row += 1) {
    const filter = inflated[sourceOffset];
    sourceOffset += 1;
    const current = Buffer.from(inflated.subarray(sourceOffset, sourceOffset + sourceStride));
    sourceOffset += sourceStride;
    unfilterPngRow(current, previous, filter, bytesPerPixel);

    for (let x = 0; x < width; x += 1) {
      const pixelOffset = x * channels;

      if (colorType === 0) {
        const gray = current[pixelOffset];
        rgb[rgbOffset++] = gray;
        rgb[rgbOffset++] = gray;
        rgb[rgbOffset++] = gray;
      } else if (colorType === 4) {
        const gray = blendOnWhite(current[pixelOffset], current[pixelOffset + 1]);
        rgb[rgbOffset++] = gray;
        rgb[rgbOffset++] = gray;
        rgb[rgbOffset++] = gray;
      } else {
        const alpha = colorType === 6 ? current[pixelOffset + 3] : 255;
        rgb[rgbOffset++] = blendOnWhite(current[pixelOffset], alpha);
        rgb[rgbOffset++] = blendOnWhite(current[pixelOffset + 1], alpha);
        rgb[rgbOffset++] = blendOnWhite(current[pixelOffset + 2], alpha);
      }
    }

    previous = current;
  }

  return {
    width,
    height,
    data: deflateSync(rgb),
    filter: "FlateDecode",
  };
}

function unfilterPngRow(
  row: Buffer,
  previous: Buffer,
  filter: number,
  bytesPerPixel: number,
): void {
  for (let index = 0; index < row.length; index += 1) {
    const left = index >= bytesPerPixel ? row[index - bytesPerPixel] : 0;
    const up = previous[index] ?? 0;
    const upLeft = index >= bytesPerPixel ? previous[index - bytesPerPixel] : 0;

    if (filter === 1) {
      row[index] = (row[index] + left) & 0xff;
    } else if (filter === 2) {
      row[index] = (row[index] + up) & 0xff;
    } else if (filter === 3) {
      row[index] = (row[index] + Math.floor((left + up) / 2)) & 0xff;
    } else if (filter === 4) {
      row[index] = (row[index] + paethPredictor(left, up, upLeft)) & 0xff;
    }
  }
}

function getPngChannels(colorType: number): number | null {
  if (colorType === 0) {
    return 1;
  }

  if (colorType === 2) {
    return 3;
  }

  if (colorType === 4) {
    return 2;
  }

  if (colorType === 6) {
    return 4;
  }

  return null;
}

function blendOnWhite(value: number, alpha: number): number {
  return Math.round((value * alpha + 255 * (255 - alpha)) / 255);
}

function paethPredictor(left: number, up: number, upLeft: number): number {
  const estimate = left + up - upLeft;
  const leftDistance = Math.abs(estimate - left);
  const upDistance = Math.abs(estimate - up);
  const upLeftDistance = Math.abs(estimate - upLeft);

  if (leftDistance <= upDistance && leftDistance <= upLeftDistance) {
    return left;
  }

  return upDistance <= upLeftDistance ? up : upLeft;
}

function isPng(buffer: Buffer): boolean {
  return buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
}

function isJpeg(buffer: Buffer): boolean {
  return buffer.length > 2 && buffer[0] === 0xff && buffer[1] === 0xd8;
}

function pdfObject(value: string): Buffer {
  return Buffer.from(value, "utf8");
}

function pdfStreamObject(dictionary: string, stream: Buffer): Buffer {
  return Buffer.concat([
    Buffer.from(`${dictionary}\nstream\n`, "binary"),
    stream,
    Buffer.from("\nendstream", "binary"),
  ]);
}

class PdfBuilder {
  private readonly pages: PdfPage[] = [];
  private readonly images: (PdfImageInput & PdfImageRef)[] = [];

  addPage(): PdfPage {
    const page = new PdfPage();

    this.pages.push(page);
    return page;
  }

  embedImage(image: PdfImageInput | null): PdfImageRef | null {
    if (!image) {
      return null;
    }

    const embeddedImage = {
      ...image,
      name: `Im${this.images.length + 1}`,
    };

    this.images.push(embeddedImage);
    return embeddedImage;
  }

  render(): Uint8Array {
    const pageLinks = this.pages.map((page) => page.links());
    const linkCount = pageLinks.reduce((total, links) => total + links.length, 0);
    const objectCount = 4 + this.images.length + linkCount + this.pages.length * 2;
    const imageObjectIds = this.images.map((_, index) => 5 + index);
    const linkStartObjectId = 5 + this.images.length;
    const pageLinkObjectIds = pageLinks.reduce<number[][]>((groups, links) => {
      const previousCount = groups.reduce((total, group) => total + group.length, 0);

      groups.push(links.map((_, index) => linkStartObjectId + previousCount + index));
      return groups;
    }, []);
    const pageStartObjectId = 5 + this.images.length + linkCount;
    const pageObjectIds = this.pages.map((_, index) => pageStartObjectId + index * 2);
    const contentObjectIds = this.pages.map((_, index) => pageStartObjectId + 1 + index * 2);
    const objects: Buffer[] = [
      pdfObject("<< /Type /Catalog /Pages 2 0 R >>"),
      pdfObject(`<< /Type /Pages /Kids [${pageObjectIds
        .map((id) => `${id} 0 R`)
        .join(" ")}] /Count ${this.pages.length} >>`),
      pdfObject("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>"),
      pdfObject("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>"),
      ...this.images.map((image) => pdfStreamObject(
        `<< /Type /XObject /Subtype /Image /Width ${image.width} /Height ${image.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /${image.filter} /Length ${image.data.length} >>`,
        image.data,
      )),
      ...pageLinks.flatMap((links) =>
        links.map((link) =>
          pdfObject(
            `<< /Type /Annot /Subtype /Link /Rect [${link.x.toFixed(2)} ${link.y.toFixed(2)} ${(link.x + link.width).toFixed(2)} ${(link.y + link.height).toFixed(2)}] /Border [0 0 0] /A << /S /URI /URI (${escapePdf(link.url)}) >> >>`,
          ),
        ),
      ),
      ...this.pages.flatMap((page, index) => {
        const content = page.content();
        const annots = pageLinkObjectIds[index]?.length
          ? ` /Annots [${pageLinkObjectIds[index].map((id) => `${id} 0 R`).join(" ")}]`
          : "";
        const xObjects = this.images
          .map((image, imageIndex) => `/${image.name} ${imageObjectIds[imageIndex]} 0 R`)
          .join(" ");

        return [
          pdfObject(
            `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R /F2 4 0 R >>${xObjects ? ` /XObject << ${xObjects} >>` : ""} >>${annots} /Contents ${contentObjectIds[index]} 0 R >>`,
          ),
          pdfStreamObject(
            `<< /Length ${Buffer.byteLength(content, "utf8")} >>`,
            Buffer.from(content, "utf8"),
          ),
        ];
      }),
    ];

    const chunks: Buffer[] = [Buffer.from("%PDF-1.4\n", "binary")];
    const offsets = [0];
    let byteLength = chunks[0].length;

    objects.forEach((object, index) => {
      offsets.push(byteLength);
      const objectHeader = Buffer.from(`${index + 1} 0 obj\n`, "binary");
      const objectFooter = Buffer.from("\nendobj\n", "binary");

      chunks.push(objectHeader, object, objectFooter);
      byteLength += objectHeader.length + object.length + objectFooter.length;
    });

    const xrefOffset = byteLength;
    const xref = `xref\n0 ${objectCount + 1}\n0000000000 65535 f \n${offsets
      .slice(1)
      .map((offset) => `${String(offset).padStart(10, "0")} 00000 n \n`)
      .join("")}trailer\n<< /Size ${objectCount + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
    chunks.push(Buffer.from(xref, "binary"));

    return new Uint8Array(Buffer.concat(chunks));
  }
}

class PdfPage {
  private readonly commands: string[] = [];
  private readonly pageLinks: PdfLink[] = [];

  content(): string {
    return this.commands.join("\n");
  }

  links(): PdfLink[] {
    return this.pageLinks;
  }

  rect(
    x: number,
    y: number,
    width: number,
    height: number,
    fill: string,
    stroke?: string,
  ): void {
    this.commands.push(`${rgb(fill)} rg`);

    if (stroke) {
      this.commands.push(`${rgb(stroke)} RG`);
      this.commands.push(`${x} ${y} ${width} ${height} re B`);
      return;
    }

    this.commands.push(`${x} ${y} ${width} ${height} re f`);
  }

  line(
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    color = "#d8dee8",
    width = 1,
  ): void {
    this.commands.push(`${rgb(color)} RG`);
    this.commands.push(`${width} w`);
    this.commands.push(`${x1} ${y1} m ${x2} ${y2} l S`);
  }

  image(image: PdfImageRef, x: number, y: number, width: number, height: number): void {
    this.commands.push(
      `q ${width.toFixed(2)} 0 0 ${height.toFixed(2)} ${x.toFixed(2)} ${y.toFixed(2)} cm /${image.name} Do Q`,
    );
  }

  link(url: string, x: number, y: number, width: number, height: number): void {
    this.pageLinks.push({ url, x, y, width, height });
  }

  text({
    value,
    x,
    y,
    size,
    color = "#172033",
    bold = false,
    align = "left",
  }: {
    value: string;
    x: number;
    y: number;
    size: number;
    color?: string;
    bold?: boolean;
    align?: "left" | "center" | "right";
  }): void {
    const textX =
      align === "right"
        ? x - approximateTextWidth(value, size, bold)
        : align === "center"
          ? x - approximateTextWidth(value, size, bold) / 2
          : x;

    this.commands.push(`${rgb(color)} rg`);
    this.commands.push(
      `BT /${bold ? "F2" : "F1"} ${size} Tf ${textX.toFixed(2)} ${y.toFixed(
        2,
      )} Td (${escapePdf(value)}) Tj ET`,
    );
  }
}

function rgb(hex: string): string {
  const normalized = hex.replace("#", "");
  const red = Number.parseInt(normalized.slice(0, 2), 16) / 255;
  const green = Number.parseInt(normalized.slice(2, 4), 16) / 255;
  const blue = Number.parseInt(normalized.slice(4, 6), 16) / 255;

  return `${red.toFixed(3)} ${green.toFixed(3)} ${blue.toFixed(3)}`;
}

function approximateTextWidth(
  value: string,
  size: number,
  bold = false,
): number {
  return value.length * size * (bold ? 0.56 : 0.52);
}

function wrapText(value: string, maxChars: number): string[] {
  const words = value.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = "";

  words.forEach((word) => {
    const next = current ? `${current} ${word}` : word;

    if (next.length > maxChars && current) {
      lines.push(current);
      current = word;
      return;
    }

    current = next;
  });

  if (current) {
    lines.push(current);
  }

  return lines.length ? lines : [""];
}

function wrapTextByWidth(value: string, maxWidth: number, size: number): string[] {
  const words = value.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = "";

  words.forEach((word) => {
    const next = current ? `${current} ${word}` : word;

    if (approximateTextWidth(next, size) > maxWidth && current) {
      lines.push(current);
      current = word;
      return;
    }

    current = next;
  });

  if (current) {
    lines.push(current);
  }

  return lines.length ? lines : [""];
}

function truncate(value: string, maxLength: number): string {
  return value.length > maxLength ? `${value.slice(0, maxLength - 1)}...` : value;
}

function formatQuantity(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(2);
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
  const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(value);

  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: dateOnly ? "UTC" : undefined,
  }).format(new Date(dateOnly ? `${value}T00:00:00.000Z` : value));
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

function escapePdf(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/\(/g, "\\(")
    .replace(/\)/g, "\\)")
    .replace(/[^\x20-\x7E]/g, "");
}

function relationOne<T>(value: T | T[] | null): T | null {
  return Array.isArray(value) ? (value[0] ?? null) : value;
}
