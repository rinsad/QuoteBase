import { redirect } from "next/navigation";
import Link from "next/link";
import {
  BadgeCheck,
  Building2,
  FilePlus2,
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
    <main className="app-background">
      <div className="mx-auto w-full max-w-6xl">
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
                  QuoteBase
                </p>
                <h1 className="truncate text-lg font-semibold">Dashboard</h1>
              </div>
            </div>
            <form action={signOut}>
              <div className="flex flex-wrap items-center justify-end gap-2">
                <Link href="/quotes/new" className="mac-link">
                  New quote
                </Link>
                <Link href="/quotes" className="mac-link">
                  Quotes
                </Link>
                <Link href="/customers" className="mac-link">
                  Customers
                </Link>
                {user.role === "admin" || user.role === "account_manager" ? (
                  <Link href="/admin/material-prices" className="mac-link">
                    Material prices
                  </Link>
                ) : null}
                {user.role === "admin" ? (
                  <>
                    <Link href="/admin/plants" className="mac-link">
                      Plants
                    </Link>
                    <Link href="/admin/suppliers" className="mac-link">
                      Suppliers
                    </Link>
                    <Link href="/admin/yards" className="mac-link">
                      Yards
                    </Link>
                    <Link href="/admin/vehicle-types" className="mac-link">
                      Vehicles
                    </Link>
                    <Link href="/admin/pricing" className="mac-link">
                      Pricing
                    </Link>
                    <Link href="/admin/tax-rates" className="mac-link">
                      Taxes
                    </Link>
                    <Link href="/admin/feature-flags" className="mac-link">
                      Features
                    </Link>
                    <Link href="/admin/users" className="mac-link">
                      Users
                    </Link>
                    <Link href="/admin/audit-log" className="mac-link">
                      Audit
                    </Link>
                    <Link href="/admin/system-check" className="mac-link">
                      System check
                    </Link>
                  </>
                ) : null}
                <Button
                  type="submit"
                  variant="outline"
                  className="rounded-full bg-white/70"
                >
                  Sign out
                </Button>
              </div>
            </form>
          </div>
        </header>

        <section className="mt-6 grid gap-6 lg:grid-cols-[0.9fr_1.1fr]">
          <div className="glass-panel p-6 sm:p-8">
            <div className="icon-well text-emerald-700">
              <BadgeCheck className="size-6" />
            </div>
            <h2 className="accent-title mt-6 text-3xl font-semibold tracking-normal">
              Welcome, {user.full_name}.
            </h2>
            <p className="mt-3 text-sm leading-6 text-muted-foreground">
              Your profile is loaded from Supabase and scoped to your
              organization.
            </p>
            <Link href="/quotes/new" className="mac-button-primary mt-6">
              <FilePlus2 className="size-4" />
              Create quote
            </Link>
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
              <div className="icon-well text-blue-700">
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
              <div className="icon-well text-emerald-700">
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
                  className="soft-row flex items-center justify-between gap-3 px-4 py-3"
                >
                  <span className="min-w-0 truncate text-sm font-medium">
                    {formatFeatureName(flag.feature_name)}
                  </span>
                  <span
                    className={`soft-chip shrink-0 ${
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
    <div className="soft-row flex min-h-12 items-center justify-between gap-3 px-4">
      <span className="text-sm font-medium text-muted-foreground">{label}</span>
      <span
        className={`soft-chip ${
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
