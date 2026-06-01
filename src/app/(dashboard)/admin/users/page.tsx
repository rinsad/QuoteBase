import { redirect } from "next/navigation";
import { Save, ShieldCheck, UserPlus, UsersRound } from "lucide-react";

import { saveUserInvite, updateAppUser } from "@/app/(dashboard)/admin/users/actions";
import { AdminNav } from "@/components/app-nav";
import { Button } from "@/components/ui/button";
import { getAdminUsers, type AdminAppUser } from "@/lib/admin/users";
import { getCurrentUser } from "@/lib/auth/current-user";

const roleOptions = ["admin", "account_manager", "estimator"] as const;

export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string }>;
}) {
  const currentUser = await getCurrentUser();

  if (!currentUser) {
    redirect("/login");
  }

  if (currentUser.role !== "admin") {
    redirect("/dashboard");
  }

  const [params, data] = await Promise.all([
    searchParams,
    getAdminUsers(currentUser.organization_id),
  ]);

  return (
    <main className="app-background">
      <div className="mx-auto w-full max-w-7xl">
        <header className="mac-window">
          <div className="mac-toolbar">
            <div className="flex min-w-0 items-center gap-3">
              <div className="mac-controls">
                <span className="mac-control-red" />
                <span className="mac-control-yellow" />
                <span className="mac-control-green" />
              </div>
              <div className="h-5 w-px bg-border/80" />
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-muted-foreground">
                  Admin
                </p>
                <h1 className="truncate text-lg font-semibold">Users</h1>
              </div>
            </div>
            <AdminNav />
          </div>
        </header>

        {params.saved ? (
          <div className="mt-6 rounded-[20px] border border-emerald-100 bg-emerald-50/80 px-5 py-4 text-sm font-medium text-emerald-800 shadow-sm">
            User settings saved.
          </div>
        ) : null}

        <section className="mt-6 grid gap-6 lg:grid-cols-[0.72fr_1.28fr]">
          <form action={saveUserInvite} className="glass-panel p-5 sm:p-6">
            <div className="flex items-center gap-3">
              <div className="icon-well text-blue-700">
                <UserPlus className="size-6" />
              </div>
              <div>
                <p className="text-sm font-medium text-muted-foreground">
                  Invite
                </p>
                <h2 className="accent-title text-2xl font-semibold tracking-normal">
                  Add workspace user
                </h2>
              </div>
            </div>

            <div className="mt-6 space-y-4">
              <TextField name="full_name" label="Full name" />
              <TextField name="email" label="Email" type="email" />
              <RoleSelect defaultValue="estimator" />
            </div>

            <div className="mt-6 flex justify-end">
              <Button type="submit" className="h-11 rounded-full">
                <Save className="size-4" />
                Save invite
              </Button>
            </div>
          </form>

          <section className="glass-panel p-5 sm:p-6">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">
                  Team
                </p>
                <h2 className="accent-title text-2xl font-semibold tracking-normal">
                  {data.users.length} active profiles
                </h2>
              </div>
              <div className="flex items-center gap-2 rounded-full bg-blue-50 px-3 py-1.5 text-sm font-medium text-blue-700 ring-1 ring-blue-100">
                <ShieldCheck className="size-4" />
                Tenant scoped
              </div>
            </div>

            <div className="mt-6 space-y-3">
              {data.users.map((appUser) => (
                <UserForm
                  key={appUser.id}
                  appUser={appUser}
                  isCurrentUser={appUser.id === currentUser.id}
                />
              ))}
            </div>
          </section>
        </section>

        <section className="mt-6 glass-panel p-5 sm:p-6">
          <div className="flex items-center gap-3">
            <div className="icon-well text-emerald-700">
              <UsersRound className="size-5" />
            </div>
            <div>
              <p className="text-sm font-medium text-muted-foreground">
                Allowlist
              </p>
              <h2 className="text-xl font-semibold">
                {data.invites.length} invited emails
              </h2>
            </div>
          </div>

          <div className="mt-5 grid gap-3 md:grid-cols-2">
            {data.invites.map((invite) => (
              <div
                key={invite.id}
                className="soft-row flex items-center justify-between gap-3 px-4 py-3"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">
                    {invite.full_name}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    {invite.email}
                  </p>
                </div>
                <span className="soft-chip shrink-0 bg-white/70 text-slate-700 ring-slate-200">
                  {formatRole(invite.role)}
                </span>
              </div>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}

function UserForm({
  appUser,
  isCurrentUser,
}: {
  appUser: AdminAppUser;
  isCurrentUser: boolean;
}) {
  return (
    <form
      action={updateAppUser}
      className="soft-row grid gap-3 px-4 py-4 lg:grid-cols-[1.2fr_1fr_auto_auto] lg:items-end"
    >
      <input type="hidden" name="user_id" value={appUser.id} />
      <TextField
        name="full_name"
        label={appUser.email}
        defaultValue={appUser.full_name}
      />
      <RoleSelect defaultValue={appUser.role} />
      <label className="flex h-11 items-center gap-2 rounded-full bg-white/70 px-3 text-sm font-medium ring-1 ring-white/80">
        <input
          name="is_active"
          type="checkbox"
          defaultChecked={appUser.is_active}
          disabled={isCurrentUser}
          className="size-4"
        />
        Active
      </label>
      <Button type="submit" className="h-11 rounded-full">
        <Save className="size-4" />
        Save
      </Button>
    </form>
  );
}

function TextField({
  name,
  label,
  type = "text",
  defaultValue = "",
}: {
  name: string;
  label: string;
  type?: string;
  defaultValue?: string;
}) {
  return (
    <label className="block">
      <span className="text-sm font-medium text-muted-foreground">{label}</span>
      <input
        name={name}
        type={type}
        defaultValue={defaultValue}
        className="soft-control mt-2 w-full"
        required
      />
    </label>
  );
}

function RoleSelect({ defaultValue }: { defaultValue: (typeof roleOptions)[number] }) {
  return (
    <label className="block">
      <span className="text-sm font-medium text-muted-foreground">Role</span>
      <select
        name="role"
        defaultValue={defaultValue}
        className="soft-control mt-2 w-full"
      >
        {roleOptions.map((role) => (
          <option key={role} value={role}>
            {formatRole(role)}
          </option>
        ))}
      </select>
    </label>
  );
}

function formatRole(role: string) {
  return role
    .split("_")
    .map((part) => part[0]?.toUpperCase() + part.slice(1))
    .join(" ");
}
