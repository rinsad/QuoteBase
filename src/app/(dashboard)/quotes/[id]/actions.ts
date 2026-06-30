"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { getCurrentUser } from "@/lib/auth/current-user";
import { logAction } from "@/lib/audit/log-action";
import { isFeatureEnabled } from "@/lib/features/flags";
import { getGoogleMapsIntegration } from "@/lib/integrations/google-maps";
import { sendQuoteEmail } from "@/lib/notifications/email";
import { ensureQuotePublicLink } from "@/lib/quotes/delivery";
import {
  createQuoteHtmlDocument,
  createQuotePdfDocument,
  getQuoteDocumentAttachment,
} from "@/lib/quotes/documents";
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
  isCodPaymentTerms,
  normalizeCatalogMarkupRules,
  resolveCatalogMarkupRule,
  type CatalogMarkupRule,
  type PricingConfig,
  type VehicleCapacity,
} from "@/lib/quotes/pricing";
import type { QuoteStatus } from "@/lib/quotes/quotes";
import { createQuoteRevision } from "@/lib/quotes/revisions";
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
  markup_per_unit: number | null;
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
const EDITABLE_UNAPPROVED_STATUSES: QuoteStatus[] = [
  "draft",
  "pending_approval",
  "changes_requested",
  "rejected",
];

export async function submitQuoteForApproval(quoteId: string) {
  if (!UUID_PATTERN.test(quoteId)) {
    redirect("/quotes?action_error=Invalid%20quote%20id.");
  }

  const user = await getCurrentUser();

  if (!user) {
    redirect("/login");
  }

  const supabase = await createClient();

  if (!supabase) {
    redirectQuoteActionError(
      quoteId,
      "Supabase is not configured for this workspace.",
    );
  }

  const { data: quote } = await supabase
    .from("quotes")
    .select("status")
    .eq("organization_id", user.organization_id)
    .eq("id", quoteId)
    .eq("is_active", true)
    .single<{ status: QuoteStatus }>();

  if (!quote || !["draft", "changes_requested"].includes(quote.status)) {
    redirectQuoteActionError(
      quoteId,
      "Only draft or changes-requested quotes can be submitted.",
    );
  }
  const approvalWorkflowEnabled = await isFeatureEnabled({
    supabase,
    organizationId: user.organization_id,
    featureName: "approval_workflow",
    defaultValue: true,
  });

  await transitionQuoteStatusAction({
    quoteId,
    from: quote.status,
    to: approvalWorkflowEnabled ? "pending_approval" : "approved",
    action: approvalWorkflowEnabled
      ? "quote.submitted_for_approval"
      : "quote.fast_mode_approved",
    allowedRoles: ["admin", "account_manager", "estimator"],
    note: approvalWorkflowEnabled
      ? undefined
      : "Approval workflow disabled; quote approved in fast mode.",
  });
}

export async function approveQuote(quoteId: string) {
  await transitionQuoteStatusAction({
    quoteId,
    from: "pending_approval",
    to: "approved",
    action: "quote.approved",
    allowedRoles: ["admin"],
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
    allowedRoles: ["admin"],
    note: reason ? `Rejected: ${reason}` : "Rejected without a reason.",
  });
}

