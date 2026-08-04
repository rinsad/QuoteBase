"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { logAction } from "@/lib/audit/log-action";
import { getCurrentUser } from "@/lib/auth/current-user";
import { createClient } from "@/lib/supabase/server";

const ASSET_BUCKET = "quote-assets";
const MAX_ASSET_BYTES = 20 * 1024 * 1024;
const ALLOWED_ASSET_MIME_TYPES = new Set([
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "text/plain",
  "image/jpeg",
  "image/png",
  "image/webp",
]);

const assetMetadataSchema = z.object({
  title: z.string().trim().min(1, "Enter an asset title.").max(200),
  assetType: z.enum(["spec", "test", "photo", "other"]),
});

export async function uploadLibraryAsset(formData: FormData): Promise<void> {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/login");
  }

  if (user.role !== "admin" && user.role !== "account_manager") {
    redirectAssetError("You do not have permission to upload assets.");
  }

  const metadata = assetMetadataSchema.safeParse({
    title: formData.get("asset_title"),
    assetType: formData.get("asset_type"),
  });
  const fileValue = formData.get("asset_file");
  const file = fileValue instanceof File ? fileValue : null;

  if (!metadata.success) {
    redirectAssetError(
      metadata.error.issues[0]?.message ?? "Enter valid asset details.",
    );
  }

  if (!file || file.size === 0) {
    redirectAssetError("Choose an asset file to upload.");
  }

  if (file.size > MAX_ASSET_BYTES) {
    redirectAssetError("Assets must be 20 MB or smaller.");
  }

  if (!ALLOWED_ASSET_MIME_TYPES.has(file.type)) {
    redirectAssetError(
      "Assets must be a PDF, Word document, text file, JPEG, PNG, or WebP image.",
    );
  }

  const supabase = await createClient();

  if (!supabase) {
    redirectAssetError("Supabase is not configured for this workspace.");
  }

  const safeName = safeFileName(file.name);
  const storagePath = `${user.organization_id}/assets/${crypto.randomUUID()}-${safeName}`;
  const { error: uploadError } = await supabase.storage
    .from(ASSET_BUCKET)
    .upload(storagePath, file, {
      contentType: file.type,
      upsert: false,
    });

  if (uploadError) {
    redirectAssetError(uploadError.message);
  }

  const { data: asset, error: assetError } = await supabase
    .from("quote_assets")
    .insert({
      organization_id: user.organization_id,
      uploaded_by: user.id,
      asset_type: metadata.data.assetType,
      title: metadata.data.title,
      source_filename: file.name,
      source_mime_type: file.type,
      storage_bucket: ASSET_BUCKET,
      storage_path: storagePath,
    })
    .select("id")
    .single<{ id: string }>();

  if (assetError || !asset) {
    await supabase.storage.from(ASSET_BUCKET).remove([storagePath]);
    redirectAssetError(
      assetError?.message ?? "Could not save the uploaded asset.",
    );
  }

  await logAction({
    user,
    action: "quote_asset.uploaded_to_library",
    targetTable: "quote_assets",
    targetId: asset.id,
    before: null,
    after: {
      title: metadata.data.title,
      asset_type: metadata.data.assetType,
      source_filename: file.name,
      storage_bucket: ASSET_BUCKET,
      storage_path: storagePath,
    },
    supabase,
  });

  revalidatePath("/assets");
  revalidatePath("/quotes");
  redirect("/assets?uploaded=1");
}

function safeFileName(value: string): string {
  const sanitized = value
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120);

  return sanitized || "quote-asset";
}

function redirectAssetError(message: string): never {
  redirect(`/assets?error=${encodeURIComponent(message)}`);
}
