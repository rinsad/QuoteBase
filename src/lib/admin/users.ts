import { createAdminClient } from "@/lib/supabase/admin";

export type AdminAppUser = {
  id: string;
  email: string;
  full_name: string;
  role: "admin" | "account_manager" | "estimator";
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type AdminUserInvite = {
  id: string;
  email: string;
  full_name: string;
  role: "admin" | "account_manager" | "estimator";
  is_active: boolean;
  created_at: string;
};

export async function getAdminUsers(
  organizationId: string,
): Promise<{
  users: AdminAppUser[];
  invites: AdminUserInvite[];
}> {
  const admin = createAdminClient();

  if (!admin) {
    return { users: [], invites: [] };
  }

  const [usersResult, invitesResult] = await Promise.all([
    admin
      .from("users")
      .select("id, email, full_name, role, is_active, created_at, updated_at")
      .eq("organization_id", organizationId)
      .order("full_name", { ascending: true })
      .returns<AdminAppUser[]>(),
    admin
      .from("user_invites")
      .select("id, email, full_name, role, is_active, created_at")
      .eq("organization_id", organizationId)
      .order("created_at", { ascending: false })
      .returns<AdminUserInvite[]>(),
  ]);

  return {
    users: usersResult.data ?? [],
    invites: invitesResult.data ?? [],
  };
}
