import type {
  TextItem,
  TextMarkedContent,
} from "pdfjs-dist/types/src/display/api";

export type SupplierDocumentExtraction = {
  parserId: string;
  parserName: string;
  headers: string[];
  rows: SupplierDocumentRow[];
  metadata: Record<string, string>;
  warnings: string[];
};

export type SupplierDocumentRow = Record<string, string>;

type PositionedText = {
  text: string;
  x: number;
  y: number;
};

const MAX_PDF_PAGES = 10;

export async function extractSupplierDocument({
  fileName,
  mimeType,
  data,
  maxRows,
}: {
  fileName: string;
  mimeType: string;
  data: ArrayBuffer;
  maxRows: number;
}): Promise<SupplierDocumentExtraction> {
  if (isPdf(fileName, mimeType)) {
    return extractPdfDocument({ data, maxRows });
  }

  if (isCsv(fileName, mimeType)) {
    return extractCsvDocument({
      text: new TextDecoder().decode(data),
      maxRows,
    });
  }

  if (isExcel(fileName, mimeType)) {
    return extractExcelDocument({ data, maxRows });
  }

  throw new Error("Unsupported supplier file type. Upload a PDF, CSV, or Excel file.");
}

function extractCsvDocument({
  text,
  maxRows,
}: {
  text: string;
  maxRows: number;
}): SupplierDocumentExtraction {
  const parsed = parseDelimitedText(text, maxRows);

  return {
    parserId: "generic-csv-v1",
    parserName: "Generic CSV",
    headers: parsed.headers,
    rows: parsed.rows,
    metadata: {},
    warnings: [],
  };
}

async function extractExcelDocument({
  data,
  maxRows,
}: {
  data: ArrayBuffer;
  maxRows: number;
}): Promise<SupplierDocumentExtraction> {
  const XLSX = await import("xlsx");
  const workbook = XLSX.read(Buffer.from(data), { type: "buffer" });
  const firstSheetName = workbook.SheetNames[0];

  if (!firstSheetName) {
    throw new Error("Excel workbook does not contain any sheets.");
  }

  const worksheet = workbook.Sheets[firstSheetName];
  const rows = XLSX.utils.sheet_to_json<Array<string | number | boolean | null>>(
    worksheet,
    {
      header: 1,
      defval: "",
      blankrows: false,
    },
  );

  if (rows.length < 2) {
    throw new Error("Excel file must include a header row and at least one catalog row.");
  }

  if (rows.length > maxRows + 1) {
    throw new Error(`Supplier price book import is limited to ${maxRows} rows.`);
  }

  const headers = rows[0].map((cell) => normalizeHeader(String(cell)));
  const extractedRows = rows.slice(1).map((row) => {
    const record: SupplierDocumentRow = {};

    headers.forEach((header, index) => {
      if (header) {
        record[header] = cellToString(row[index]);
      }
    });

    return record;
  });

  return {
    parserId: "generic-excel-v1",
    parserName: "Generic Excel",
    headers: headers.filter(Boolean),
    rows: extractedRows,
    metadata: {
      sheet_name: firstSheetName,
    },
    warnings: [],
  };
}

async function extractPdfDocument({
  data,
  maxRows,
}: {
  data: ArrayBuffer;
  maxRows: number;
}): Promise<SupplierDocumentExtraction> {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const document = await pdfjs.getDocument({
    data: new Uint8Array(data),
  }).promise;
  const pages: PositionedText[][] = [];
  const pageCount = Math.min(document.numPages, MAX_PDF_PAGES);

  for (let pageNumber = 1; pageNumber <= pageCount; pageNumber += 1) {
    const page = await document.getPage(pageNumber);
    const content = await page.getTextContent();

    pages.push(
      content.items
        .filter(isTextItem)
        .map((item) => ({
          text: item.str.trim(),
          x: item.transform[4],
          y: item.transform[5],
        }))
        .filter((item) => item.text),
    );
  }

  const allText = pages.flat().map((item) => item.text).join("\n");

  if (isHiGradeAggregateQuote(allText)) {
    return extractHiGradeAggregateQuote({ page: pages[0] ?? [], maxRows });
  }

  throw new Error(
    "No parser matched this PDF yet. Add a supplier PDF parser before importing it.",
  );
}

function extractHiGradeAggregateQuote({
  page,
  maxRows,
}: {
  page: PositionedText[];
  maxRows: number;
}): SupplierDocumentExtraction {
  const rowGroups = groupTableRows(
    page.filter((item) => item.y >= 430 && item.y <= 555),
  );
  const rows = rowGroups
    .map(readHiGradeRow)
    .filter((row): row is SupplierDocumentRow => row !== null)
    .slice(0, maxRows);
  const metadata = readHiGradeMetadata(page);

  if (!rows.length) {
    throw new Error("No material rows were found in the Hi-Grade PDF.");
  }

  return {
    parserId: "hi-grade-aggregate-quote-v1",
    parserName: "Hi-Grade aggregate quote",
    headers: [
      "material",
      "uom",
      "mat_price",
      "per_ton",
      "surcharge_per_load",
      "source_plant",
      "quote_number",
      "effective_through",
      "supplier_document_parser",
    ],
    rows: rows.map((row) => ({
      ...row,
      quote_number: metadata.quote_number ?? "",
      effective_through: metadata.effective_through ?? "",
      supplier_document_parser: "hi-grade-aggregate-quote-v1",
    })),
    metadata,
    warnings: [
      "This PDF does not include SKU values; imported catalog rows will use material descriptions.",
      "Review whether cost should use Mat. Price or PER TON before approving the catalog version.",
    ],
  };
}