export async function requestQuoteChanges(quoteId: string, formData: FormData) {
  const commentValue = formData.get("change_request_comment");
  const comment = typeof commentValue === "string" ? commentValue.trim() : "";

  await transitionQuoteStatusAction({
    quoteId,
    from: "pending_approval",
    to: "changes_requested",
    action: "quote.changes_requested",
    allowedRoles: ["admin"],
    note: comment ? `Changes requested: ${comment}` : "Changes requested.",
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
  const status = await getCurrentQuoteStatusForCustomerResponse(quoteId);

  await transitionQuoteStatusAction({
    quoteId,
    from: status,
    to: "won",
    action: "quote.won",
    allowedRoles: ["admin", "account_manager"],
    note: note ? `Won: ${note}` : "Marked won by customer acceptance.",
  });
}

export async function markQuoteDeclined(quoteId: string, formData: FormData) {
  const noteValue = formData.get("customer_response_note");
  const note = typeof noteValue === "string" ? noteValue.trim() : "";
  const status = await getCurrentQuoteStatusForCustomerResponse(quoteId);

  await transitionQuoteStatusAction({
    quoteId,
    from: status,
    to: "lost",
    action: "quote.lost",
    allowedRoles: ["admin", "account_manager"],
    note: note ? `Lost: ${note}` : "Marked lost by customer decline.",
  });
}

async function getCurrentQuoteStatusForCustomerResponse(
  quoteId: string,
): Promise<"sent" | "viewed" | "follow_up"> {
  if (!UUID_PATTERN.test(quoteId)) {
    redirect("/quotes?action_error=Invalid%20quote%20id.");
  }

  const user = await getCurrentUser();

  if (!user) {
    redirect("/login");
  }

  const supabase = await createClient();

  if (!supabase) {
    redirectQuoteActionError(
      quoteId,
      "Supabase is not configured for this workspace.",
    );
  }

  const { data: quote } = await supabase
    .from("quotes")
    .select("status")
    .eq("organization_id", user.organization_id)
    .eq("id", quoteId)
    .eq("is_active", true)
    .single<{ status: QuoteStatus }>();

  if (
    !quote ||
    !["sent", "viewed", "follow_up"].includes(quote.status)
  ) {
    redirectQuoteActionError(
      quoteId,
      "Only sent or follow-up quotes can be marked won or lost.",
    );
  }

  return quote.status as "sent" | "viewed" | "follow_up";
}

export async function createCustomerQuoteLink(quoteId: string) {
  if (!UUID_PATTERN.test(quoteId)) {
    redirect("/quotes?action_error=Invalid%20quote%20id.");
  }

  const user = await getCurrentUser();

  if (!user) {
    redirect("/login");
  }

  if (user.role !== "admin" && user.role !== "account_manager") {
    redirectQuoteActionError(
      quoteId,
      "You do not have permission to create customer quote links.",
    );
  }

  const supabase = await createClient();

  if (!supabase) {
    redirectQuoteActionError(
      quoteId,
      "Supabase is not configured for this workspace.",
    );
  }

  const { data: quote } = await supabase
    .from("quotes")
    .select("id, status")
    .eq("organization_id", user.organization_id)
    .eq("id", quoteId)
    .eq("is_active", true)
    .single<{ id: string; status: QuoteStatus }>();

  if (!quote) {
    redirectQuoteActionError(quoteId, "Quote not found.");
  }

  if (!["sent", "viewed", "follow_up", "won", "lost"].includes(quote.status)) {
    redirectQuoteActionError(
      quoteId,
      "Customer links are available after the quote is sent.",
    );
  }

  const publicLink = await ensureQuotePublicLink({
    supabase,
    user,
    quoteId,
  });

  if (!publicLink?.url) {
    redirectQuoteActionError(quoteId, "Could not create the customer quote link.");
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
    redirect("/quotes?action_error=Invalid%20quote%20id.");
  }

  const user = await getCurrentUser();

  if (!user) {
    redirect("/login");
  }

  if (user.role !== "admin" && user.role !== "account_manager") {
    redirectQuoteActionError(
      quoteId,
      "You do not have permission to send customer quote emails.",
    );
  }

  const supabase = await createClient();

  if (!supabase) {
    redirectQuoteActionError(
      quoteId,
      "Supabase is not configured for this workspace.",
    );
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
    redirectQuoteEmailError(quoteId, "Quote not found.");
  }

  if (!["approved", "sent", "viewed", "follow_up", "won", "lost"].includes(quote.status)) {
    redirectQuoteEmailError(
      quoteId,
      "Customer email is available after the quote is approved.",
    );
  }

  const customer = relationOne(quote.customers);

  if (!customer?.email) {
    redirectQuoteEmailError(
      quoteId,
      "This customer does not have an email address.",
    );
  }

  const publicLink = await ensureQuotePublicLink({
    supabase,
    user,
    quoteId,
  });

  if (!publicLink?.url) {
    redirectQuoteEmailError(quoteId, "Could not create the customer quote link.");
  }

  let pdfDocument: Awaited<ReturnType<typeof createQuotePdfDocument>> = null;
  let attachment: Awaited<ReturnType<typeof getQuoteDocumentAttachment>> = null;

  try {
    pdfDocument = await createQuotePdfDocument({
      supabase,
      user,
      quoteId,
      quoteUrl: publicLink.url,
    });
    attachment = pdfDocument
      ? await getQuoteDocumentAttachment({
          supabase,
          organizationId: user.organization_id,
          documentId: pdfDocument.id,
        })
      : null;
  } catch (error) {
    redirectQuoteEmailError(
      quoteId,
      error instanceof Error
        ? `Could not create the PDF attachment: ${error.message}`
        : "Could not create the PDF attachment.",
      publicLink.url,
    );
  }
  let delivery: Awaited<ReturnType<typeof sendQuoteEmail>>;

  try {
    delivery = await sendQuoteEmail({
      supabase,
      organizationId: user.organization_id,
      senderUserId: user.id,
      to: customer.email,
      customerName: customer.name,
      quoteNumber: quote.quote_number,
      quoteUrl: publicLink.url,
      total: Number(quote.total),
      attachments: attachment ? [attachment] : [],
    });
  } catch (error) {
    redirectQuoteEmailError(
      quoteId,
      error instanceof Error
        ? `Could not send the customer email: ${error.message}`
        : "Could not send the customer email.",
      publicLink.url,
    );
  }

  if (delivery.status === "sent" && quote.status === "approved") {
    await transitionQuoteStatus({
      supabase,
      user,
      action: "quote.sent_to_customer_by_email",
      quoteId,
      from: "approved",
      to: "sent",
      allowedRoles: ["admin", "account_manager"],
      note: `Sent to ${customer.email} by email.`,
    });
    await supabase
      .from("quotes")
      .update({ followup_date: offsetDate(2) })
      .eq("organization_id", user.organization_id)
      .eq("id", quoteId);
  }

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
      document_id: pdfDocument?.id ?? null,
    },
    metadata: {
      delivery_reason: delivery.reason,
    },
  });

  revalidatePath(`/quotes/${quoteId}`);
  const publicLinkParam =
    delivery.status === "sent"
      ? `&public_link=${encodeURIComponent(publicLink.url)}`
      : "";
  const errorParam =
    delivery.status === "failed" && delivery.reason
      ? `&email_error=${encodeURIComponent(delivery.reason)}`
      : "";

  redirect(
    `/quotes/${quoteId}?email_status=${delivery.status}${publicLinkParam}${errorParam}`,
  );
}

