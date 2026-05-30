import { redirect } from "next/navigation";
import { BadgeCheck, Building2, ShieldCheck, UserRound } from "lucide-react";

import { signOut } from "@/app/(auth)/login/actions";
import { Button } from "@/components/ui/button";
import { getCurrentUser } from "@/lib/auth/current-user";

export default async function DashboardPage() {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/login");
  }

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top_left,#ffffff_0,#f6f7f9_38%,#edf1f5_100%)] px-4 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto w-full max-w-6xl">
        <header className="glass-panel flex min-h-16 items-center justify-between px-4 sm:px-5">
          <div>
            <p className="text-sm font-medium text-muted-foreground">
              QuoteBase
            </p>
            <h1 className="text-lg font-semibold">Dashboard</h1>
          </div>
          <form action={signOut}>
            <Button type="submit" variant="outline" className="rounded-2xl">
              Sign out
            </Button>
          </form>
        </header>

        <section className="mt-6 grid gap-6 lg:grid-cols-[0.9fr_1.1fr]">
          <div className="glass-panel p-6 sm:p-8">
            <div className="rounded-2xl bg-emerald-50 p-3 text-emerald-700 ring-1 ring-emerald-100 w-fit">
              <BadgeCheck className="size-6" />
            </div>
            <h2 className="mt-6 text-3xl font-semibold tracking-normal">
              Welcome, {user.full_name}.
            </h2>
            <p className="mt-3 text-sm leading-6 text-muted-foreground">
              Your profile is loaded from Supabase and scoped to your
              organization.
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <ProfileTile
              icon={UserRound}
              label="Email"
              value={user.email}
            />
            <ProfileTile
              icon={ShieldCheck}
              label="Role"
              value={formatRole(user.role)}
            />
            <ProfileTile
              icon={Building2}
              label="Organization"
              value={user.organization?.name ?? "Unknown"}
            />
          </div>
        </section>
      </div>
    </main>
  );
}

function ProfileTile({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof UserRound;
  label: string;
  value: string;
}) {
  return (
    <div className="glass-tile min-h-44 p-5">
      <Icon className="size-5 text-foreground" />
      <p className="mt-5 text-xs font-medium uppercase text-muted-foreground">
        {label}
      </p>
      <p className="mt-2 break-words text-sm font-semibold">{value}</p>
    </div>
  );
}

function formatRole(role: string) {
  return role
    .split("_")
    .map((part) => part[0]?.toUpperCase() + part.slice(1))
    .join(" ");
}

