import type { AppUser } from "@/lib/auth/current-user";
import { logAction } from "@/lib/audit/log-action";
import type { QuoteAccountType, QuoteProjectStatus } from "@/lib/quotes/create-draft";
import type { QuoteStatus } from "@/lib/quotes/quotes";

type SupabaseClient = NonNullable<
  Awaited<ReturnType<typeof import("@/lib/supabase/server").createClient>>
>;

type RevisionQuoteRecord = {
  id: string;
  quote_number: string;
  customer_id: string;
  job_site_id: string;
  tax_rate_id: string | null;
  status: QuoteStatus;
  material_subtotal: number;
  trucking_subtotal: number;
  fees_subtotal: number;
  tax_total: number;
  total: number;
  notes: string | null;
  quote_date: string;
  expires_at: string;
  job_start_date: string | null;
  job_end_date: string | null;
  followup_max_attempts: number;
  account_type: QuoteAccountType;
  project_status: QuoteProjectStatus;
  parent_quote_id: string | null;
  revision_number: number;
};

type RevisionNumberRecord = {
  revision_number: number;
};

type RevisionQuoteItemRecord = {
  supplier_id: string;
  material_id: string;
  quantity: number;
  unit: string;
  unit_cost: number;
  markup_per_unit: number | null;
  markup_pct: number;
  material_unit_price: number;
  material_subtotal: number;
  vehicle_type_id: string | null;
  load_count: number;
  trucking_rate_per_unit: number;
  trucking_subtotal: number;
  fees_subtotal: number;
  line_total: number;
};

export type CreatedQuoteRevision = {
  id: string;
  quote_number: string;
  revision_number: number;
};

const REVISION_ALLOWED_STATUSES: QuoteStatus[] = [
  "approved",
  "sent",
  "viewed",
  "follow_up",
  "won",
  "lost",
  "accepted",
  "declined",
  "expired",
];

