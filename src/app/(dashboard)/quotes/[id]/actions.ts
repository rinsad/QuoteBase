"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { getCurrentUser } from "@/lib/auth/current-user";
import { logAction } from "@/lib/audit/log-action";
import { normalizePricingConfig } from "@/lib/quotes/new-quote";
import { calculateQuoteDraft, type PricingConfig } from "@/lib/quotes/pricing";
import { createClient } from "@/lib/supabase/server";

type QuoteStatus =
  | "draft"
  | "pending_approval"
  | "approved"
  | "rejected"
  | "expired";

type QuoteStatusRecord = {
  id: string;
  quote_number: string;
  status: QuoteStatus;
  notes: string | null;
  total: number;
};

type EditableQuoteRecord = QuoteStatusRecord & {
  tax_rate_id: string | null;
};

type MaterialRecord = {
  id: string;
  supplier_id: string;
  name: string;
  tier: "R1" | "R2" | "R3" | "R4";
  unit: string;
  cost_per_unit: number;
};

type TaxRateRecord = {
  id: string;
  rate: number;
};

type QuoteTotalsRecord = {
  material_subtotal: number;
  trucking_subtotal: number;
  fees_subtotal: number;
  line_total: number;
};

type QuoteItemRecord = {
  id: string;
  material_id: string;
  quantity: number;
  line_total: number;
};

type EditableQuoteItemRecord = QuoteItemRecord & {
  unit: string;
  unit_cost: number;
  markup_pct: number;
  material_unit_price: number;
  material_subtotal: number;
  trucking_rate_per_unit: number;
  trucking_subtotal: number;
  fees_subtotal: number;
  materials:
    | { tier: "R1" | "R2" | "R3" | "R4" }
    | { tier: "R1" | "R2" | "R3" | "R4" }[]
    | null;
};

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function submitQuoteForApproval(quoteId: string) {
  await transitionQuoteStatus({
    quoteId,
    from: "draft",
    to: "pending_approval",
    action: "quote.submitted_for_approval",
    allowedRoles: ["admin", "account_manager", "estimator"],
  });
}

export async function approveQuote(quoteId: string) {
  await transitionQuoteStatus({
    quoteId,
    from: "pending_approval",
    to: "approved",
    action: "quote.approved",
    allowedRoles: ["admin", "account_manager"],
  });
}

export async function rejectQuote(quoteId: string, formData: FormData) {
  const reasonValue = formData.get("rejection_reason");
  const reason = typeof reasonValue === "string" ? reasonValue.trim() : "";

  await transitionQuoteStatus({
    quoteId,
    from: "pending_approval",
    to: "rejected",
    action: "quote.rejected",
    allowedRoles: ["admin", "account_manager"],
    note: reason ? `Rejected: ${reason}` : "Rejected without a reason.",
  });
}

