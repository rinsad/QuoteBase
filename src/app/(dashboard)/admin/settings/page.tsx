import { redirect } from "next/navigation";
import Link from "next/link";
import { Save, Settings2, Truck } from "lucide-react";

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
                Organization settings
              </h2>
            </div>
          </div>
          <p className="mt-4 max-w-3xl text-sm leading-6 text-muted-foreground">
            These values apply only to{" "}
            {user.organization?.name ?? "this organization"} and control quote
            follow-up behavior, quote recommendations, and trucking profiles.
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
          <section className="mt-6 border-t border-border pt-6">
            <div>
              <h3 className="text-lg font-semibold">Material markup</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                Default percentage added to supplier material cost. It can be overridden while creating a quote.
              </p>
            </div>
            <div className="mt-4 max-w-sm">
              <SettingField
                name="default_material_markup_pct"
                label="Default material markup"
                description="Applied to each new material line unless the quote uses a different percentage."
                value={settings.default_material_markup_pct}
                min={0}
                max={500}
                step={0.01}
                suffix="%"
              />
            </div>
          </section>
          <section className="mt-6 border-t border-border pt-6">
            <div>
              <h3 className="text-lg font-semibold">Quote recommendations</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                Choose how many ranked supplier and plant options appear while building a quote.
              </p>
            </div>
            <label className="soft-row mt-4 block max-w-sm p-5">
              <span className="text-sm font-semibold">Best pricing options</span>
              <select
                name="quote_recommendation_count"
                defaultValue={String(settings.quote_recommendation_count ?? 3)}
                className="soft-control mt-4 w-full"
                required
              >
                <option value="3">3 best options</option>
                <option value="4">4 best options</option>
                <option value="5">5 best options</option>
              </select>
            </label>
          </section>
          <section className="mt-6 border-t border-border pt-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <h3 className="flex items-center gap-2 text-lg font-semibold">
                  <Truck className="size-5 text-primary" />
                  Trucking configuration
                </h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  Trucking profiles are assigned directly to individual materials.
                </p>
              </div>
              <Link href="/admin/trucking-profiles" className="mac-link h-10 px-4">
                Manage trucking profiles
              </Link>
            </div>
          </section>
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
