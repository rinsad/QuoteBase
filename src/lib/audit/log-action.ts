import type { AppUser } from "@/lib/auth/current-user";
import { createClient } from "@/lib/supabase/server";

type LogActionInput = {
  user: AppUser;
  action: string;
  targetTable?: string;
  targetId?: string;
  before?: unknown;
  after?: unknown;
  metadata?: Record<string, unknown>;
};

export async function logAction({
  user,
  action,
  targetTable,
  targetId,
  before,
  after,
  metadata,
}: LogActionInput) {
  const supabase = await createClient();

  if (!supabase) {
    return;
  }

  await supabase.from("audit_log").insert({
    organization_id: user.organization_id,
    user_id: user.id,
    action,
    target_table: targetTable ?? null,
    target_id: targetId ?? null,
    before_value: before ?? null,
    after_value: after ?? null,
    metadata: metadata ?? null,
  });
}