export async function addQuoteItem(quoteId: string, formData: FormData) {
  if (!UUID_PATTERN.test(quoteId)) {
    throw new Error("Invalid quote id.");
  }

  const materialId = requiredUuid(formData, "material_id");
  const quantity = Number(getString(formData, "quantity"));

  if (!materialId) {
    throw new Error("Select a material.");
  }

  if (!Number.isFinite(quantity) || quantity <= 0 || quantity > 100000) {
    throw new Error("Quantity must be greater than zero.");
  }

  const user = await getCurrentUser();

  if (!user) {
    redirect("/login");
  }

  const supabase = await createClient();

  if (!supabase) {
    throw new Error("Supabase is not configured for this workspace.");
  }

  const [quoteResult, materialResult, pricingConfigResult] = await Promise.all([
    supabase
      .from("quotes")
      .select("id, quote_number, status, notes, total, tax_rate_id")
      .eq("organization_id", user.organization_id)
      .eq("id", quoteId)
      .eq("is_active", true)
      .single<EditableQuoteRecord>(),
    supabase
      .from("materials")
      .select("id, supplier_id, name, tier, unit, cost_per_unit")
      .eq("organization_id", user.organization_id)
      .eq("id", materialId)
      .eq("is_active", true)
      .single<MaterialRecord>(),
    supabase
      .from("pricing_config")
      .select(
        "tier_r1_min, tier_r1_max, tier_r2_min, tier_r2_max, tier_r3_min, tier_r3_max, tier_r4_min, tier_r4_max, truck_floor_rate, truck_standard_rate, truck_target_rate, truck_premium_rate, truck_stretch_rate, default_truck_rate, fuel_surcharge_per_load, environmental_fee_per_load, overhead_per_ton",
      )
      .eq("organization_id", user.organization_id)
      .single<PricingConfig>(),
  ]);

  if (!quoteResult.data || !materialResult.data || !pricingConfigResult.data) {
    throw new Error("Quote, material, or pricing configuration is missing.");
  }

  const quote = quoteResult.data;

  if (quote.status !== "draft") {
    throw new Error("Only draft quotes can be edited.");
  }

  if (!quote.tax_rate_id) {
    throw new Error("This quote is missing a tax rate.");
  }

  const { data: taxRate } = await supabase
    .from("sales_tax_rates")
    .select("id, rate")
    .eq("organization_id", user.organization_id)
    .eq("id", quote.tax_rate_id)
    .single<TaxRateRecord>();

  if (!taxRate) {
    throw new Error("This quote's tax rate is no longer available.");
  }

  const material = materialResult.data;
  const calculation = calculateQuoteDraft({
    costPerUnit: Number(material.cost_per_unit),
    quantity,
    tier: material.tier,
    unit: material.unit,
    taxRate: Number(taxRate.rate),
    pricingConfig: normalizePricingConfig(pricingConfigResult.data),
  });

  const { data: item, error: itemError } = await supabase
    .from("quote_items")
    .insert({
      organization_id: user.organization_id,
      quote_id: quote.id,
      supplier_id: material.supplier_id,
      material_id: material.id,
      quantity,
      unit: material.unit,
      unit_cost: Number(material.cost_per_unit),
      markup_pct: calculation.markupPct,
      material_unit_price: calculation.materialUnitPrice,
      material_subtotal: calculation.materialSubtotal,
      trucking_rate_per_unit: calculation.truckingRatePerUnit,
      trucking_subtotal: calculation.truckingSubtotal,
      fees_subtotal: calculation.feesSubtotal,
      line_total: calculation.total,
      is_active: true,
    })
    .select("id")
    .single<{ id: string }>();

  if (itemError || !item) {
    throw new Error(itemError?.message ?? "Could not add the quote item.");
  }

  const totals = await getQuoteTotals(quote.id, user.organization_id);
  const { data: updatedQuote, error: updateError } = await supabase
    .from("quotes")
    .update({
      material_subtotal: totals.materialSubtotal,
      trucking_subtotal: totals.truckingSubtotal,
      fees_subtotal: totals.feesSubtotal,
      tax_total: totals.taxTotal,
      total: totals.total,
    })
    .eq("organization_id", user.organization_id)
    .eq("id", quote.id)
    .eq("status", "draft")
    .eq("is_active", true)
    .select("id")
    .single<{ id: string }>();

  if (updateError || !updatedQuote) {
    await supabase
      .from("quote_items")
      .update({ is_active: false })
      .eq("organization_id", user.organization_id)
      .eq("id", item.id);

    throw new Error(
      updateError?.message ?? "Could not update the draft quote total.",
    );
  }

  await logAction({
    user,
    action: "quote.item_added",
    targetTable: "quotes",
    targetId: quote.id,
    before: {
      total: Number(quote.total),
    },
    after: {
      item_id: item.id,
      material_id: material.id,
      quantity,
      total: totals.total,
    },
  });

  revalidatePath("/quotes");
  revalidatePath(`/quotes/${quote.id}`);
  redirect(`/quotes/${quote.id}`);
}

