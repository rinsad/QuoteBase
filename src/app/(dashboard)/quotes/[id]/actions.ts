"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { getCurrentUser } from "@/lib/auth/current-user";
import { logAction } from "@/lib/audit/log-action";
import { sendQuoteEmail } from "@/lib/notifications/email";
import { ensureQuotePublicLink } from "@/lib/quotes/delivery";
import { createQuoteHtmlDocument } from "@/lib/quotes/documents";
import {
  normalizePricingConfig,
  normalizeVehicleTypes,
} from "@/lib/quotes/new-quote";
import {
  selectBestPlantForQuote,
  type PlantSelectionMaterial,
} from "@/lib/quotes/plant-selection";
import {
  calculateQuoteDraft,
  type PricingConfig,
  type VehicleCapacity,
} from "@/lib/quotes/pricing";
import type { QuoteStatus } from "@/lib/quotes/quotes";
import { transitionQuoteStatus } from "@/lib/quotes/workflow";
import { createClient } from "@/lib/supabase/server";

type QuoteStatusRecord = {
  id: string;
  quote_number: string;
  status: QuoteStatus;
  notes: string | null;
  total: number;
};

type EditableQuoteRecord = QuoteStatusRecord & {
  tax_rate_id: string | null;
  job_sites:
    | { latitude: number | null; longitude: number | null }
    | { latitude: number | null; longitude: number | null }[]
    | null;
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
  vehicle_type_id: string | null;
  load_count: number;
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
  await transitionQuoteStatusAction({
    quoteId,
    from: "draft",
    to: "pending_approval",
    action: "quote.submitted_for_approval",
    allowedRoles: ["admin", "account_manager", "estimator"],
  });
}

