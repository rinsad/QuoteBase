import { redirect } from "next/navigation";
import Link from "next/link";
import {
  BadgeCheck,
  Building2,
  Flag,
  KeyRound,
  ShieldCheck,
  UserRound,
} from "lucide-react";

import { signOut } from "@/app/(auth)/login/actions";
import { Button } from "@/components/ui/button";
import { getCurrentUser } from "@/lib/auth/current-user";
import { getDashboardSummary } from "@/lib/system/checks";

export default async function DashboardPage() {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/login");
  }

  const summary = await getDashboardSummary(user);

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
            <div className="flex items-center gap-2">
              {user.role === "admin" ? (
                <Link
                  href="/admin/system-check"
                  className="inline-flex h-8 items-center justify-center rounded-2xl border border-border bg-background px-2.5 text-sm font-medium shadow-sm transition hover:bg-muted"
                >
                  System check
                </Link>
              ) : null}
              <Button type="submit" variant="outline" className="rounded-2xl">
                Sign out
              </Button>
            </div>
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

        <section className="mt-6 grid gap-6 lg:grid-cols-[0.85fr_1.15fr]">
          <div className="glass-panel p-5 sm:p-6">
            <div className="flex items-center gap-3">
              <div className="rounded-2xl bg-blue-50 p-2 text-blue-700 ring-1 ring-blue-100">
                <KeyRound className="size-5" />
              </div>
              <div>
                <p className="text-sm font-medium text-muted-foreground">
                  Session
                </p>
                <h2 className="text-xl font-semibold">Auth status</h2>
              </div>
            </div>
            <div className="mt-5 space-y-3">
              <StatusRow
                label="Supabase"
                value={summary.supabaseStatus}
                good={summary.supabaseStatus === "configured"}
              />
              <StatusRow
                label="Session"
                value={summary.sessionStatus}
                good={summary.sessionStatus === "active"}
              />
              <StatusRow
                label="Tenant"
                value={user.organization?.slug ?? "unknown"}
                good={Boolean(user.organization)}
              />
            </div>
          </div>

          <div className="glass-panel p-5 sm:p-6">
            <div className="flex items-center gap-3">
              <div className="rounded-2xl bg-emerald-50 p-2 text-emerald-700 ring-1 ring-emerald-100">
                <Flag className="size-5" />
              </div>
              <div>
                <p className="text-sm font-medium text-muted-foreground">
                  Feature Gates
                </p>
                <h2 className="text-xl font-semibold">
                  {summary.featureFlags.length} flags visible
                </h2>
              </div>
            </div>
            <div className="mt-5 grid gap-2 sm:grid-cols-2">
              {summary.featureFlags.map((flag) => (
                <div
                  key={flag.feature_name}
                  className="flex items-center justify-between gap-3 rounded-2xl border border-white/70 bg-white/60 px-4 py-3 shadow-sm"
                >
                  <span className="min-w-0 truncate text-sm font-medium">
                    {formatFeatureName(flag.feature_name)}
                  </span>
                  <span
                    className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium ring-1 ${
                      flag.is_enabled
                        ? "bg-emerald-50 text-emerald-700 ring-emerald-100"
                        : "bg-slate-100 text-slate-600 ring-slate-200"
                    }`}
                  >
                    {flag.is_enabled ? "On" : "Off"}
                  </span>
                </div>
              ))}
            </div>
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

function formatFeatureName(featureName: string) {
  return featureName
    .split("_")
    .map((part) => part[0]?.toUpperCase() + part.slice(1))
    .join(" ");
}

function StatusRow({
  label,
  value,
  good,
}: {
  label: string;
  value: string;
  good: boolean;
}) {
  return (
    <div className="flex min-h-12 items-center justify-between gap-3 rounded-2xl border border-white/70 bg-white/60 px-4 shadow-sm">
      <span className="text-sm font-medium text-muted-foreground">{label}</span>
      <span
        className={`rounded-full px-2.5 py-1 text-xs font-medium ring-1 ${
          good
            ? "bg-emerald-50 text-emerald-700 ring-emerald-100"
            : "bg-amber-50 text-amber-700 ring-amber-100"
        }`}
      >
        {value}
      </span>
    </div>
  );
}