export async function removeQuoteItem(quoteId: string, itemId: string) {
  if (!UUID_PATTERN.test(quoteId) || !UUID_PATTERN.test(itemId)) {
    throw new Error("Invalid quote or item id.");
  }

  const user = await getCurrentUser();

  if (!user) {
    redirect("/login");
  }

  const supabase = await createClient();

  if (!supabase) {
    throw new Error("Supabase is not configured for this workspace.");
  }

  const [quoteResult, itemResult] = await Promise.all([
    supabase
      .from("quotes")
      .select("id, quote_number, status, notes, total")
      .eq("organization_id", user.organization_id)
      .eq("id", quoteId)
      .eq("is_active", true)
      .single<QuoteStatusRecord>(),
    supabase
      .from("quote_items")
      .select("id, material_id, quantity, line_total")
      .eq("organization_id", user.organization_id)
      .eq("quote_id", quoteId)
      .eq("id", itemId)
      .eq("is_active", true)
      .single<QuoteItemRecord>(),
  ]);

  if (!quoteResult.data || !itemResult.data) {
    throw new Error("Quote or quote item not found.");
  }

  const quote = quoteResult.data;
  const item = itemResult.data;

  if (quote.status !== "draft") {
    throw new Error("Only draft quotes can be edited.");
  }

  const { data: disabledItem, error: disableError } = await supabase
    .from("quote_items")
    .update({ is_active: false })
    .eq("organization_id", user.organization_id)
    .eq("quote_id", quote.id)
    .eq("id", item.id)
    .eq("is_active", true)
    .select("id")
    .single<{ id: string }>();

  if (disableError || !disabledItem) {
    throw new Error(disableError?.message ?? "Could not remove the quote item.");
  }

  const totals = await getQuoteTotals(quote.id, user.organization_id);
  const { data: updatedQuote, error: updateError } = await supabase
    .from("quotes")
    .update({
      material_subtotal: totals.materialSubtotal,
      trucking_subtotal: totals.truckingSubtotal,
      fees_subtotal: totals.feesSubtotal,
      tax_total: totals.taxTotal,
      total: totals.total,
    })
    .eq("organization_id", user.organization_id)
    .eq("id", quote.id)
    .eq("status", "draft")
    .eq("is_active", true)
    .select("id")
    .single<{ id: string }>();

  if (updateError || !updatedQuote) {
    await supabase
      .from("quote_items")
      .update({ is_active: true })
      .eq("organization_id", user.organization_id)
      .eq("id", item.id);

    throw new Error(
      updateError?.message ?? "Could not update the draft quote total.",
    );
  }

  await logAction({
    user,
    action: "quote.item_removed",
    targetTable: "quotes",
    targetId: quote.id,
    before: {
      item_id: item.id,
      material_id: item.material_id,
      quantity: Number(item.quantity),
      line_total: Number(item.line_total),
      total: Number(quote.total),
    },
    after: {
      total: totals.total,
    },
  });

  revalidatePath("/quotes");
  revalidatePath(`/quotes/${quote.id}`);
  redirect(`/quotes/${quote.id}`);
}