export async function approveQuote(quoteId: string) {
  await transitionQuoteStatusAction({
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

  await transitionQuoteStatusAction({
    quoteId,
    from: "pending_approval",
    to: "rejected",
    action: "quote.rejected",
    allowedRoles: ["admin", "account_manager"],
    note: reason ? `Rejected: ${reason}` : "Rejected without a reason.",
  });
}

export async function markQuoteSent(quoteId: string, formData: FormData) {
  const noteValue = formData.get("send_note");
  const note = typeof noteValue === "string" ? noteValue.trim() : "";

  await transitionQuoteStatusAction({
    quoteId,
    from: "approved",
    to: "sent",
    action: "quote.sent",
    allowedRoles: ["admin", "account_manager"],
    note: note ? `Sent: ${note}` : "Marked as sent to customer.",
  });
}

export async function markQuoteAccepted(quoteId: string, formData: FormData) {
  const noteValue = formData.get("customer_response_note");
  const note = typeof noteValue === "string" ? noteValue.trim() : "";

  await transitionQuoteStatusAction({
    quoteId,
    from: "sent",
    to: "accepted",
    action: "quote.accepted",
    allowedRoles: ["admin", "account_manager"],
    note: note ? `Accepted: ${note}` : "Marked accepted by customer.",
  });
}

export async function markQuoteDeclined(quoteId: string, formData: FormData) {
  const noteValue = formData.get("customer_response_note");
  const note = typeof noteValue === "string" ? noteValue.trim() : "";

  await transitionQuoteStatusAction({
    quoteId,
    from: "sent",
    to: "declined",
    action: "quote.declined",
    allowedRoles: ["admin", "account_manager"],
    note: note ? `Declined: ${note}` : "Marked declined by customer.",
  });
}

export async function createCustomerQuoteLink(quoteId: string) {
  if (!UUID_PATTERN.test(quoteId)) {
    throw new Error("Invalid quote id.");
  }

  const user = await getCurrentUser();

  if (!user) {
    redirect("/login");
  }

  if (user.role !== "admin" && user.role !== "account_manager") {
    throw new Error("You do not have permission to create customer quote links.");
  }

  const supabase = await createClient();

  if (!supabase) {
    throw new Error("Supabase is not configured for this workspace.");
  }

  const { data: quote } = await supabase
    .from("quotes")
    .select("id, status")
    .eq("organization_id", user.organization_id)
    .eq("id", quoteId)
    .eq("is_active", true)
    .single<{ id: string; status: QuoteStatus }>();

  if (!quote) {
    throw new Error("Quote not found.");
  }

  if (!["sent", "viewed", "accepted", "declined"].includes(quote.status)) {
    throw new Error("Customer links are available after the quote is sent.");
  }

  const publicLink = await ensureQuotePublicLink({
    supabase,
    user,
    quoteId,
  });

  if (!publicLink?.url) {
    throw new Error("Could not create the customer quote link.");
  }

  await logAction({
    user,
    action: "quote.public_link_created",
    targetTable: "quotes",
    targetId: quoteId,
    before: null,
    after: {
      public_link_id: publicLink.id,
      expires_at: publicLink.expires_at,
    },
  });

  revalidatePath(`/quotes/${quoteId}`);
  redirect(`/quotes/${quoteId}?public_link=${encodeURIComponent(publicLink.url)}`);
}

export async function sendCustomerQuoteEmail(quoteId: string) {
  if (!UUID_PATTERN.test(quoteId)) {
    throw new Error("Invalid quote id.");
  }

  const user = await getCurrentUser();

  if (!user) {
    redirect("/login");
  }

  if (user.role !== "admin" && user.role !== "account_manager") {
    throw new Error("You do not have permission to send customer quote emails.");
  }

  const supabase = await createClient();

  if (!supabase) {
    throw new Error("Supabase is not configured for this workspace.");
  }

  const { data: quote } = await supabase
    .from("quotes")
    .select("id, quote_number, status, total, customers(name, email)")
    .eq("organization_id", user.organization_id)
    .eq("id", quoteId)
    .eq("is_active", true)
    .single<{
      id: string;
      quote_number: string;
      status: QuoteStatus;
      total: number;
      customers:
        | { name: string; email: string | null }
        | { name: string; email: string | null }[]
        | null;
    }>();

  if (!quote) {
    throw new Error("Quote not found.");
  }

  if (!["sent", "viewed", "accepted", "declined"].includes(quote.status)) {
    throw new Error("Customer email is available after the quote is sent.");
  }

  const customer = relationOne(quote.customers);

  if (!customer?.email) {
    throw new Error("This customer does not have an email address.");
  }

  const publicLink = await ensureQuotePublicLink({
    supabase,
    user,
    quoteId,
  });

  if (!publicLink?.url) {
    throw new Error("Could not create the customer quote link.");
  }

  const delivery = await sendQuoteEmail({
    to: customer.email,
    customerName: customer.name,
    quoteNumber: quote.quote_number,
    quoteUrl: publicLink.url,
    total: Number(quote.total),
  });

  await logAction({
    user,
    action: "quote.email_sent",
    targetTable: "quotes",
    targetId: quoteId,
    before: null,
    after: {
      public_link_id: publicLink.id,
      recipient: customer.email,
      delivery_status: delivery.status,
      provider: delivery.provider,
      message_id: delivery.messageId,
    },
    metadata: {
      delivery_reason: delivery.reason,
    },
  });

  revalidatePath(`/quotes/${quoteId}`);
  redirect(
    `/quotes/${quoteId}?email_status=${delivery.status}&public_link=${encodeURIComponent(publicLink.url)}`,
  );
}

export async function generateQuoteDocument(quoteId: string) {
  if (!UUID_PATTERN.test(quoteId)) {
    throw new Error("Invalid quote id.");
  }

  const user = await getCurrentUser();

  if (!user) {
    redirect("/login");
  }

  if (user.role !== "admin" && user.role !== "account_manager") {
    throw new Error("You do not have permission to generate quote documents.");
  }

  const supabase = await createClient();

  if (!supabase) {
    throw new Error("Supabase is not configured for this workspace.");
  }

  const document = await createQuoteHtmlDocument({
    supabase,
    user,
    quoteId,
  });

  if (!document) {
    throw new Error("Could not generate the quote document.");
  }

  await logAction({
    user,
    action: "quote.document_created",
    targetTable: "quotes",
    targetId: quoteId,
    before: null,
    after: {
      document_id: document.id,
      version: document.version,
      document_type: document.document_type,
      storage_bucket: document.storage_bucket,
      storage_path: document.storage_path,
    },
  });

  revalidatePath(`/quotes/${quoteId}`);
  redirect(`/quotes/${quoteId}?document_created=${document.version}`);
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

  const [
    quoteResult,
    materialResult,
    pricingConfigResult,
    vehicleTypesResult,
  ] = await Promise.all([
    supabase
      .from("quotes")
      .select(
        "id, quote_number, status, notes, total, tax_rate_id, job_sites(latitude, longitude)",
      )
      .eq("organization_id", user.organization_id)
      .eq("id", quoteId)
      .eq("is_active", true)
      .single<EditableQuoteRecord>(),
    supabase
      .from("materials")
      .select(
        "id, supplier_id, name, tier, unit, cost_per_unit, suppliers(name, latitude, longitude)",
      )
      .eq("organization_id", user.organization_id)
      .eq("id", materialId)
      .eq("is_active", true)
      .single<PlantSelectionMaterial>(),
    supabase
      .from("pricing_config")
      .select(
        "tier_r1_min, tier_r1_max, tier_r2_min, tier_r2_max, tier_r3_min, tier_r3_max, tier_r4_min, tier_r4_max, truck_floor_rate, truck_standard_rate, truck_target_rate, truck_premium_rate, truck_stretch_rate, default_truck_rate, material_minimum, trucking_minimum, fuel_surcharge_per_load, environmental_fee_per_load, cc_surcharge_pct, overhead_per_ton",
      )
      .eq("organization_id", user.organization_id)
      .single<PricingConfig>(),
    supabase
      .from("vehicle_types")
      .select("id, name, capacity_tons, capacity_cy")
      .eq("organization_id", user.organization_id)
      .eq("is_active", true)
      .order("capacity_tons", { ascending: false })
      .returns<VehicleCapacity[]>(),
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

  const jobSite = relationOne(quote.job_sites);

  if (!jobSite) {
    throw new Error("This quote is missing job-site route data.");
  }

  const requestedMaterial = materialResult.data;
  const recommendation = await selectBestPlantForQuote({
    supabase,
    organizationId: user.organization_id,
    requestedMaterial,
    jobSite: {
      latitude: jobSite.latitude === null ? null : Number(jobSite.latitude),
      longitude: jobSite.longitude === null ? null : Number(jobSite.longitude),
    },
    taxRate: Number(taxRate.rate),
    quantity,
    pricingConfig: normalizePricingConfig(pricingConfigResult.data),
    vehicleTypes: normalizeVehicleTypes(vehicleTypesResult.data ?? []),
  });
  const material = recommendation.material;
  const calculation = recommendation.calculation;

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
      vehicle_type_id: calculation.vehicleTypeId,
      load_count: calculation.loadCount,
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
      requested_material_id: requestedMaterial.id,
      selected_supplier_id: material.supplier_id,
      selected_supplier_name: recommendation.supplierName,
      plant_selection_reason: recommendation.selectionReason,
      route_distance_miles:
        recommendation.routeDistance?.distanceMiles ?? null,
      route_distance_source: recommendation.routeDistance?.source ?? null,
      deadhead_distance_miles:
        recommendation.deadheadDistance?.distanceMiles ?? null,
      deadhead_distance_source:
        recommendation.deadheadDistance?.source ?? null,
      vehicle_type_id: calculation.vehicleTypeId,
      load_count: calculation.loadCount,
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

  const [
    quoteResult,
    itemResult,
    pricingConfigResult,
    vehicleTypesResult,
  ] = await Promise.all([
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
        "id, material_id, quantity, unit, unit_cost, markup_pct, material_unit_price, material_subtotal, vehicle_type_id, load_count, trucking_rate_per_unit, trucking_subtotal, fees_subtotal, line_total, materials(tier)",
      )
      .eq("organization_id", user.organization_id)
      .eq("quote_id", quoteId)
      .eq("id", itemId)
      .eq("is_active", true)
      .single<EditableQuoteItemRecord>(),
    supabase
      .from("pricing_config")
      .select(
        "tier_r1_min, tier_r1_max, tier_r2_min, tier_r2_max, tier_r3_min, tier_r3_max, tier_r4_min, tier_r4_max, truck_floor_rate, truck_standard_rate, truck_target_rate, truck_premium_rate, truck_stretch_rate, default_truck_rate, material_minimum, trucking_minimum, fuel_surcharge_per_load, environmental_fee_per_load, cc_surcharge_pct, overhead_per_ton",
      )
      .eq("organization_id", user.organization_id)
      .single<PricingConfig>(),
    supabase
      .from("vehicle_types")
      .select("id, name, capacity_tons, capacity_cy")
      .eq("organization_id", user.organization_id)
      .eq("is_active", true)
      .order("capacity_tons", { ascending: false })
      .returns<VehicleCapacity[]>(),
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
    vehicleTypes: normalizeVehicleTypes(vehicleTypesResult.data ?? []),
  });

  const beforeItem = {
    quantity: Number(item.quantity),
    markup_pct: Number(item.markup_pct),
    material_unit_price: Number(item.material_unit_price),
    material_subtotal: Number(item.material_subtotal),
    vehicle_type_id: item.vehicle_type_id,
    load_count: Number(item.load_count),
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
      vehicle_type_id: calculation.vehicleTypeId,
      load_count: calculation.loadCount,
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
      vehicle_type_id: calculation.vehicleTypeId,
      load_count: calculation.loadCount,
      line_total: calculation.total,
      total: totals.total,
    },
  });

  revalidatePath("/quotes");
  revalidatePath(`/quotes/${quote.id}`);
  redirect(`/quotes/${quote.id}`);
}

async function transitionQuoteStatusAction({
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

  const quote = await transitionQuoteStatus({
    supabase,
    user,
    action,
    quoteId,
    from,
    to,
    allowedRoles,
    note,
  });

  revalidatePath("/quotes");
  revalidatePath(`/quotes/${quote.id}`);
  redirect(`/quotes/${quote.id}`);
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
