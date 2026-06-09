import type { QuoteStatus } from "@/lib/quotes/quotes";

export const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const QUOTE_STATUSES = new Set<QuoteStatus>([
  "draft",
  "pending_approval",
  "changes_requested",
  "approved",
  "rejected",
  "sent",
  "viewed",
  "accepted",
  "declined",
  "expired",
]);

export type PaginationInput = {
  page: number;
  limit: number;
  from: number;
  to: number;
};

export function parsePagination(searchParams: URLSearchParams):
  | { ok: true; value: PaginationInput }
  | { ok: false; message: string } {
  const page = parseInteger(searchParams.get("page") ?? "1");
  const limit = parseInteger(searchParams.get("limit") ?? "25");

  if (page === null || page < 1) {
    return { ok: false, message: "page must be a positive integer." };
  }

  if (limit === null || limit < 1 || limit > 100) {
    return { ok: false, message: "limit must be between 1 and 100." };
  }

  const from = (page - 1) * limit;

  return {
    ok: true,
    value: {
      page,
      limit,
      from,
      to: from + limit - 1,
    },
  };
}

export function parseQuoteStatus(
  value: string | null,
): { ok: true; value: QuoteStatus | null } | { ok: false; message: string } {
  if (!value) {
    return { ok: true, value: null };
  }

  if (!QUOTE_STATUSES.has(value as QuoteStatus)) {
    return { ok: false, message: "status is not a valid quote status." };
  }

  return { ok: true, value: value as QuoteStatus };
}

export function isUuid(value: string): boolean {
  return UUID_PATTERN.test(value);
}

function parseInteger(value: string): number | null {
  if (!/^\d+$/.test(value)) {
    return null;
  }

  const parsed = Number(value);

  return Number.isSafeInteger(parsed) ? parsed : null;
}