export async function updateQuoteItemQuantity(
  quoteId: string,
  itemId: string,
  formData: FormData,
) {
  if (!UUID_PATTERN.test(quoteId) || !UUID_PATTERN.test(itemId)) {
    throw new Error("Invalid quote or item id.");
  }

  const quantity = Number(getString(formData, "quantity"));

  if (!Number.isFinite(quantity) || quantity <= 0 || quantity > 100000) {
    throw new Error("Quantity must be greater than zero.");
  }

  const user = await getCurrentUser();

  if (!user) {
    redirect("/login");
  }

  const supabase = await createClient();

  if (!supabase) {
    throw new Error("Supabase is not configured for this workspace.");
  }

  const [quoteResult, itemResult, pricingConfigResult] = await Promise.all([
    supabase
      .from("quotes")
      .select("id, quote_number, status, notes, total, tax_rate_id")
      .eq("organization_id", user.organization_id)
      .eq("id", quoteId)
      .eq("is_active", true)
      .single<EditableQuoteRecord>(),
    supabase
      .from("quote_items")
      .select(
        "id, material_id, quantity, unit, unit_cost, markup_pct, material_unit_price, material_subtotal, trucking_rate_per_unit, trucking_subtotal, fees_subtotal, line_total, materials(tier)",
      )
      .eq("organization_id", user.organization_id)
      .eq("quote_id", quoteId)
      .eq("id", itemId)
      .eq("is_active", true)
      .single<EditableQuoteItemRecord>(),
    supabase
      .from("pricing_config")
      .select(
        "tier_r1_min, tier_r1_max, tier_r2_min, tier_r2_max, tier_r3_min, tier_r3_max, tier_r4_min, tier_r4_max, truck_floor_rate, truck_standard_rate, truck_target_rate, truck_premium_rate, truck_stretch_rate, default_truck_rate, fuel_surcharge_per_load, environmental_fee_per_load, overhead_per_ton",
      )
      .eq("organization_id", user.organization_id)
      .single<PricingConfig>(),
  ]);

  if (!quoteResult.data || !itemResult.data || !pricingConfigResult.data) {
    throw new Error("Quote, item, or pricing configuration is missing.");
  }

  const quote = quoteResult.data;
  const item = itemResult.data;
  const material = relationOne(item.materials);

  if (quote.status !== "draft") {
    throw new Error("Only draft quotes can be edited.");
  }

  if (!quote.tax_rate_id || !material) {
    throw new Error("This quote item is missing tax or material data.");
  }

  const { data: taxRate } = await supabase
    .from("sales_tax_rates")
    .select("id, rate")
    .eq("organization_id", user.organization_id)
    .eq("id", quote.tax_rate_id)
    .single<TaxRateRecord>();

  if (!taxRate) {
    throw new Error("This quote's tax rate is no longer available.");
  }

  const calculation = calculateQuoteDraft({
    costPerUnit: Number(item.unit_cost),
    quantity,
    tier: material.tier,
    unit: item.unit,
    taxRate: Number(taxRate.rate),
    pricingConfig: normalizePricingConfig(pricingConfigResult.data),
  });

  const beforeItem = {
    quantity: Number(item.quantity),
    markup_pct: Number(item.markup_pct),
    material_unit_price: Number(item.material_unit_price),
    material_subtotal: Number(item.material_subtotal),
    trucking_rate_per_unit: Number(item.trucking_rate_per_unit),
    trucking_subtotal: Number(item.trucking_subtotal),
    fees_subtotal: Number(item.fees_subtotal),
    line_total: Number(item.line_total),
  };
  const { data: updatedItem, error: itemError } = await supabase
    .from("quote_items")
    .update({
      quantity,
      markup_pct: calculation.markupPct,
      material_unit_price: calculation.materialUnitPrice,
      material_subtotal: calculation.materialSubtotal,
      trucking_rate_per_unit: calculation.truckingRatePerUnit,
      trucking_subtotal: calculation.truckingSubtotal,
      fees_subtotal: calculation.feesSubtotal,
      line_total: calculation.total,
    })
    .eq("organization_id", user.organization_id)
    .eq("quote_id", quote.id)
    .eq("id", item.id)
    .eq("is_active", true)
    .select("id")
    .single<{ id: string }>();

  if (itemError || !updatedItem) {
    throw new Error(itemError?.message ?? "Could not update the quote item.");
  }

  const totals = await getQuoteTotals(quote.id, user.organization_id);
  const { data: updatedQuote, error: updateError } = await supabase
    .from("quotes")
    .update({
      material_subtotal: totals.materialSubtotal,
      trucking_subtotal: totals.truckingSubtotal,
      fees_subtotal: totals.feesSubtotal,
      tax_total: totals.taxTotal,
      total: totals.total,
    })
    .eq("organization_id", user.organization_id)
    .eq("id", quote.id)
    .eq("status", "draft")
    .eq("is_active", true)
    .select("id")
    .single<{ id: string }>();

  if (updateError || !updatedQuote) {
    await supabase
      .from("quote_items")
      .update(beforeItem)
      .eq("organization_id", user.organization_id)
      .eq("id", item.id);

    throw new Error(
      updateError?.message ?? "Could not update the draft quote total.",
    );
  }

  await logAction({
    user,
    action: "quote.item_quantity_updated",
    targetTable: "quotes",
    targetId: quote.id,
    before: {
      item_id: item.id,
      ...beforeItem,
      total: Number(quote.total),
    },
    after: {
      item_id: item.id,
      quantity,
      line_total: calculation.total,
      total: totals.total,
    },
  });

  revalidatePath("/quotes");
  revalidatePath(`/quotes/${quote.id}`);
  redirect(`/quotes/${quote.id}`);
}

