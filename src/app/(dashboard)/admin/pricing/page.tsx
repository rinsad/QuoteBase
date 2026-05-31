import Link from "next/link";
import { redirect } from "next/navigation";
import { BadgeDollarSign, Save } from "lucide-react";

import { updatePricingConfig } from "@/app/(dashboard)/admin/pricing/actions";
import { Button } from "@/components/ui/button";
import { getAdminPricingConfig } from "@/lib/admin/pricing";
import { getCurrentUser } from "@/lib/auth/current-user";

const truckRateOptions = ["floor", "standard", "target", "premium", "stretch"];

export default async function AdminPricingPage({
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

  const [params, pricing] = await Promise.all([
    searchParams,
    getAdminPricingConfig(user.organization_id),
  ]);

  if (!pricing) {
    throw new Error("Pricing configuration is missing.");
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
                <h1 className="truncate text-lg font-semibold">
                  Pricing Configuration
                </h1>
              </div>
            </div>
            <div className="flex flex-wrap items-center justify-end gap-2">
              <Link href="/admin/material-prices" className="mac-link">
                Material prices
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
              <Link href="/admin/plants" className="mac-link">
                Materials
              </Link>
              <Link href="/dashboard" className="mac-link">
                Dashboard
              </Link>
            </div>
          </div>
        </header>

        {params.saved ? (
          <div className="mt-6 rounded-[20px] border border-emerald-100 bg-emerald-50/80 px-5 py-4 text-sm font-medium text-emerald-800 shadow-sm">
            Pricing configuration saved.
          </div>
        ) : null}

        <section className="mt-6 glass-panel p-6 sm:p-8">
          <div className="flex items-center gap-3">
            <div className="icon-well text-blue-700">
              <BadgeDollarSign className="size-6" />
            </div>
            <div>
              <p className="text-sm font-medium text-muted-foreground">
                Quote Engine
              </p>
              <h2 className="accent-title text-3xl font-semibold tracking-normal">
                DB-backed pricing controls
              </h2>
            </div>
          </div>
          <p className="mt-4 max-w-3xl text-sm leading-6 text-muted-foreground">
            These values feed draft quote calculations. Changes are scoped to
            the current organization and written to the audit log.
          </p>
        </section>

        <form action={updatePricingConfig} className="mt-6 space-y-6">
          <section className="glass-panel p-5 sm:p-6">
            <h2 className="text-xl font-semibold">Tier markups</h2>
            <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <RangeFields
                label="R1"
                minName="tier_r1_min"
                maxName="tier_r1_max"
                minValue={pricing.tier_r1_min}
                maxValue={pricing.tier_r1_max}
              />
              <RangeFields
                label="R2"
                minName="tier_r2_min"
                maxName="tier_r2_max"
                minValue={pricing.tier_r2_min}
                maxValue={pricing.tier_r2_max}
              />
              <RangeFields
                label="R3"
                minName="tier_r3_min"
                maxName="tier_r3_max"
                minValue={pricing.tier_r3_min}
                maxValue={pricing.tier_r3_max}
              />
              <RangeFields
                label="R4"
                minName="tier_r4_min"
                maxName="tier_r4_max"
                minValue={pricing.tier_r4_min}
                maxValue={pricing.tier_r4_max}
              />
            </div>
          </section>

          <section className="glass-panel p-5 sm:p-6">
            <h2 className="text-xl font-semibold">Trucking rates</h2>
            <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <MoneyField name="truck_floor_rate" label="Floor" value={pricing.truck_floor_rate} />
              <MoneyField name="truck_standard_rate" label="Standard" value={pricing.truck_standard_rate} />
              <MoneyField name="truck_target_rate" label="Target" value={pricing.truck_target_rate} />
              <MoneyField name="truck_premium_rate" label="Premium" value={pricing.truck_premium_rate} />
              <MoneyField name="truck_stretch_rate" label="Stretch" value={pricing.truck_stretch_rate} />
              <label className="block">
                <span className="text-sm font-medium text-muted-foreground">
                  Default rate
                </span>
                <select
                  name="default_truck_rate"
                  className="soft-control mt-2 w-full"
                  defaultValue={pricing.default_truck_rate}
                >
                  {truckRateOptions.map((option) => (
                    <option key={option} value={option}>
                      {formatLabel(option)}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </section>

          <section className="glass-panel p-5 sm:p-6">
            <h2 className="text-xl font-semibold">Minimums & fees</h2>
            <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <MoneyField name="material_minimum" label="Material minimum" value={pricing.material_minimum ?? 0} />
              <MoneyField name="trucking_minimum" label="Trucking minimum" value={pricing.trucking_minimum ?? 0} />
              <MoneyField name="fuel_surcharge_per_load" label="Fuel surcharge" value={pricing.fuel_surcharge_per_load} />
              <MoneyField name="environmental_fee_per_load" label="Environmental fee" value={pricing.environmental_fee_per_load} />
              <MoneyField name="overhead_per_ton" label="Overhead per ton" value={pricing.overhead_per_ton} />
              <MoneyField name="cc_surcharge_pct" label="CC surcharge %" value={pricing.cc_surcharge_pct ?? 0} />
            </div>
          </section>

          <div className="flex justify-end">
            <Button type="submit" className="h-11 rounded-full">
              <Save className="size-4" />
              Save pricing
            </Button>
          </div>
        </form>
      </div>
    </main>
  );
}

function RangeFields({
  label,
  minName,
  maxName,
  minValue,
  maxValue,
}: {
  label: string;
  minName: string;
  maxName: string;
  minValue: number;
  maxValue: number;
}) {
  return (
    <div className="soft-row p-4">
      <p className="text-sm font-semibold">{label}</p>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <NumberField name={minName} label="Min %" value={minValue} />
        <NumberField name={maxName} label="Max %" value={maxValue} />
      </div>
    </div>
  );
}

function MoneyField({
  name,
  label,
  value,
}: {
  name: string;
  label: string;
  value: number;
}) {
  return <NumberField name={name} label={label} value={value} />;
}

function NumberField({
  name,
  label,
  value,
}: {
  name: string;
  label: string;
  value: number;
}) {
  return (
    <label className="block">
      <span className="text-sm font-medium text-muted-foreground">{label}</span>
      <input
        name={name}
        type="number"
        min="0"
        step="0.01"
        defaultValue={value}
        className="soft-control mt-2 w-full"
        required
      />
    </label>
  );
}

function formatLabel(value: string) {
  return value
    .split("_")
    .map((part) => part[0]?.toUpperCase() + part.slice(1))
    .join(" ");
}
