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

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return null;
  }

  const { data } = await supabase
    .from("users")
    .select(
      "id, organization_id, email, full_name, role, organizations(id, name, slug)",
    )
    .eq("auth_user_id", user.id)
    .eq("is_active", true)
    .single<UserRecord>();

  if (!data) {
    return null;
  }

  const organization = Array.isArray(data.organizations)
    ? (data.organizations[0] ?? null)
    : data.organizations;

  return {
    id: data.id,
    organization_id: data.organization_id,
    email: data.email,
    full_name: data.full_name,
    role: data.role,
    organization,
  };
}

