import Link from "next/link";
import { redirect } from "next/navigation";
import { BadgeDollarSign, Save, X } from "lucide-react";

import { updatePricingConfig } from "@/app/(dashboard)/admin/pricing/actions";
import { AdminNav } from "@/components/app-nav";
import { Button } from "@/components/ui/button";
import {
  getAdminPricingConfig,
  type AdminPricingConfig,
} from "@/lib/admin/pricing";
import { getCurrentUser } from "@/lib/auth/current-user";

const defaultTruckRateOptions = ["standard", "target", "premium", "stretch"];

export default async function AdminPricingPage({
  searchParams,
}: {
  searchParams: Promise<{ edit?: string; saved?: string }>;
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
                  Pricing Rules
                </h1>
              </div>
            </div>
            <AdminNav />
          </div>
        </header>

        {params.saved ? (
          <div className="mt-6 rounded-[20px] border border-emerald-100 bg-emerald-50/80 px-5 py-4 text-sm font-medium text-emerald-800 shadow-sm">
            Pricing rules saved.
          </div>
        ) : null}

        <section className="mt-6 glass-panel p-6 sm:p-8">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div className="flex items-center gap-3">
              <div className="icon-well text-blue-700">
                <BadgeDollarSign className="size-6" />
              </div>
              <div>
              <p className="text-sm font-medium text-muted-foreground">
                Quote Engine
              </p>
              <h2 className="accent-title text-3xl font-semibold tracking-normal">
                Pricing rules
              </h2>
              </div>
            </div>
            <Link href="/admin/pricing?edit=rules" className="mac-button-primary h-10 px-4">
              Edit pricing
            </Link>
          </div>
          <p className="mt-4 max-w-3xl text-sm leading-6 text-muted-foreground">
            These values control draft quote calculations for this organization.
            Every change is recorded in the audit log.
          </p>
        </section>

        <section className="mt-6 glass-panel overflow-hidden">
          <div className="master-table-head lg:grid-cols-[1fr_1fr_1fr_100px] lg:gap-4">
            <span>Rule</span>
            <span>Value</span>
            <span>Group</span>
            <span>Action</span>
          </div>
          <div className="divide-y divide-border">
            <PricingSummaryRow
              label="R1 markup"
              value={`${formatMoney(pricing.tier_r1_min)}-${formatMoney(pricing.tier_r1_max)}`}
              group="Tier markups"
            />
            <PricingSummaryRow
              label="R2 markup"
              value={`${formatMoney(pricing.tier_r2_min)}-${formatMoney(pricing.tier_r2_max)}`}
              group="Tier markups"
            />
            <PricingSummaryRow
              label="R3 markup"
              value={`${formatMoney(pricing.tier_r3_min)}-${formatMoney(pricing.tier_r3_max)}`}
              group="Tier markups"
            />
            <PricingSummaryRow
              label="R4 markup"
              value={`${formatMoney(pricing.tier_r4_min)}-${formatMoney(pricing.tier_r4_max)}`}
              group="Tier markups"
            />
            <PricingSummaryRow
              label="Default truck rate"
              value={formatLabel(pricing.default_truck_rate)}
              group="Trucking"
            />
            <PricingSummaryRow
              label="Material minimum"
              value={formatMoney(pricing.material_minimum ?? 0)}
              group="Minimums and fees"
            />
            <PricingSummaryRow
              label="Trucking minimum"
              value={formatMoney(pricing.trucking_minimum ?? 0)}
              group="Minimums and fees"
            />
            <PricingSummaryRow
              label="Fuel surcharge"
              value={formatMoney(pricing.fuel_surcharge_per_load)}
              group="Minimums and fees"
            />
            <PricingSummaryRow
              label="Environmental fee"
              value={formatMoney(pricing.environmental_fee_per_load)}
              group="Minimums and fees"
            />
            <PricingSummaryRow
              label="Overhead per ton"
              value={formatMoney(pricing.overhead_per_ton)}
              group="Minimums and fees"
            />
            <PricingSummaryRow
              label="Auto-send follow-ups"
              value={pricing.follow_up_auto_send_enabled ? "Enabled" : "Disabled"}
              group="Follow-up agent"
            />
            <PricingSummaryRow
              label="SMS follow-up drafts"
              value={pricing.follow_up_sms_enabled ? "Enabled" : "Disabled"}
              group="Follow-up agent"
            />
            <PricingSummaryRow
              label="Project status options"
              value={(pricing.project_status_options ?? [])
                .map((option) => option.label)
                .join(", ")}
              group="Quote intake"
            />
          </div>
        </section>

        <PricingRulesSlideOver pricing={pricing} open={params.edit === "rules"} />
      </div>
    </main>
  );
}

