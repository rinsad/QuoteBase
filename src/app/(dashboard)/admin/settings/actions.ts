"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { logAction } from "@/lib/audit/log-action";
import { getCurrentUser } from "@/lib/auth/current-user";
import { createClient } from "@/lib/supabase/server";

const tenantSettingsSchema = z.object({
  big_quote_threshold: z.coerce.number().positive(),
  jobs_starting_soon_days: z.coerce.number().int().min(1).max(120),
  default_followup_max_attempts: z.coerce.number().int().min(1).max(5),
});

export async function updateTenantSettings(formData: FormData): Promise<void> {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/login");
  }

  if (user.role !== "admin") {
    throw new Error("Only admins can update tenant settings.");
  }

  const parsed = tenantSettingsSchema.safeParse({
    big_quote_threshold: formData.get("big_quote_threshold"),
    jobs_starting_soon_days: formData.get("jobs_starting_soon_days"),
    default_followup_max_attempts: formData.get(
      "default_followup_max_attempts",
    ),
  });

  if (!parsed.success) {
    throw new Error(
      "Enter a positive quote threshold, a window from 1 to 120 days, and 1 to 5 follow-up attempts.",
    );
  }

  const supabase = await createClient();

  if (!supabase) {
    throw new Error("Supabase is not configured for this workspace.");
  }

  const { data: before, error: beforeError } = await supabase
    .from("pricing_config")
    .select(
      "id, big_quote_threshold, jobs_starting_soon_days, default_followup_max_attempts",
    )
    .eq("organization_id", user.organization_id)
    .maybeSingle<Record<string, unknown>>();

  if (beforeError || !before) {
    throw new Error(beforeError?.message ?? "Tenant settings were not found.");
  }

  const { data: after, error } = await supabase
    .from("pricing_config")
    .update({
      ...parsed.data,
      updated_at: new Date().toISOString(),
    })
    .eq("organization_id", user.organization_id)
    .select(
      "id, big_quote_threshold, jobs_starting_soon_days, default_followup_max_attempts",
    )
    .single<Record<string, unknown>>();

  if (error || !after) {
    throw new Error(error?.message ?? "Could not update tenant settings.");
  }

  await logAction({
    user,
    action: "tenant_settings.updated",
    targetTable: "pricing_config",
    targetId: typeof after.id === "string" ? after.id : undefined,
    before,
    after,
    supabase,
  });

  revalidatePath("/admin/settings");
  revalidatePath("/admin/pricing");
  revalidatePath("/dashboard");
  revalidatePath("/quotes");
  redirect("/admin/settings?saved=1");
}