function readHiGradeRow(items: PositionedText[]): SupplierDocumentRow | null {
  const material = textInRange(items, 45, 180);
  const matPrice = textInRange(items, 265, 305);
  const perTon = textInRange(items, 410, 450);

  if (!material || !moneyToNumber(matPrice)) {
    return null;
  }

  return {
    material,
    uom: "ton",
    mat_price: moneyToNumber(matPrice),
    per_ton: moneyToNumber(perTon),
    surcharge_per_load: moneyToNumber(textInRange(items, 355, 395)),
    source_plant: textInRange(items, 460, 520),
  };
}

function readHiGradeMetadata(page: PositionedText[]): Record<string, string> {
  const metadata: Record<string, string> = {
    supplier_name: "HI-GRADE MATERIALS CO.",
  };
  const quoteLabel = findNearText(page, "Quote #");
  const dateLabel = findNearText(page, "Date:");
  const termLabel = findNearText(page, "TERM DATE:");

  if (quoteLabel) {
    metadata.quote_number = textOnLine(page, quoteLabel.y, 450, 545);
  }

  if (dateLabel) {
    metadata.quote_date = textOnLine(page, dateLabel.y, 450, 520);
  }

  if (termLabel) {
    const termText = textOnLine(page, termLabel.y, 115, 535);
    const match = /GOOD THRU\s+(.+)$/i.exec(termText);

    metadata.effective_through = match?.[1]?.trim() ?? termText;
  }

  return metadata;
}

function groupTableRows(items: PositionedText[]): PositionedText[][] {
  const rows = new Map<number, PositionedText[]>();

  for (const item of items) {
    const rowKey = Math.round(item.y);
    const existing = rows.get(rowKey) ?? [];

    existing.push(item);
    rows.set(rowKey, existing);
  }

  return Array.from(rows.entries())
    .sort((left, right) => right[0] - left[0])
    .map(([, row]) => row.sort((left, right) => left.x - right.x));
}

function textInRange(
  items: PositionedText[],
  minX: number,
  maxX: number,
): string {
  return items
    .filter((item) => item.x >= minX && item.x <= maxX)
    .sort((left, right) => left.x - right.x)
    .map((item) => item.text)
    .join(" ")
    .trim();
}

function textOnLine(
  items: PositionedText[],
  y: number,
  minX: number,
  maxX: number,
): string {
  return textInRange(
    items.filter((item) => Math.abs(item.y - y) < 2),
    minX,
    maxX,
  );
}

function findNearText(
  items: PositionedText[],
  text: string,
): PositionedText | null {
  return items.find((item) => item.text === text) ?? null;
}

function moneyToNumber(value: string): string {
  const number = Number(value.replace(/[$,]/g, ""));

  return Number.isFinite(number) ? number.toFixed(2) : "";
}

function isHiGradeAggregateQuote(text: string): boolean {
  return (
    text.includes("HI-GRADE MATERIALS CO.") &&
    text.includes("ALL QUOTED MATERIAL PRICES LISTED BELOW")
  );
}

function parseDelimitedText(
  csv: string,
  maxRows: number,
): { headers: string[]; rows: SupplierDocumentRow[] } {
  const lines = csv
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length < 2) {
    throw new Error("CSV must include a header row and at least one catalog row.");
  }

  if (lines.length > maxRows + 1) {
    throw new Error(`Supplier price book import is limited to ${maxRows} rows.`);
  }

  const headers = splitDelimitedLine(lines[0]).map(normalizeHeader);
  const rows = lines.slice(1).map((line) => {
    const cells = splitDelimitedLine(line);
    const row: SupplierDocumentRow = {};

    headers.forEach((header, index) => {
      row[header] = cells[index]?.trim() ?? "";
    });

    return row;
  });

  return { headers, rows };
}

function splitDelimitedLine(line: string): string[] {
  const cells: string[] = [];
  let current = "";
  let quoted = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const next = line[index + 1];

    if (char === '"' && quoted && next === '"') {
      current += '"';
      index += 1;
      continue;
    }

    if (char === '"') {
      quoted = !quoted;
      continue;
    }

    if (char === "," && !quoted) {
      cells.push(current);
      current = "";
      continue;
    }

    current += char;
  }

  cells.push(current);

  return cells;
}

function normalizeHeader(header: string): string {
  return header
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "");
}

function isCsv(fileName: string, mimeType: string): boolean {
  return fileName.toLowerCase().endsWith(".csv") || mimeType === "text/csv";
}

function isPdf(fileName: string, mimeType: string): boolean {
  return (
    fileName.toLowerCase().endsWith(".pdf") || mimeType === "application/pdf"
  );
}

function isExcel(fileName: string, mimeType: string): boolean {
  const normalized = fileName.toLowerCase();

  return (
    normalized.endsWith(".xlsx") ||
    normalized.endsWith(".xls") ||
    mimeType === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ||
    mimeType === "application/vnd.ms-excel"
  );
}

function isTextItem(item: TextItem | TextMarkedContent): item is TextItem {
  return "str" in item && typeof item.str === "string";
}

function cellToString(value: string | number | boolean | null | undefined): string {
  if (value === null || value === undefined) {
    return "";
  }

  return String(value).trim();
}
