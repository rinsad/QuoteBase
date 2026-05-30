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
    <main className="min-h-screen bg-[radial-gradient(circle_at_top_left,#ffffff_0,#f6f7f9_38%,#edf1f5_100%)] px-4 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto w-full max-w-6xl">
        <header className="glass-panel flex min-h-16 items-center justify-between px-4 sm:px-5">
          <div>
            <p className="text-sm font-medium text-muted-foreground">
              Admin
            </p>
            <h1 className="text-lg font-semibold">System Check</h1>
          </div>
          <Link
            href="/dashboard"
            className="inline-flex h-8 items-center justify-center rounded-2xl border border-border bg-background px-2.5 text-sm font-medium shadow-sm transition hover:bg-muted"
          >
            Dashboard
          </Link>
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
              <div className="rounded-2xl bg-emerald-50 p-2 text-emerald-700 ring-1 ring-emerald-100">
                <ClipboardCheck className="size-5" />
              </div>
              <div>
                <p className="text-sm font-medium text-muted-foreground">
                  Verification
                </p>
                <h2 className="text-xl font-semibold">Day 1 checks</h2>
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
              <div className="rounded-2xl bg-blue-50 p-2 text-blue-700 ring-1 ring-blue-100">
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
            <div className="rounded-2xl bg-slate-100 p-2 text-slate-700 ring-1 ring-slate-200">
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
                className="flex items-center justify-between gap-3 rounded-2xl border border-white/70 bg-white/60 px-4 py-3 shadow-sm"
              >
                <span className="min-w-0 truncate text-sm font-medium">
                  {formatLabel(flag.feature_name)}
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
    <div className="rounded-2xl border border-white/70 bg-white/60 p-4 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Icon className="size-4 text-foreground" />
          <h3 className="text-sm font-semibold">{check.label}</h3>
        </div>
        <span className={`rounded-full px-2.5 py-1 text-xs font-medium ring-1 ${tone}`}>
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
    <div className="rounded-2xl border border-white/70 bg-white/60 px-4 py-3 shadow-sm">
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
