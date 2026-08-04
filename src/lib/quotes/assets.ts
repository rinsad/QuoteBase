import type { SupabaseClient } from "@supabase/supabase-js";

import type { AppUser } from "@/lib/auth/current-user";
import { createClient } from "@/lib/supabase/server";

export type QuoteAsset = {
  id: string;
  asset_type: "spec" | "test" | "photo" | "other";
  title: string;
  source_filename: string;
  source_mime_type: string;
  created_at: string;
};

type QuoteAssetRecord = QuoteAsset & {
  storage_bucket: string;
  storage_path: string;
};

export async function listQuoteAssets(user: AppUser): Promise<QuoteAsset[]> {
  const supabase = await createClient();

  if (!supabase) {
    return [];
  }

  const { data } = await supabase
    .from("quote_assets")
    .select("id, asset_type, title, source_filename, source_mime_type, created_at")
    .eq("organization_id", user.organization_id)
    .eq("is_active", true)
    .order("created_at", { ascending: false })
    .limit(100)
    .returns<QuoteAsset[]>();

  return data ?? [];
}

export async function getQuoteAssetAttachments({
  supabase,
  organizationId,
  assetIds,
}: {
  supabase: SupabaseClient;
  organizationId: string;
  assetIds: string[];
}): Promise<Array<{ filename: string; contentType: string; contentBase64: string }>> {
  const uniqueAssetIds = Array.from(new Set(assetIds)).filter(Boolean);

  if (!uniqueAssetIds.length) {
    return [];
  }

  const { data: assets } = await supabase
    .from("quote_assets")
    .select(
      "id, asset_type, title, source_filename, source_mime_type, storage_bucket, storage_path, created_at",
    )
    .eq("organization_id", organizationId)
    .eq("is_active", true)
    .in("id", uniqueAssetIds)
    .returns<QuoteAssetRecord[]>();

  const attachments = [];

  for (const asset of assets ?? []) {
    const { data } = await supabase.storage
      .from(asset.storage_bucket)
      .download(asset.storage_path);

    if (!data) {
      continue;
    }

    const bytes = Buffer.from(await data.arrayBuffer());

    attachments.push({
      filename: asset.source_filename,
      contentType: asset.source_mime_type,
      contentBase64: bytes.toString("base64"),
    });
  }

  return attachments;
}
