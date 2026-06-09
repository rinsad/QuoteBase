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

export async function createQuotePdfDocument({
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
  const storagePath = `${user.organization_id}/${quote.id}/v${version}-${quote.quote_number}.pdf`;
  const pdf = renderQuotePdf(quote, version);
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

function renderQuotePdf(quote: QuoteSnapshotRecord, version: number): Uint8Array {
  const customer = relationOne(quote.customers);
  const site = relationOne(quote.job_sites);
  const owner = relationOne(quote.users);
  const pdf = new PdfBuilder();
  let page = pdf.addPage();
  let y = drawQuotePdfHeader({
    page,
    quote,
    version,
    customerName: customer?.name ?? "Unknown customer",
  });

  y = drawInfoPanels({
    page,
    y,
    customer: {
      title: customer?.name ?? "Unknown customer",
      lines: [
        customer?.contact_name,
        customer?.email,
        customer?.phone,
      ].filter(isPresent),
    },
    site: {
      title: site?.name ?? "Unknown site",
      lines: [
        formatAddress(site?.address ?? {}),
        [site?.city, site?.state].filter(isPresent).join(", "),
        site?.county ? `${site.county} County` : null,
      ].filter(isPresent),
    },
    owner: {
      title: owner?.full_name ?? "QuoteBase",
      lines: [owner?.email, `Prepared ${formatDate(new Date().toISOString())}`].filter(
        isPresent,
      ),
    },
  });

  y = drawQuotePdfTableHeader(page, y);

  for (const item of quote.quote_items ?? []) {
    if (y < 158) {
      drawQuotePdfFooter(page, quote, version);
      page = pdf.addPage();
      y = drawQuotePdfContinuationHeader(page, quote, version);
      y = drawQuotePdfTableHeader(page, y);
    }

    const material = relationOne(item.materials);
    const supplier = relationOne(item.suppliers);
    const vehicle = relationOne(item.vehicle_types);
    const description = [
      material?.name ?? "Unknown material",
      material?.tier ? `Tier ${material.tier}` : null,
      supplier?.name ? `Plant: ${supplier.name}` : null,
    ]
      .filter(isPresent)
      .join(" - ");
    const loadPlan = `${Number(item.load_count).toFixed(0)} load${
      Number(item.load_count) === 1 ? "" : "s"
    }${vehicle?.name ? ` via ${vehicle.name}` : ""}`;

    y = drawQuotePdfTableRow(page, y, {
      description,
      quantity: `${formatQuantity(Number(item.quantity))} ${item.unit}`,
      loads: loadPlan,
      total: formatCurrency(Number(item.line_total)),
    });
  }

  if (y < 250) {
    drawQuotePdfFooter(page, quote, version);
    page = pdf.addPage();
    y = drawQuotePdfContinuationHeader(page, quote, version);
  }

  y = drawTotalsBox(page, y - 20, quote);
  drawTerms(page, y - 26, quote);
  drawQuotePdfFooter(page, quote, version);

  return pdf.render();
}

type PdfRow = {
  description: string;
  quantity: string;
  loads: string;
  total: string;
};

type PdfInfoPanel = {
  title: string;
  lines: string[];
};

class PdfBuilder {
  private readonly pages: PdfPage[] = [];

  addPage(): PdfPage {
    const page = new PdfPage();

    this.pages.push(page);
    return page;
  }

  render(): Uint8Array {
    const objectCount = 4 + this.pages.length * 2;
    const pageObjectIds = this.pages.map((_, index) => 5 + index * 2);
    const contentObjectIds = this.pages.map((_, index) => 6 + index * 2);
    const objects = [
      "<< /Type /Catalog /Pages 2 0 R >>",
      `<< /Type /Pages /Kids [${pageObjectIds
        .map((id) => `${id} 0 R`)
        .join(" ")}] /Count ${this.pages.length} >>`,
      "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
      "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>",
      ...this.pages.flatMap((page, index) => {
        const content = page.content();

        return [
          `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${contentObjectIds[index]} 0 R >>`,
          `<< /Length ${Buffer.byteLength(content, "utf8")} >>\nstream\n${content}\nendstream`,
        ];
      }),
    ];

    let pdf = "%PDF-1.4\n";
    const offsets = [0];

    objects.forEach((object, index) => {
      offsets.push(Buffer.byteLength(pdf, "utf8"));
      pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
    });

    const xrefOffset = Buffer.byteLength(pdf, "utf8");
    pdf += `xref\n0 ${objectCount + 1}\n0000000000 65535 f \n`;
    pdf += offsets
      .slice(1)
      .map((offset) => `${String(offset).padStart(10, "0")} 00000 n \n`)
      .join("");
    pdf += `trailer\n<< /Size ${objectCount + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;

    return new Uint8Array(Buffer.from(pdf, "utf8"));
  }
}

class PdfPage {
  private readonly commands: string[] = [];

  content(): string {
    return this.commands.join("\n");
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
    align?: "left" | "right";
  }): void {
    const textX =
      align === "right" ? x - approximateTextWidth(value, size, bold) : x;

    this.commands.push(`${rgb(color)} rg`);
    this.commands.push(
      `BT /${bold ? "F2" : "F1"} ${size} Tf ${textX.toFixed(2)} ${y.toFixed(
        2,
      )} Td (${escapePdf(value)}) Tj ET`,
    );
  }
}

function drawQuotePdfHeader({
  page,
  quote,
  version,
  customerName,
}: {
  page: PdfPage;
  quote: QuoteSnapshotRecord;
  version: number;
  customerName: string;
}): number {
  page.rect(0, 704, 612, 88, "#17345f");
  page.rect(0, 704, 612, 7, "#d69e2e");
  page.rect(44, 724, 44, 44, "#f8fafc");
  page.text({ value: "QB", x: 53, y: 741, size: 15, color: "#17345f", bold: true });
  page.text({
    value: "Western Materials",
    x: 104,
    y: 754,
    size: 11,
    color: "#dbeafe",
    bold: true,
  });
  page.text({
    value: "Customer Quote",
    x: 104,
    y: 730,
    size: 26,
    color: "#ffffff",
    bold: true,
  });
  page.text({
    value: quote.quote_number,
    x: 568,
    y: 754,
    size: 12,
    color: "#ffffff",
    bold: true,
    align: "right",
  });
  page.text({
    value: `Version ${version} - ${formatDate(quote.created_at)}`,
    x: 568,
    y: 733,
    size: 9,
    color: "#bfdbfe",
    align: "right",
  });
  page.rect(44, 664, 524, 26, "#fff7ed", "#fed7aa");
  page.text({
    value: `Prepared for ${customerName}`,
    x: 58,
    y: 672,
    size: 11,
    color: "#7c4a03",
    bold: true,
  });

  return 632;
}

function drawQuotePdfContinuationHeader(
  page: PdfPage,
  quote: QuoteSnapshotRecord,
  version: number,
): number {
  page.rect(0, 742, 612, 50, "#17345f");
  page.rect(0, 742, 612, 6, "#d69e2e");
  page.text({
    value: "Western Materials",
    x: 44,
    y: 763,
    size: 12,
    color: "#ffffff",
    bold: true,
  });
  page.text({
    value: `${quote.quote_number} - Version ${version}`,
    x: 568,
    y: 763,
    size: 10,
    color: "#dbeafe",
    align: "right",
  });

  return 710;
}

function drawInfoPanels({
  page,
  y,
  customer,
  site,
  owner,
}: {
  page: PdfPage;
  y: number;
  customer: PdfInfoPanel;
  site: PdfInfoPanel;
  owner: PdfInfoPanel;
}): number {
  drawInfoPanel(page, 44, y, 160, "Bill To", customer);
  drawInfoPanel(page, 224, y, 160, "Deliver To", site);
  drawInfoPanel(page, 404, y, 164, "Prepared By", owner);

  return y - 116;
}

function drawInfoPanel(
  page: PdfPage,
  x: number,
  y: number,
  width: number,
  label: string,
  panel: PdfInfoPanel,
): void {
  page.rect(x, y - 94, width, 94, "#ffffff", "#d8dee8");
  page.text({
    value: label.toUpperCase(),
    x: x + 14,
    y: y - 22,
    size: 8,
    color: "#64748b",
    bold: true,
  });
  page.text({
    value: truncate(panel.title, 24),
    x: x + 14,
    y: y - 42,
    size: 11,
    color: "#172033",
    bold: true,
  });
  panel.lines.slice(0, 3).forEach((line, index) => {
    page.text({
      value: truncate(line, 28),
      x: x + 14,
      y: y - 60 - index * 14,
      size: 8.5,
      color: "#526173",
    });
  });
}

function drawQuotePdfTableHeader(page: PdfPage, y: number): number {
  page.text({
    value: "Quoted Materials",
    x: 44,
    y,
    size: 16,
    color: "#172033",
    bold: true,
  });
  page.rect(44, y - 34, 524, 24, "#17345f");
  page.text({ value: "Description", x: 56, y: y - 26, size: 8, color: "#ffffff", bold: true });
  page.text({ value: "Quantity", x: 342, y: y - 26, size: 8, color: "#ffffff", bold: true });
  page.text({ value: "Truck Plan", x: 414, y: y - 26, size: 8, color: "#ffffff", bold: true });
  page.text({
    value: "Line Total",
    x: 556,
    y: y - 26,
    size: 8,
    color: "#ffffff",
    bold: true,
    align: "right",
  });

  return y - 54;
}

function drawQuotePdfTableRow(page: PdfPage, y: number, row: PdfRow): number {
  const wrapped = wrapText(row.description, 48);
  const height = Math.max(38, wrapped.length * 12 + 18);

  page.rect(44, y - height + 8, 524, height, "#ffffff", "#e2e8f0");
  wrapped.slice(0, 3).forEach((line, index) => {
    page.text({
      value: line,
      x: 56,
      y: y - 8 - index * 12,
      size: index === 0 ? 9.5 : 8,
      color: index === 0 ? "#172033" : "#64748b",
      bold: index === 0,
    });
  });
  page.text({ value: row.quantity, x: 342, y: y - 10, size: 8.5, color: "#172033" });
  page.text({ value: truncate(row.loads, 19), x: 414, y: y - 10, size: 8.5, color: "#172033" });
  page.text({
    value: row.total,
    x: 556,
    y: y - 10,
    size: 9,
    color: "#172033",
    bold: true,
    align: "right",
  });

  return y - height - 6;
}

function drawTotalsBox(
  page: PdfPage,
  y: number,
  quote: QuoteSnapshotRecord,
): number {
  const x = 332;
  const width = 236;

  page.rect(x, y - 154, width, 154, "#f8fafc", "#d8dee8");
  page.text({ value: "Quote Summary", x: x + 16, y: y - 24, size: 12, bold: true });
  drawTotalLine(page, x + 16, y - 48, "Material", quote.material_subtotal);
  drawTotalLine(page, x + 16, y - 70, "Trucking", quote.trucking_subtotal);
  drawTotalLine(page, x + 16, y - 92, "Fees", quote.fees_subtotal);
  drawTotalLine(page, x + 16, y - 114, "Tax", quote.tax_total);
  page.line(x + 16, y - 126, x + width - 16, y - 126, "#cbd5e1");
  page.text({ value: "Total", x: x + 16, y: y - 144, size: 12, bold: true });
  page.text({
    value: formatCurrency(Number(quote.total)),
    x: x + width - 16,
    y: y - 144,
    size: 13,
    color: "#17345f",
    bold: true,
    align: "right",
  });

  return y - 154;
}

function drawTotalLine(
  page: PdfPage,
  x: number,
  y: number,
  label: string,
  value: number,
): void {
  page.text({ value: label, x, y, size: 9, color: "#526173" });
  page.text({
    value: formatCurrency(Number(value)),
    x: x + 188,
    y,
    size: 9,
    color: "#172033",
    bold: true,
    align: "right",
  });
}

function drawTerms(page: PdfPage, y: number, quote: QuoteSnapshotRecord): void {
  const terms =
    quote.notes ??
    "Pricing is subject to material availability, trucking availability, and final job-site conditions. Taxes and fees are calculated from the current quote configuration. QuoteBase generated this document from the approved quote record.";
  const lines = wrapText(terms, 76).slice(0, 5);

  page.text({ value: "Notes and Terms", x: 44, y, size: 12, bold: true });
  lines.forEach((line, index) => {
    page.text({
      value: line,
      x: 44,
      y: y - 18 - index * 12,
      size: 8.5,
      color: "#526173",
    });
  });
}

function drawQuotePdfFooter(
  page: PdfPage,
  quote: QuoteSnapshotRecord,
  version: number,
): void {
  page.line(44, 54, 568, 54, "#d8dee8");
  page.text({
    value: "Western Materials - QuoteBase",
    x: 44,
    y: 34,
    size: 8,
    color: "#64748b",
    bold: true,
  });
  page.text({
    value: `${quote.quote_number} - v${version}`,
    x: 568,
    y: 34,
    size: 8,
    color: "#64748b",
    align: "right",
  });
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

function truncate(value: string, maxLength: number): string {
  return value.length > maxLength ? `${value.slice(0, maxLength - 1)}...` : value;
}

function formatQuantity(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(2);
}

function isPresent(value: string | null | undefined): value is string {
  return typeof value === "string" && value.trim().length > 0;
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