export async function generateQuoteDocument(quoteId: string) {
  if (!UUID_PATTERN.test(quoteId)) {
    redirect("/quotes?action_error=Invalid%20quote%20id.");
  }

  const user = await getCurrentUser();

  if (!user) {
    redirect("/login");
  }

  if (user.role !== "admin" && user.role !== "account_manager") {
    redirectQuoteActionError(
      quoteId,
      "You do not have permission to generate quote documents.",
    );
  }

  const supabase = await createClient();

  if (!supabase) {
    redirectQuoteActionError(
      quoteId,
      "Supabase is not configured for this workspace.",
    );
  }

  let document: Awaited<ReturnType<typeof createQuoteHtmlDocument>> = null;

  try {
    document = await createQuoteHtmlDocument({
      supabase,
      user,
      quoteId,
    });
  } catch (error) {
    redirectQuoteActionError(
      quoteId,
      error instanceof Error
        ? `Could not generate the quote document: ${error.message}`
        : "Could not generate the quote document.",
    );
  }

  if (!document) {
    redirectQuoteActionError(quoteId, "Could not generate the quote document.");
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

export async function createQuoteRevisionAction(quoteId: string) {
  if (!UUID_PATTERN.test(quoteId)) {
    redirect("/quotes?action_error=Invalid%20quote%20id.");
  }

  const user = await getCurrentUser();

  if (!user) {
    redirect("/login");
  }

  const supabase = await createClient();

  if (!supabase) {
    redirectQuoteActionError(
      quoteId,
      "Supabase is not configured for this workspace.",
    );
  }

  let revision: Awaited<ReturnType<typeof createQuoteRevision>>;

  try {
    revision = await createQuoteRevision({
      supabase,
      user,
      quoteId,
    });
  } catch (error) {
    redirectQuoteActionError(
      quoteId,
      error instanceof Error
        ? `Could not create a revision: ${error.message}`
        : "Could not create a revision.",
    );
  }

  revalidatePath("/quotes");
  revalidatePath(`/quotes/${quoteId}`);
  revalidatePath(`/quotes/${revision.id}`);
  redirect(
    `/quotes/${revision.id}?revision_created=${encodeURIComponent(
      revision.quote_number,
    )}`,
  );
}

export async function addQuoteItem(quoteId: string, formData: FormData) {
  if (!UUID_PATTERN.test(quoteId)) {
    redirect("/quotes?action_error=Invalid%20quote%20id.");
  }

  const materialId = requiredUuid(formData, "material_id");
  const quantity = Number(getString(formData, "quantity"));

  if (!materialId) {
    redirectQuoteActionError(quoteId, "Select a material.");
  }

  if (!Number.isFinite(quantity) || quantity <= 0 || quantity > 100000) {
    redirectQuoteActionError(quoteId, "Quantity must be greater than zero.");
  }

  const user = await getCurrentUser();

  if (!user) {
    redirect("/login");
  }

  const supabase = await createClient();

  if (!supabase) {
    redirectQuoteActionError(
      quoteId,
      "Supabase is not configured for this workspace.",
    );
  }

  const [
    quoteResult,
    materialResult,
    pricingConfigResult,
    vehicleTypesResult,
    markupRulesResult,
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
        "id, supplier_id, supplier_catalog_version_id, supplier_catalog_item_id, catalog_category, name, tier, unit, cost_per_unit, suppliers!inner(name, latitude, longitude)",
      )
      .eq("organization_id", user.organization_id)
      .eq("id", materialId)
      .eq("is_active", true)
      .eq("suppliers.is_active", true)
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
    supabase
      .from("supplier_markup_rules")
      .select(
        "id, supplier_id, scope, category, catalog_item_id, markup_type, markup_value, margin_floor_pct, priority, effective_from, effective_to",
      )
      .eq("organization_id", user.organization_id)
      .eq("is_active", true)
      .returns<CatalogMarkupRule[]>(),
  ]);

  if (!quoteResult.data || !materialResult.data || !pricingConfigResult.data) {
    redirectQuoteActionError(
      quoteId,
      "Quote, material, or pricing configuration is missing.",
    );
  }

  const quote = quoteResult.data;

  if (!EDITABLE_UNAPPROVED_STATUSES.includes(quote.status)) {
    redirectQuoteActionError(quoteId, "Only unapproved quotes can be edited.");
  }

  if (!quote.tax_rate_id) {
    redirectQuoteActionError(quoteId, "This quote is missing a tax rate.");
  }

  const { data: taxRate } = await supabase
    .from("sales_tax_rates")
    .select("id, rate")
    .eq("organization_id", user.organization_id)
    .eq("id", quote.tax_rate_id)
    .single<TaxRateRecord>();

  if (!taxRate) {
    redirectQuoteActionError(
      quoteId,
      "This quote's tax rate is no longer available.",
    );
  }

  const jobSite = relationOne(quote.job_sites);
  const minimumOverrides = await getQuoteMinimumOverrides(
    quote.id,
    user.organization_id,
  );

  if (!jobSite) {
    redirectQuoteActionError(
      quoteId,
      "This quote is missing job-site route data.",
    );
  }

  const requestedMaterial = materialResult.data;
  const catalogMarkupRules = normalizeCatalogMarkupRules(
    markupRulesResult.data ?? [],
  );
  const googleMapsIntegration = await getGoogleMapsIntegration({
    supabase,
    organizationId: user.organization_id,
  });
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
    pricingConfig: {
      ...normalizePricingConfig(pricingConfigResult.data),
      material_minimum: 0,
      trucking_minimum:
        minimumOverrides.truckingMinimumOverride ??
        Number(pricingConfigResult.data.trucking_minimum),
    },
    vehicleTypes: normalizeVehicleTypes(vehicleTypesResult.data ?? []),
    catalogMarkupRules,
    googleMapsApiKey:
      googleMapsIntegration?.isEnabled && googleMapsIntegration.apiKey
        ? googleMapsIntegration.apiKey
        : null,
  });
  const material = recommendation.material;
  const calculation = recommendation.calculation;
  const catalogMarkupRule = resolveCatalogMarkupRule(material, catalogMarkupRules);

  const { data: item, error: itemError } = await supabase
    .from("quote_items")
    .insert({
      organization_id: user.organization_id,
      quote_id: quote.id,
      supplier_id: material.supplier_id,
      material_id: material.id,
      supplier_catalog_version_id: material.supplier_catalog_version_id,
      supplier_catalog_item_id: material.supplier_catalog_item_id,
      quantity,
      unit: material.unit,
      unit_cost: Number(material.cost_per_unit),
      markup_per_unit: calculation.markupPerUnit,
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
    redirectQuoteActionError(
      quoteId,
      itemError?.message ?? "Could not add the quote item.",
    );
  }

  let totals: Awaited<ReturnType<typeof getQuoteTotals>>;

  try {
    totals = await getQuoteTotals(quote.id, user.organization_id);
  } catch (error) {
    redirectQuoteActionError(
      quoteId,
      error instanceof Error
        ? error.message
        : "Could not calculate quote totals.",
    );
  }
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
    .in("status", EDITABLE_UNAPPROVED_STATUSES)
    .eq("is_active", true)
    .select("id")
    .single<{ id: string }>();

  if (updateError || !updatedQuote) {
    await supabase
      .from("quote_items")
      .update({ is_active: false })
      .eq("organization_id", user.organization_id)
      .eq("id", item.id);

    redirectQuoteActionError(
      quoteId,
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
      supplier_catalog_version_id: material.supplier_catalog_version_id,
      supplier_catalog_item_id: material.supplier_catalog_item_id,
      catalog_markup_rule_id: catalogMarkupRule?.id ?? null,
      catalog_markup_source: calculation.markupSource,
      gross_margin_pct: calculation.grossMarginPct,
      margin_floor_pct: calculation.marginFloorPct,
      margin_floor_warning: calculation.marginFloorWarning,
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
  revalidatePath("/quotes/approvals");
  revalidatePath("/quotes/approved");
  revalidatePath(`/quotes/${quote.id}`);
  redirect(`/quotes/${quote.id}`);
}

export async function removeQuoteItem(quoteId: string, itemId: string) {
  if (!UUID_PATTERN.test(quoteId) || !UUID_PATTERN.test(itemId)) {
    redirect("/quotes?action_error=Invalid%20quote%20or%20item%20id.");
  }

  const user = await getCurrentUser();

  if (!user) {
    redirect("/login");
  }

  const supabase = await createClient();

  if (!supabase) {
    redirectQuoteActionError(
      quoteId,
      "Supabase is not configured for this workspace.",
    );
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
    redirectQuoteActionError(quoteId, "Quote or quote item not found.");
  }

  const quote = quoteResult.data;
  const item = itemResult.data;

  if (!EDITABLE_UNAPPROVED_STATUSES.includes(quote.status)) {
    redirectQuoteActionError(quoteId, "Only unapproved quotes can be edited.");
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
    redirectQuoteActionError(
      quoteId,
      disableError?.message ?? "Could not remove the quote item.",
    );
  }

  let totals: Awaited<ReturnType<typeof getQuoteTotals>>;

  try {
    totals = await getQuoteTotals(quote.id, user.organization_id);
  } catch (error) {
    redirectQuoteActionError(
      quoteId,
      error instanceof Error
        ? error.message
        : "Could not calculate quote totals.",
    );
  }
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
    .in("status", EDITABLE_UNAPPROVED_STATUSES)
    .eq("is_active", true)
    .select("id")
    .single<{ id: string }>();

  if (updateError || !updatedQuote) {
    await supabase
      .from("quote_items")
      .update({ is_active: true })
      .eq("organization_id", user.organization_id)
      .eq("id", item.id);

    redirectQuoteActionError(
      quoteId,
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
    redirect("/quotes?action_error=Invalid%20quote%20or%20item%20id.");
  }

  const quantity = Number(getString(formData, "quantity"));

  if (!Number.isFinite(quantity) || quantity <= 0 || quantity > 100000) {
    redirectQuoteActionError(quoteId, "Quantity must be greater than zero.");
  }

  const user = await getCurrentUser();

  if (!user) {
    redirect("/login");
  }

  const supabase = await createClient();

  if (!supabase) {
    redirectQuoteActionError(
      quoteId,
      "Supabase is not configured for this workspace.",
    );
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
        "id, material_id, quantity, unit, unit_cost, markup_per_unit, markup_pct, material_unit_price, material_subtotal, vehicle_type_id, load_count, trucking_rate_per_unit, trucking_subtotal, fees_subtotal, line_total, materials(tier)",
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
    redirectQuoteActionError(
      quoteId,
      "Quote, item, or pricing configuration is missing.",
    );
  }

  const quote = quoteResult.data;
  const item = itemResult.data;
  const material = relationOne(item.materials);

  if (!EDITABLE_UNAPPROVED_STATUSES.includes(quote.status)) {
    redirectQuoteActionError(quoteId, "Only unapproved quotes can be edited.");
  }

  if (!quote.tax_rate_id || !material) {
    redirectQuoteActionError(
      quoteId,
      "This quote item is missing tax or material data.",
    );
  }

  const { data: taxRate } = await supabase
    .from("sales_tax_rates")
    .select("id, rate")
    .eq("organization_id", user.organization_id)
    .eq("id", quote.tax_rate_id)
    .single<TaxRateRecord>();

  if (!taxRate) {
    redirectQuoteActionError(
      quoteId,
      "This quote's tax rate is no longer available.",
    );
  }
  const minimumOverrides = await getQuoteMinimumOverrides(
    quote.id,
    user.organization_id,
  );

  const calculation = calculateQuoteDraft({
    costPerUnit: Number(item.unit_cost),
    quantity,
    tier: material.tier,
    unit: item.unit,
    taxRate: Number(taxRate.rate),
    pricingConfig: {
      ...normalizePricingConfig(pricingConfigResult.data),
      trucking_minimum:
        minimumOverrides.truckingMinimumOverride ??
        Number(pricingConfigResult.data.trucking_minimum),
    },
    vehicleTypes: normalizeVehicleTypes(vehicleTypesResult.data ?? []),
    applyMaterialMinimum: false,
    materialUnitPriceOverride: Number(item.material_unit_price),
  });

  const beforeItem = {
    quantity: Number(item.quantity),
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
  };
  const { data: updatedItem, error: itemError } = await supabase
    .from("quote_items")
    .update({
      quantity,
      markup_per_unit: calculation.markupPerUnit,
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
    redirectQuoteActionError(
      quoteId,
      itemError?.message ?? "Could not update the quote item.",
    );
  }

  let totals: Awaited<ReturnType<typeof getQuoteTotals>>;

  try {
    totals = await getQuoteTotals(quote.id, user.organization_id);
  } catch (error) {
    redirectQuoteActionError(
      quoteId,
      error instanceof Error
        ? error.message
        : "Could not calculate quote totals.",
    );
  }
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
    .in("status", EDITABLE_UNAPPROVED_STATUSES)
    .eq("is_active", true)
    .select("id")
    .single<{ id: string }>();

  if (updateError || !updatedQuote) {
    await supabase
      .from("quote_items")
      .update(beforeItem)
      .eq("organization_id", user.organization_id)
      .eq("id", item.id);

    redirectQuoteActionError(
      quoteId,
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
    redirect("/quotes?action_error=Invalid%20quote%20id.");
  }

  const user = await getCurrentUser();

  if (!user) {
    redirect("/login");
  }

  if (!allowedRoles.includes(user.role)) {
    redirectQuoteActionError(
      quoteId,
      "You do not have permission to perform this quote action.",
    );
  }

  const supabase = await createClient();

  if (!supabase) {
    redirectQuoteActionError(
      quoteId,
      "Supabase is not configured for this workspace.",
    );
  }

  let quote: Awaited<ReturnType<typeof transitionQuoteStatus>>;

  try {
    quote = await transitionQuoteStatus({
      supabase,
      user,
      action,
      quoteId,
      from,
      to,
      allowedRoles,
      note,
    });
  } catch (error) {
    redirectQuoteActionError(
      quoteId,
      error instanceof Error
        ? error.message
        : "Could not update the quote status.",
    );
  }

  if (to === "sent") {
    await supabase
      .from("quotes")
      .update({ followup_date: offsetDate(2) })
      .eq("organization_id", user.organization_id)
      .eq("id", quote.id);
  }

  if (to === "won" || to === "lost") {
    await supabase
      .from("quotes")
      .update({ followup_date: null })
      .eq("organization_id", user.organization_id)
      .eq("id", quote.id);
  }

  revalidatePath("/quotes");
  revalidatePath(`/quotes/${quote.id}`);
  const warningParam = quote.integrationWarning
    ? `?integration_warning=${encodeURIComponent(quote.integrationWarning)}`
    : "";
  redirect(`/quotes/${quote.id}${warningParam}`);
}

function offsetDate(days: number): string {
  const value = new Date();
  value.setUTCDate(value.getUTCDate() + days);

  return value.toISOString().slice(0, 10);
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

  const [
    quoteResult,
    pricingConfigResult,
    itemsResult,
    minimumOverrides,
  ] = await Promise.all([
    supabase
      .from("quotes")
      .select("tax_rate_id, sales_tax_rates(rate), customers(payment_terms)")
      .eq("organization_id", organizationId)
      .eq("id", quoteId)
      .eq("is_active", true)
      .single<{
        tax_rate_id: string | null;
        sales_tax_rates:
          | { rate: number }
          | { rate: number }[]
          | null;
        customers:
          | { payment_terms: string | null }
          | { payment_terms: string | null }[]
          | null;
      }>(),
    supabase
      .from("pricing_config")
      .select("material_minimum, cc_surcharge_pct")
      .eq("organization_id", organizationId)
      .single<{ material_minimum: number; cc_surcharge_pct: number }>(),
    supabase
    .from("quote_items")
    .select("material_subtotal, trucking_subtotal, fees_subtotal, line_total")
    .eq("organization_id", organizationId)
    .eq("quote_id", quoteId)
    .eq("is_active", true)
      .returns<QuoteTotalsRecord[]>(),
    getQuoteMinimumOverrides(quoteId, organizationId),
  ]);

  if (quoteResult.error || pricingConfigResult.error || itemsResult.error) {
    throw new Error(
      quoteResult.error?.message ??
        pricingConfigResult.error?.message ??
        itemsResult.error?.message ??
        "Could not calculate quote totals.",
    );
  }

  const totals = (itemsResult.data ?? []).reduce(
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
  const materialSubtotal = Math.max(
    totals.materialSubtotal,
    minimumOverrides.materialMinimumOverride ??
      Number(pricingConfigResult.data?.material_minimum ?? 0),
  );
  const taxRate = Number(relationOne(quoteResult.data?.sales_tax_rates ?? null)?.rate ?? 0);
  const paymentTerms =
    relationOne(quoteResult.data?.customers ?? null)?.payment_terms ?? null;
  const baseSubtotal =
    materialSubtotal + totals.truckingSubtotal + totals.feesSubtotal;
  const creditCardSurcharge = isCodPaymentTerms(paymentTerms)
    ? baseSubtotal * (Number(pricingConfigResult.data?.cc_surcharge_pct ?? 0) / 100)
    : 0;
  const feesSubtotal = totals.feesSubtotal + creditCardSurcharge;
  const taxableSubtotal = materialSubtotal + totals.truckingSubtotal + feesSubtotal;

  return {
    materialSubtotal: roundMoney(materialSubtotal),
    truckingSubtotal: roundMoney(totals.truckingSubtotal),
    feesSubtotal: roundMoney(feesSubtotal),
    taxTotal: roundMoney(taxableSubtotal * taxRate),
    total: roundMoney(taxableSubtotal * (1 + taxRate)),
  };
}

async function getQuoteMinimumOverrides(
  quoteId: string,
  organizationId: string,
): Promise<{
  materialMinimumOverride: number | null;
  truckingMinimumOverride: number | null;
}> {
  const supabase = await createClient();

  if (!supabase) {
    throw new Error("Supabase is not configured for this workspace.");
  }

  const { data } = await supabase
    .from("audit_log")
    .select("metadata")
    .eq("organization_id", organizationId)
    .eq("target_table", "quotes")
    .eq("target_id", quoteId)
    .eq("action", "quote.draft_created")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle<{ metadata: Record<string, unknown> | null }>();
  const metadata = data?.metadata ?? null;

  return {
    materialMinimumOverride: readMoneyMetadata(
      metadata,
      "material_minimum_override",
    ),
    truckingMinimumOverride: readMoneyMetadata(
      metadata,
      "trucking_minimum_override",
    ),
  };
}

function readMoneyMetadata(
  metadata: Record<string, unknown> | null,
  key: string,
): number | null {
  const value = metadata?.[key];
  const numberValue = typeof value === "number" ? value : null;

  return numberValue !== null && Number.isFinite(numberValue) && numberValue >= 0
    ? numberValue
    : null;
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

function redirectQuoteEmailError(
  quoteId: string,
  message: string,
  publicLink?: string,
): never {
  const publicLinkParam = publicLink
    ? `&public_link=${encodeURIComponent(publicLink)}`
    : "";

  redirect(
    `/quotes/${quoteId}?email_status=failed${publicLinkParam}&email_error=${encodeURIComponent(
      message,
    )}`,
  );
}

function redirectQuoteActionError(quoteId: string, message: string): never {
  redirect(`/quotes/${quoteId}?action_error=${encodeURIComponent(message)}`);
}
