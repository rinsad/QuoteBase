import { createClient } from "@/lib/supabase/server";

export type AppUser = {
  id: string;
  organization_id: string;
  email: string;
  full_name: string;
  role: "admin" | "account_manager" | "estimator";
  organization: {
    id: string;
    name: string;
    slug: string;
  } | null;
};

type UserRecord = Omit<AppUser, "organization"> & {
  organizations: AppUser["organization"] | AppUser["organization"][];
};

export async function getCurrentUser(): Promise<AppUser | null> {
  const supabase = await createClient();

  if (!supabase) {
    return null;
  }

  let authUserId: string | null = null;

  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    authUserId = user?.id ?? null;
  } catch {
    return null;
  }

  if (!authUserId) {
    return null;
  }

  let userRecord: UserRecord | null = null;

  try {
    const { data } = await supabase
      .from("users")
      .select(
        "id, organization_id, email, full_name, role, organizations(id, name, slug)",
      )
      .eq("auth_user_id", authUserId)
      .eq("is_active", true)
      .single<UserRecord>();

    userRecord = data;
  } catch {
    return null;
  }

  if (!userRecord) {
    return null;
  }

  const organization = Array.isArray(userRecord.organizations)
    ? (userRecord.organizations[0] ?? null)
    : userRecord.organizations;

  return {
    id: userRecord.id,
    organization_id: userRecord.organization_id,
    email: userRecord.email,
    full_name: userRecord.full_name,
    role: userRecord.role,
    organization,
  };
}