export async function createQuoteRevision({
  supabase,
  user,
  quoteId,
}: {
  supabase: SupabaseClient;
  user: AppUser;
  quoteId: string;
}): Promise<CreatedQuoteRevision> {
  if (user.role !== "admin") {
    throw new Error("You do not have permission to create quote revisions.");
  }

  const { data: quote } = await supabase
    .from("quotes")
    .select(
      "id, quote_number, customer_id, job_site_id, tax_rate_id, status, material_subtotal, trucking_subtotal, fees_subtotal, tax_total, total, notes, quote_date, expires_at, job_start_date, job_end_date, followup_max_attempts, account_type, project_status, parent_quote_id, revision_number",
    )
    .eq("organization_id", user.organization_id)
    .eq("id", quoteId)
    .eq("is_active", true)
    .single<RevisionQuoteRecord>();

  if (!quote) {
    throw new Error("Quote not found.");
  }

  if (!REVISION_ALLOWED_STATUSES.includes(quote.status)) {
    throw new Error("Create a revision after the quote is approved or sent.");
  }

  const rootQuoteId = quote.parent_quote_id ?? quote.id;
  const nextRevisionNumber = await getNextRevisionNumber({
    supabase,
    organizationId: user.organization_id,
    rootQuoteId,
  });
  const newQuoteNumber = createRevisionQuoteNumber(
    quote.quote_number,
    nextRevisionNumber,
  );

  const { data: quoteItems, error: itemsError } = await supabase
    .from("quote_items")
    .select(
      "supplier_id, material_id, quantity, unit, unit_cost, markup_per_unit, markup_pct, material_unit_price, material_subtotal, vehicle_type_id, load_count, trucking_rate_per_unit, trucking_subtotal, fees_subtotal, line_total",
    )
    .eq("organization_id", user.organization_id)
    .eq("quote_id", quote.id)
    .eq("is_active", true)
    .returns<RevisionQuoteItemRecord[]>();

  if (itemsError) {
    throw new Error(itemsError.message);
  }

  const { data: createdQuote, error: quoteError } = await supabase
    .from("quotes")
    .insert({
      organization_id: user.organization_id,
      quote_number: newQuoteNumber,
      customer_id: quote.customer_id,
      job_site_id: quote.job_site_id,
      requested_by: user.id,
      tax_rate_id: quote.tax_rate_id,
      quote_date: quote.quote_date,
      expires_at: quote.expires_at,
      job_start_date: quote.job_start_date,
      job_end_date: quote.job_end_date,
      followup_max_attempts: quote.followup_max_attempts,
      account_type: quote.account_type,
      project_status: quote.project_status,
      status: "draft",
      material_subtotal: Number(quote.material_subtotal),
      trucking_subtotal: Number(quote.trucking_subtotal),
      fees_subtotal: Number(quote.fees_subtotal),
      tax_total: Number(quote.tax_total),
      total: Number(quote.total),
      notes: quote.notes,
      parent_quote_id: rootQuoteId,
      revision_number: nextRevisionNumber,
      is_active: true,
    })
    .select("id, quote_number, revision_number")
    .single<CreatedQuoteRevision>();

  if (quoteError || !createdQuote) {
    throw new Error(quoteError?.message ?? "Could not create quote revision.");
  }

  if (quoteItems?.length) {
    const { error: itemInsertError } = await supabase.from("quote_items").insert(
      quoteItems.map((item) => ({
        organization_id: user.organization_id,
        quote_id: createdQuote.id,
        supplier_id: item.supplier_id,
        material_id: item.material_id,
        quantity: Number(item.quantity),
        unit: item.unit,
        unit_cost: Number(item.unit_cost),
        markup_per_unit: Number(item.markup_per_unit ?? item.markup_pct),
        markup_pct: Number(item.markup_pct),
        material_unit_price: Number(item.material_unit_price),
        material_subtotal: Number(item.material_subtotal),
        vehicle_type_id: item.vehicle_type_id,
        load_count: Number(item.load_count),
        trucking_rate_per_unit: Number(item.trucking_rate_per_unit),
        trucking_subtotal: Number(item.trucking_subtotal),
        fees_subtotal: Number(item.fees_subtotal),
        line_total: Number(item.line_total),
        is_active: true,
      })),
    );

    if (itemInsertError) {
      await supabase
        .from("quotes")
        .update({ is_active: false })
        .eq("organization_id", user.organization_id)
        .eq("id", createdQuote.id);

      throw new Error(itemInsertError.message);
    }
  }

  await logAction({
    user,
    action: "quote.revision_created",
    targetTable: "quotes",
    targetId: createdQuote.id,
    before: {
      source_quote_id: quote.id,
      source_quote_number: quote.quote_number,
      source_status: quote.status,
    },
    after: {
      quote_id: createdQuote.id,
      quote_number: createdQuote.quote_number,
      parent_quote_id: rootQuoteId,
      revision_number: createdQuote.revision_number,
      copied_item_count: quoteItems?.length ?? 0,
    },
  });

  return createdQuote;
}

async function getNextRevisionNumber({
  supabase,
  organizationId,
  rootQuoteId,
}: {
  supabase: SupabaseClient;
  organizationId: string;
  rootQuoteId: string;
}): Promise<number> {
  const { data, error } = await supabase
    .from("quotes")
    .select("revision_number")
    .eq("organization_id", organizationId)
    .eq("is_active", true)
    .or(`id.eq.${rootQuoteId},parent_quote_id.eq.${rootQuoteId}`)
    .order("revision_number", { ascending: false })
    .limit(1)
    .returns<RevisionNumberRecord[]>();

  if (error) {
    throw new Error(error.message);
  }

  return Number(data?.[0]?.revision_number ?? 1) + 1;
}

function createRevisionQuoteNumber(
  quoteNumber: string,
  revisionNumber: number,
): string {
  return `${quoteNumber.replace(/-R\d+$/i, "")}-R${revisionNumber}`;
}
