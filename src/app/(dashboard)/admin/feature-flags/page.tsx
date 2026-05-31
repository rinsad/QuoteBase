import Link from "next/link";
import { redirect } from "next/navigation";
import { Flag, Save, ShieldCheck, ToggleLeft, ToggleRight } from "lucide-react";

import { updateFeatureFlag } from "@/app/(dashboard)/admin/feature-flags/actions";
import { Button } from "@/components/ui/button";
import { getAdminFeatureFlags } from "@/lib/admin/feature-flags";
import { getCurrentUser } from "@/lib/auth/current-user";

export default async function AdminFeatureFlagsPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string }>;
}) {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/login");
  }

  if (user.role !== "admin") {
    redirect("/dashboard");
  }

  const [params, flags] = await Promise.all([
    searchParams,
    getAdminFeatureFlags(user.organization_id),
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
                <h1 className="truncate text-lg font-semibold">
                  Feature Flags
                </h1>
              </div>
            </div>
            <div className="flex flex-wrap items-center justify-end gap-2">
              <Link href="/admin/material-prices" className="mac-link">
                Material prices
              </Link>
              <Link href="/admin/pricing" className="mac-link">
                Pricing
              </Link>
              <Link href="/admin/system-check" className="mac-link">
                System check
              </Link>
              <Link href="/dashboard" className="mac-link">
                Dashboard
              </Link>
            </div>
          </div>
        </header>

        {params.saved ? (
          <div className="mt-6 rounded-[20px] border border-emerald-100 bg-emerald-50/80 px-5 py-4 text-sm font-medium text-emerald-800 shadow-sm">
            Feature flag saved.
          </div>
        ) : null}

        <section className="mt-6 glass-panel p-5 sm:p-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div className="flex items-center gap-3">
              <div className="icon-well text-blue-700">
                <Flag className="size-6" />
              </div>
              <div>
                <p className="text-sm font-medium text-muted-foreground">
                  Tenant Controls
                </p>
                <h2 className="accent-title text-3xl font-semibold tracking-normal">
                  {flags.length} configurable flags
                </h2>
              </div>
            </div>
            <div className="flex items-center gap-2 rounded-full bg-blue-50 px-3 py-1.5 text-sm font-medium text-blue-700 ring-1 ring-blue-100">
              <ShieldCheck className="size-4" />
              Admin only
            </div>
          </div>
        </section>

        <section className="mt-6 grid gap-4 lg:grid-cols-2">
          {flags.map((flag) => (
            <form
              key={flag.id}
              action={updateFeatureFlag}
              className="glass-panel p-5 sm:p-6"
            >
              <input type="hidden" name="flag_id" value={flag.id} />
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <h3 className="break-words text-lg font-semibold">
                    {formatFeatureName(flag.feature_name)}
                  </h3>
                  <p className="mt-1 font-mono text-xs text-muted-foreground">
                    {flag.feature_name}
                  </p>
                </div>
                <label className="flex shrink-0 items-center gap-2 rounded-full bg-white/70 px-3 py-2 text-sm font-medium ring-1 ring-white/80">
                  <input
                    name="is_enabled"
                    type="checkbox"
                    defaultChecked={flag.is_enabled}
                    className="size-4"
                  />
                  {flag.is_enabled ? (
                    <ToggleRight className="size-4 text-emerald-700" />
                  ) : (
                    <ToggleLeft className="size-4 text-slate-500" />
                  )}
                  Enabled
                </label>
              </div>

              <label className="mt-5 block">
                <span className="text-sm font-medium text-muted-foreground">
                  Config JSON
                </span>
                <textarea
                  name="config"
                  rows={5}
                  defaultValue={formatConfig(flag.config)}
                  className="soft-control mt-2 w-full resize-none font-mono text-xs"
                  placeholder='{"key":"value"}'
                />
              </label>

              <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-xs text-muted-foreground">
                  Updated by {flag.updated_by?.full_name ?? "system"} on{" "}
                  {new Date(flag.updated_at).toLocaleDateString("en-US")}
                </p>
                <Button type="submit" className="h-10 rounded-full">
                  <Save className="size-4" />
                  Save
                </Button>
              </div>
            </form>
          ))}
        </section>
      </div>
    </main>
  );
}

function formatFeatureName(featureName: string) {
  return featureName
    .split("_")
    .map((part) => part[0]?.toUpperCase() + part.slice(1))
    .join(" ");
}

function formatConfig(config: unknown) {
  if (config === null || config === undefined) {
    return "";
  }

  return JSON.stringify(config, null, 2);
}
