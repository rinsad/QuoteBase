import { redirect } from "next/navigation";
import { Save, Settings2 } from "lucide-react";

import { updateTenantSettings } from "@/app/(dashboard)/admin/settings/actions";
import { AdminNav } from "@/components/app-nav";
import { Button } from "@/components/ui/button";
import { getAdminPricingConfig } from "@/lib/admin/pricing";
import { getCurrentUser } from "@/lib/auth/current-user";

export default async function AdminSettingsPage({
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

  const [params, settings] = await Promise.all([
    searchParams,
    getAdminPricingConfig(user.organization_id),
  ]);

  if (!settings) {
    throw new Error("Tenant configuration is missing.");
  }

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
                <h1 className="truncate text-lg font-semibold">Settings</h1>
              </div>
            </div>
            <AdminNav />
          </div>
        </header>

        {params.saved ? (
          <div className="mt-6 rounded-[20px] border border-emerald-100 bg-emerald-50/80 px-5 py-4 text-sm font-medium text-emerald-800 shadow-sm">
            Tenant settings saved.
          </div>
        ) : null}

        <section className="mt-6 glass-panel p-6 sm:p-8">
          <div className="flex items-center gap-3">
            <div className="icon-well text-primary">
              <Settings2 className="size-6" />
            </div>
            <div>
              <p className="text-sm font-medium text-muted-foreground">
                Tenant configuration
              </p>
              <h2 className="accent-title text-3xl font-semibold tracking-normal">
                Quote and dashboard rules
              </h2>
            </div>
          </div>
          <p className="mt-4 max-w-3xl text-sm leading-6 text-muted-foreground">
            These values apply only to{" "}
            {user.organization?.name ?? "this organization"} and control quote
            follow-up behavior and dashboard highlighting.
          </p>
        </section>

        <form action={updateTenantSettings} className="mt-6 glass-panel p-6 sm:p-8">
          <div className="grid gap-5 md:grid-cols-3">
            <SettingField
              name="big_quote_threshold"
              label="Big quote threshold"
              description="Open quotes at or above this amount appear under Big Quotes."
              value={settings.big_quote_threshold ?? 10000}
              min={0.01}
              step={0.01}
              prefix="$"
            />
            <SettingField
              name="jobs_starting_soon_days"
              label="Jobs starting soon window"
              description="Jobs beginning within this many days appear under Jobs Starting Soon."
              value={settings.jobs_starting_soon_days ?? 14}
              min={1}
              max={120}
              step={1}
              suffix="days"
            />
            <SettingField
              name="default_followup_max_attempts"
              label="Follow-up attempts"
              description="Sets the maximum automated follow-up attempts for this organization."
              value={settings.default_followup_max_attempts ?? 5}
              min={1}
              max={5}
              step={1}
              suffix="attempts"
            />
          </div>
          <div className="mt-6 flex justify-end">
            <Button type="submit" className="h-11 rounded-full px-6">
              <Save className="size-4" />
              Save settings
            </Button>
          </div>
        </form>
      </div>
    </main>
  );
}

function SettingField({
  name,
  label,
  description,
  value,
  min,
  max,
  step,
  prefix,
  suffix,
}: {
  name: string;
  label: string;
  description: string;
  value: number;
  min: number;
  max?: number;
  step: number;
  prefix?: string;
  suffix?: string;
}) {
  return (
    <label className="soft-row block p-5">
      <span className="text-sm font-semibold">{label}</span>
      <span className="mt-1 block text-xs leading-5 text-muted-foreground">
        {description}
      </span>
      <span className="soft-input mt-4">
        {prefix ? (
          <span className="text-sm text-muted-foreground">{prefix}</span>
        ) : null}
        <input
          name={name}
          type="number"
          defaultValue={value}
          min={min}
          max={max}
          step={step}
          className="min-w-0 flex-1 bg-transparent font-mono text-sm outline-none"
          required
        />
        {suffix ? (
          <span className="text-sm text-muted-foreground">{suffix}</span>
        ) : null}
      </span>
    </label>
  );
}
