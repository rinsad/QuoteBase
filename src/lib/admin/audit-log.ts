import { createClient } from "@/lib/supabase/server";

export type AdminAuditEntry = {
  id: string;
  action: string;
  target_table: string | null;
  target_id: string | null;
  created_at: string;
  metadata: unknown;
  user: {
    full_name: string;
    email: string;
  } | null;
};

type AuditRecord = Omit<AdminAuditEntry, "user"> & {
  users: { full_name: string; email: string } | { full_name: string; email: string }[] | null;
};

export async function getAdminAuditLog(
  organizationId: string,
): Promise<AdminAuditEntry[]> {
  const supabase = await createClient();

  if (!supabase) {
    return [];
  }

  const { data } = await supabase
    .from("audit_log")
    .select("id, action, target_table, target_id, metadata, created_at, users(full_name, email)")
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: false })
    .limit(100)
    .returns<AuditRecord[]>();

  return (
    data?.map((entry) => ({
      id: entry.id,
      action: entry.action,
      target_table: entry.target_table,
      target_id: entry.target_id,
      metadata: entry.metadata,
      created_at: entry.created_at,
      user: relationOne(entry.users),
    })) ?? []
  );
}

export async function getOwnAuditLog({
  organizationId,
  userId,
}: {
  organizationId: string;
  userId: string;
}): Promise<AdminAuditEntry[]> {
  const supabase = await createClient();

  if (!supabase) {
    return [];
  }

  const { data } = await supabase
    .from("audit_log")
    .select("id, action, target_table, target_id, metadata, created_at, users(full_name, email)")
    .eq("organization_id", organizationId)
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(100)
    .returns<AuditRecord[]>();

  return (
    data?.map((entry) => ({
      id: entry.id,
      action: entry.action,
      target_table: entry.target_table,
      target_id: entry.target_id,
      metadata: entry.metadata,
      created_at: entry.created_at,
      user: relationOne(entry.users),
    })) ?? []
  );
}

function relationOne<T>(value: T | T[] | null): T | null {
  if (Array.isArray(value)) {
    return value[0] ?? null;
  }

  return value;
}