function PricingRulesSlideOver({
  pricing,
  open,
}: {
  pricing: AdminPricingConfig;
  open: boolean;
}) {
  if (!open) {
    return null;
  }

  return (
    <aside className="customer-slide-over" aria-label="Pricing rules editor">
      <Link
        href="/admin/pricing"
        className="customer-slide-backdrop"
        aria-label="Close pricing rules editor"
      />
      <div className="customer-slide-panel">
        <div className="slide-panel-header">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-medium text-muted-foreground">
                Edit pricing
              </p>
              <h2 className="mt-1 truncate text-2xl font-semibold">
                Pricing rules
              </h2>
              <p className="mt-1 truncate text-sm text-muted-foreground">
                Quote engine markups, trucking, minimums, and fees.
              </p>
            </div>
            <Link
              href="/admin/pricing"
              className="mac-link size-9 shrink-0 px-0"
              aria-label="Close pricing rules editor"
            >
              <X className="size-4" />
            </Link>
          </div>
        </div>

        <form action={updatePricingConfig} className="space-y-5 p-4" noValidate>
          <input
            type="hidden"
            name="big_quote_threshold"
            value={pricing.big_quote_threshold ?? 10000}
          />
          <input
            type="hidden"
            name="jobs_starting_soon_days"
            value={pricing.jobs_starting_soon_days ?? 14}
          />
          <input
            type="hidden"
            name="default_followup_max_attempts"
            value={pricing.default_followup_max_attempts ?? 5}
          />
          <section className="soft-row p-4">
            <h3 className="text-sm font-semibold">Tier dollar markups</h3>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
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

          <section className="soft-row p-4">
            <h3 className="text-sm font-semibold">Trucking rates</h3>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <MoneyField name="truck_floor_rate" label="Floor $/hr" value={pricing.truck_floor_rate} />
              <MoneyField name="truck_standard_rate" label="Standard $/hr" value={pricing.truck_standard_rate} />
              <MoneyField name="truck_target_rate" label="Target $/hr" value={pricing.truck_target_rate} />
              <MoneyField name="truck_premium_rate" label="Premium $/hr" value={pricing.truck_premium_rate} />
              <MoneyField name="truck_stretch_rate" label="Stretch $/hr" value={pricing.truck_stretch_rate} />
              <label className="block">
                <span className="text-sm font-medium text-muted-foreground">
                  Default rate
                </span>
                <select
                  name="default_truck_rate"
                  className="soft-control mt-2 w-full"
                  defaultValue={pricing.default_truck_rate}
                >
                  {defaultTruckRateOptions.map((option) => (
                    <option key={option} value={option}>
                      {formatLabel(option)}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </section>

          <section className="soft-row p-4">
            <h3 className="text-sm font-semibold">Minimums and fees</h3>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <MoneyField name="material_minimum" label="Material minimum" value={pricing.material_minimum ?? 0} />
              <MoneyField name="trucking_minimum" label="Trucking minimum" value={pricing.trucking_minimum ?? 0} />
              <MoneyField name="fuel_surcharge_per_load" label="Fuel surcharge" value={pricing.fuel_surcharge_per_load} />
              <MoneyField name="environmental_fee_per_load" label="Environmental fee" value={pricing.environmental_fee_per_load} />
              <MoneyField name="overhead_per_ton" label="Overhead per ton" value={pricing.overhead_per_ton} />
              <MoneyField name="cc_surcharge_pct" label="CC surcharge %" value={pricing.cc_surcharge_pct ?? 0} />
            </div>
            <div className="mt-4 grid gap-3">
              <CheckboxField
                name="follow_up_auto_send_enabled"
                label="Auto-send eligible email follow-ups"
                defaultChecked={Boolean(pricing.follow_up_auto_send_enabled)}
              />
              <CheckboxField
                name="follow_up_sms_enabled"
                label="Create SMS follow-up drafts when email is missing"
                defaultChecked={Boolean(pricing.follow_up_sms_enabled)}
              />
            </div>
          </section>

          <section className="soft-row p-4">
            <h3 className="text-sm font-semibold">Quote intake options</h3>
            <label className="mt-4 block">
              <span className="text-sm font-medium text-muted-foreground">
                Project status options
              </span>
              <textarea
                name="project_status_options"
                className="soft-control mt-2 min-h-32 w-full resize-y py-3"
                defaultValue={(pricing.project_status_options ?? [])
                  .map((option) => option.label)
                  .join("\n")}
                placeholder={"Bid\nExisting job"}
              />
              <span className="mt-2 block text-xs leading-5 text-muted-foreground">
                One option per line. QuoteBase stores stable slugs from these
                labels, so other industries can use their own quote categories.
              </span>
            </label>
          </section>

          <Button type="submit" className="h-11 w-full rounded-md">
            <Save className="size-4" />
            Save pricing
          </Button>
        </form>
      </div>
    </aside>
  );
}

function PricingSummaryRow({
  label,
  value,
  group,
}: {
  label: string;
  value: string;
  group: string;
}) {
  return (
    <Link
      href="/admin/pricing?edit=rules"
      className="grid gap-3 px-4 py-4 transition hover:bg-secondary/70 lg:grid-cols-[1fr_1fr_1fr_100px] lg:items-center lg:gap-4"
    >
      <p className="text-sm font-semibold">{label}</p>
      <p className="font-mono text-sm font-semibold">{value}</p>
      <p className="text-sm text-muted-foreground">{group}</p>
      <span className="mac-link h-9 justify-center px-3 text-xs">Edit</span>
    </Link>
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
        <NumberField name={minName} label="Min $/unit" value={minValue} />
        <NumberField name={maxName} label="Max $/unit" value={maxValue} />
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
  min = 0,
  max,
  step = 0.01,
}: {
  name: string;
  label: string;
  value: number;
  min?: number;
  max?: number;
  step?: number;
}) {
  return (
    <label className="block">
      <span className="text-sm font-medium text-muted-foreground">{label}</span>
      <input
        name={name}
        type="number"
        min={min}
        max={max}
        step={step}
        defaultValue={value}
        className="soft-control mt-2 w-full"
        required
      />
    </label>
  );
}

function CheckboxField({
  name,
  label,
  defaultChecked,
}: {
  name: string;
  label: string;
  defaultChecked: boolean;
}) {
  return (
    <label className="flex items-center gap-3 rounded-xl bg-white/70 px-3 py-3 text-sm font-medium ring-1 ring-white/80">
      <input
        name={name}
        type="checkbox"
        defaultChecked={defaultChecked}
        className="size-4"
      />
      {label}
    </label>
  );
}

function formatLabel(value: string) {
  return value
    .split("_")
    .map((part) => part[0]?.toUpperCase() + part.slice(1))
    .join(" ");
}

function formatMoney(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(value);
}
