"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";

import { logAction } from "@/lib/audit/log-action";
import { getCurrentUser } from "@/lib/auth/current-user";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

const BRANDING_BUCKET = "quote-branding";
const MAX_LOGO_BYTES = 2 * 1024 * 1024;
const ALLOWED_LOGO_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/svg+xml",
]);

export async function updateQuoteBranding(formData: FormData) {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/login");
  }

  if (user.role !== "admin") {
    throw new Error("Only admins can update quote branding.");
  }

  const supabase = await createClient();

  if (!supabase) {
    throw new Error("Supabase is not configured for this workspace.");
  }

  const { data: before } = await supabase
    .from("quote_branding")
    .select("*")
    .eq("organization_id", user.organization_id)
    .maybeSingle<Record<string, unknown>>();

  const uploadedLogoUrl = await uploadLogoIfPresent({
    formData,
    organizationId: user.organization_id,
    supabase,
  });
  const existingLogoUrl = optionalText(formData, "existing_logo_url");
  const payload = {
    organization_id: user.organization_id,
    company_name: requiredText(formData, "company_name"),
    logo_url: uploadedLogoUrl ?? existingLogoUrl,
    address_line1: requiredText(formData, "address_line1"),
    address_line2: optionalText(formData, "address_line2"),
    city: requiredText(formData, "city"),
    state: requiredText(formData, "state"),
    postal_code: requiredText(formData, "postal_code"),
    country: requiredText(formData, "country"),
    phone: requiredText(formData, "phone"),
    footer_note: optionalText(formData, "footer_note"),
    disclaimer: requiredText(formData, "disclaimer"),
    updated_by: user.id,
  };

  const { data: after, error } = await supabase
    .from("quote_branding")
    .upsert(payload, { onConflict: "organization_id" })
    .select("id")
    .single<{ id: string }>();

  if (error || !after) {
    throw new Error(error?.message ?? "Could not update quote branding.");
  }

  await logAction({
    supabase,
    user,
    action: "quote_branding.updated",
    targetTable: "quote_branding",
    targetId: after.id,
    before,
    after: payload,
  });

  revalidatePath("/admin/branding");
  redirect("/admin/branding?saved=1");
}

async function uploadLogoIfPresent({
  formData,
  organizationId,
  supabase,
}: {
  formData: FormData;
  organizationId: string;
  supabase: SupabaseClient;
}): Promise<string | null> {
  const logo = formData.get("logo");

  if (!(logo instanceof File) || logo.size === 0) {
    return null;
  }

  if (logo.size > MAX_LOGO_BYTES) {
    throw new Error("Logo must be 2 MB or smaller.");
  }

  if (!ALLOWED_LOGO_TYPES.has(logo.type)) {
    throw new Error("Logo must be PNG, JPG, WEBP, or SVG.");
  }

  const extension = extensionForContentType(logo.type);
  const path = `${organizationId}/quote-logo.${extension}`;
  const storageClient = createAdminClient() ?? supabase;
  const { error } = await storageClient.storage
    .from(BRANDING_BUCKET)
    .upload(path, logo, {
      contentType: logo.type,
      upsert: true,
    });

  if (error) {
    throw new Error(`Could not upload logo: ${error.message}`);
  }

  const { data } = storageClient.storage.from(BRANDING_BUCKET).getPublicUrl(path);

  return data.publicUrl;
}

function requiredText(formData: FormData, key: string): string {
  const value = optionalText(formData, key);

  if (!value) {
    throw new Error(`${key} is required.`);
  }

  return value;
}

function optionalText(formData: FormData, key: string): string | null {
  const value = formData.get(key);

  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();

  return trimmed.length > 0 ? trimmed : null;
}

function extensionForContentType(contentType: string): string {
  if (contentType === "image/jpeg") {
    return "jpg";
  }

  if (contentType === "image/svg+xml") {
    return "svg";
  }

  return contentType.split("/")[1] ?? "png";
}
