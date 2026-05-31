import Link from "next/link";
import { redirect } from "next/navigation";
import {
  BadgeCheck,
  Building2,
  ClipboardCheck,
  Database,
  Flag,
  ShieldCheck,
  TriangleAlert,
  UsersRound,
} from "lucide-react";

import { getCurrentUser } from "@/lib/auth/current-user";
import { getSystemCheckSummary, type SystemCheck } from "@/lib/system/checks";

export default async function SystemCheckPage() {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/login");
  }

  if (user.role !== "admin") {
    redirect("/dashboard");
  }

  const summary = await getSystemCheckSummary(user);

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
                  Admin
                </p>
                <h1 className="truncate text-lg font-semibold">
                  System Check
                </h1>
              </div>
            </div>
            <div className="flex flex-wrap items-center justify-end gap-2">
              <Link href="/admin/feature-flags" className="mac-link">
                Features
              </Link>
              <Link href="/dashboard" className="mac-link">
                Dashboard
              </Link>
            </div>
          </div>
        </header>

        <section className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <CountTile
            icon={Building2}
            label="Organizations"
            value={summary.counts.organizations}
          />
          <CountTile
            icon={UsersRound}
            label="Invited Users"
            value={summary.counts.invitedUsers}
          />
          <CountTile
            icon={ShieldCheck}
            label="App Users"
            value={summary.counts.appUsers}
          />
          <CountTile
            icon={Flag}
            label="Feature Flags"
            value={summary.counts.featureFlags}
          />
        </section>

        <section className="mt-6 grid gap-6 lg:grid-cols-[1fr_0.9fr]">
          <div className="glass-panel p-5 sm:p-6">
            <div className="flex items-center gap-3">
              <div className="icon-well text-emerald-700">
                <ClipboardCheck className="size-5" />
              </div>
              <div>
                <p className="text-sm font-medium text-muted-foreground">
                  Verification
                </p>
                <h2 className="accent-title text-xl font-semibold">
                  Day 1 checks
                </h2>
              </div>
            </div>
            <div className="mt-5 space-y-3">
              {summary.checks.map((check) => (
                <CheckRow key={check.label} check={check} />
              ))}
            </div>
          </div>

          <aside className="glass-panel p-5 sm:p-6">
            <div className="flex items-center gap-3">
              <div className="icon-well text-blue-700">
                <Database className="size-5" />
              </div>
              <div>
                <p className="text-sm font-medium text-muted-foreground">
                  Tenant
                </p>
                <h2 className="text-xl font-semibold">
                  {user.organization?.name ?? "Unknown"}
                </h2>
              </div>
            </div>
            <div className="mt-5 space-y-3 text-sm">
              <InfoRow label="Current user" value={user.full_name} />
              <InfoRow label="Email" value={user.email} />
              <InfoRow label="Role" value={formatLabel(user.role)} />
              <InfoRow
                label="Organization ID"
                value={user.organization_id}
                mono
              />
            </div>
          </aside>
        </section>

        <section className="mt-6 glass-panel p-5 sm:p-6">
          <div className="flex items-center gap-3">
            <div className="icon-well text-slate-700">
              <Flag className="size-5" />
            </div>
            <div>
              <p className="text-sm font-medium text-muted-foreground">
                Visible Through User Session
              </p>
              <h2 className="text-xl font-semibold">Feature flags</h2>
            </div>
          </div>
          <div className="mt-5 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {summary.featureFlags.map((flag) => (
              <div
                key={flag.feature_name}
                className="soft-row flex items-center justify-between gap-3 px-4 py-3"
              >
                <span className="min-w-0 truncate text-sm font-medium">
                  {formatLabel(flag.feature_name)}
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
        </section>
      </div>
    </main>
  );
}

function CountTile({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Building2;
  label: string;
  value: number;
}) {
  return (
    <div className="glass-tile min-h-36 p-5">
      <Icon className="size-5 text-foreground" />
      <p className="mt-5 text-xs font-medium uppercase text-muted-foreground">
        {label}
      </p>
      <p className="mt-2 text-3xl font-semibold">{value}</p>
    </div>
  );
}

function CheckRow({ check }: { check: SystemCheck }) {
  const Icon = check.status === "pass" ? BadgeCheck : TriangleAlert;
  const tone =
    check.status === "pass"
      ? "bg-emerald-50 text-emerald-700 ring-emerald-100"
      : check.status === "warn"
        ? "bg-amber-50 text-amber-700 ring-amber-100"
        : "bg-rose-50 text-rose-700 ring-rose-100";

  return (
    <div className="soft-row p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Icon className="size-4 text-foreground" />
          <h3 className="text-sm font-semibold">{check.label}</h3>
        </div>
        <span className={`soft-chip ${tone}`}>
          {check.status}
        </span>
      </div>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">
        {check.detail}
      </p>
    </div>
  );
}

function InfoRow({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="soft-row px-4 py-3">
      <p className="text-xs font-medium uppercase text-muted-foreground">
        {label}
      </p>
      <p
        className={`mt-1 break-words font-semibold ${
          mono ? "font-mono text-xs" : "text-sm"
        }`}
      >
        {value}
      </p>
    </div>
  );
}

function formatLabel(value: string) {
  return value
    .split("_")
    .map((part) => part[0]?.toUpperCase() + part.slice(1))
    .join(" ");
}