async function transitionQuoteStatus({
  quoteId,
  from,
  to,
  action,
  allowedRoles,
  note,
}: {
  quoteId: string;
  from: QuoteStatus;
  to: QuoteStatus;
  action: string;
  allowedRoles: Array<"admin" | "account_manager" | "estimator">;
  note?: string;
}) {
  if (!UUID_PATTERN.test(quoteId)) {
    throw new Error("Invalid quote id.");
  }

  const user = await getCurrentUser();

  if (!user) {
    redirect("/login");
  }

  if (!allowedRoles.includes(user.role)) {
    throw new Error("You do not have permission to perform this quote action.");
  }

  const supabase = await createClient();

  if (!supabase) {
    throw new Error("Supabase is not configured for this workspace.");
  }

  const { data: quote, error: quoteError } = await supabase
    .from("quotes")
    .select("id, quote_number, status, notes, total")
    .eq("organization_id", user.organization_id)
    .eq("id", quoteId)
    .eq("is_active", true)
    .single<QuoteStatusRecord>();

  if (quoteError || !quote) {
    throw new Error(quoteError?.message ?? "Quote not found.");
  }

  if (quote.status !== from) {
    throw new Error(
      `Quote ${quote.quote_number} must be ${formatStatus(from)} before it can become ${formatStatus(to)}.`,
    );
  }

  const notes = note ? appendNote(quote.notes, note) : quote.notes;
  const { error: updateError } = await supabase
    .from("quotes")
    .update({
      status: to,
      notes,
    })
    .eq("organization_id", user.organization_id)
    .eq("id", quote.id)
    .eq("status", from)
    .eq("is_active", true);

  if (updateError) {
    throw new Error(updateError.message);
  }

  await logAction({
    user,
    action,
    targetTable: "quotes",
    targetId: quote.id,
    before: {
      status: from,
      notes: quote.notes,
    },
    after: {
      status: to,
      notes,
      total: Number(quote.total),
    },
  });

  revalidatePath("/quotes");
  revalidatePath(`/quotes/${quote.id}`);
  redirect(`/quotes/${quote.id}`);
}

function appendNote(existingNotes: string | null, note: string): string {
  const timestamp = new Date().toISOString();
  const nextNote = `[${timestamp}] ${note}`;

  return existingNotes ? `${existingNotes}\n\n${nextNote}` : nextNote;
}

function formatStatus(status: string): string {
  return status
    .split("_")
    .map((part) => part[0]?.toUpperCase() + part.slice(1))
    .join(" ");
}

async function getQuoteTotals(
  quoteId: string,
  organizationId: string,
): Promise<{
  materialSubtotal: number;
  truckingSubtotal: number;
  feesSubtotal: number;
  taxTotal: number;
  total: number;
}> {
  const supabase = await createClient();

  if (!supabase) {
    throw new Error("Supabase is not configured for this workspace.");
  }

  const { data: items, error } = await supabase
    .from("quote_items")
    .select("material_subtotal, trucking_subtotal, fees_subtotal, line_total")
    .eq("organization_id", organizationId)
    .eq("quote_id", quoteId)
    .eq("is_active", true)
    .returns<QuoteTotalsRecord[]>();

  if (error) {
    throw new Error(error.message);
  }

  const totals = (items ?? []).reduce(
    (sum, item) => ({
      materialSubtotal: sum.materialSubtotal + Number(item.material_subtotal),
      truckingSubtotal: sum.truckingSubtotal + Number(item.trucking_subtotal),
      feesSubtotal: sum.feesSubtotal + Number(item.fees_subtotal),
      total: sum.total + Number(item.line_total),
    }),
    {
      materialSubtotal: 0,
      truckingSubtotal: 0,
      feesSubtotal: 0,
      total: 0,
    },
  );

  return {
    ...totals,
    taxTotal:
      roundMoney(
        totals.total -
          totals.materialSubtotal -
          totals.truckingSubtotal -
          totals.feesSubtotal,
      ),
    total: roundMoney(totals.total),
  };
}

function getString(formData: FormData, key: string): string {
  const value = formData.get(key);

  return typeof value === "string" ? value.trim() : "";
}

function requiredUuid(formData: FormData, key: string): string {
  const value = getString(formData, key);

  return UUID_PATTERN.test(value) ? value : "";
}

function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function relationOne<T>(value: T | T[] | null): T | null {
  return Array.isArray(value) ? (value[0] ?? null) : value;
}
