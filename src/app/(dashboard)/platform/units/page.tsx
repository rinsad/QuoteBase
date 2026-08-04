import Link from "next/link";
import { redirect } from "next/navigation";
import { Database, Save, X } from "lucide-react";

import { saveUnitCatalogEntry } from "@/app/(dashboard)/platform/units/actions";
import { AdminNav } from "@/components/app-nav";
import { Button } from "@/components/ui/button";
import {
  getPlatformUnitCatalog,
  UNIT_CALCULATION_BASES,
  type UnitCatalogEntry,
} from "@/lib/admin/units";
import { getCurrentUser } from "@/lib/auth/current-user";

const measurementSystems = ["us", "metric", "custom"] as const;
const quoteQuantityBases = ["ton", "cy", "load", "count", "none"] as const;

export default async function PlatformUnitsPage({
  searchParams,
}: {
  searchParams: Promise<{ edit?: string; saved?: string }>;
}) {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/login");
  }

  if (user.role !== "platform_admin") {
    redirect("/dashboard");
  }

  const [params, units] = await Promise.all([
    searchParams,
    getPlatformUnitCatalog(),
  ]);
  const editing =
    params.edit && params.edit !== "new"
      ? (units.find((unit) => unit.id === params.edit) ?? null)
      : null;
  const showEditor = params.edit === "new" || Boolean(editing);

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
                  Platform
                </p>
                <h1 className="truncate text-lg font-semibold">Unit Catalog</h1>
              </div>
            </div>
            <AdminNav role={user.role} />
          </div>
        </header>

        {params.saved ? (
          <div className="mt-6 rounded-[20px] border border-emerald-100 bg-emerald-50/80 px-5 py-4 text-sm font-medium text-emerald-800 shadow-sm">
            Unit catalog saved.
          </div>
        ) : null}

        <section className="mt-6 glass-panel p-6 sm:p-8">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div className="flex items-center gap-3">
              <div className="icon-well text-blue-700">
                <Database className="size-6" />
              </div>
              <div>
                <p className="text-sm font-medium text-muted-foreground">
                  Global Catalog
                </p>
                <h2 className="accent-title text-3xl font-semibold tracking-normal">
                  {units.length} canonical units
                </h2>
              </div>
            </div>
            <Link
              href="/platform/units?edit=new"
              className="mac-button-primary h-10 px-4"
            >
              New catalog unit
            </Link>
          </div>
        </section>

        <section className="mt-6 glass-panel overflow-hidden">
          <div className="master-table-head lg:grid-cols-[120px_1fr_130px_120px_130px_1fr_100px_90px] lg:gap-4">
            <span>Code</span>
            <span>Label</span>
            <span>Basis</span>
            <span>System</span>
            <span>Quote basis</span>
            <span>Aliases</span>
            <span>Status</span>
            <span>Action</span>
          </div>
          <div className="divide-y divide-border">
            {units.map((unit) => (
              <CatalogUnitRow
                key={unit.id}
                unit={unit}
                selected={editing?.id === unit.id}
              />
            ))}
          </div>
        </section>

        <CatalogUnitSlideOver unit={editing} open={showEditor} />
      </div>
    </main>
  );
}

function CatalogUnitRow({
  unit,
  selected,
}: {
  unit: UnitCatalogEntry;
  selected: boolean;
}) {
  return (
    <Link
      href={`/platform/units?edit=${unit.id}`}
      className={`grid gap-3 px-4 py-4 transition hover:bg-secondary/70 lg:grid-cols-[120px_1fr_130px_120px_130px_1fr_100px_90px] lg:items-center lg:gap-4 ${
        selected ? "bg-secondary" : ""
      }`}
    >
      <p className="font-mono text-sm font-semibold">{unit.code}</p>
      <div className="min-w-0">
        <h3 className="truncate text-sm font-semibold">{unit.label}</h3>
        <p className="mt-1 truncate text-xs text-muted-foreground">
          Plural: {unit.plural_label}
        </p>
      </div>
      <p className="text-sm capitalize">{unit.calculation_basis}</p>
      <p className="text-sm uppercase">{unit.measurement_system}</p>
      <p className="text-sm">
        {unit.quote_quantity_basis === "none"
          ? "None"
          : `${unit.quote_quantity_factor ?? 1} ${unit.quote_quantity_basis}`}
      </p>
      <p className="truncate text-xs text-muted-foreground">
        {unit.aliases.length ? unit.aliases.join(", ") : "No aliases"}
      </p>
      <span
        className={`soft-chip w-fit shrink-0 ${
          unit.is_active
            ? "bg-emerald-50 text-emerald-700 ring-emerald-100"
            : "bg-slate-100 text-slate-600 ring-slate-200"
        }`}
      >
        {unit.is_active ? "Active" : "Inactive"}
      </span>
      <span className="mac-link h-9 justify-center px-3 text-xs">Edit</span>
    </Link>
  );
}

function CatalogUnitSlideOver({
  unit,
  open,
}: {
  unit: UnitCatalogEntry | null;
  open: boolean;
}) {
  if (!open) {
    return null;
  }

  return (
    <aside className="customer-slide-over" aria-label="Catalog unit editor">
      <Link
        href="/platform/units"
        className="customer-slide-backdrop"
        aria-label="Close catalog unit editor"
      />
      <div className="customer-slide-panel">
        <div className="slide-panel-header">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-medium text-muted-foreground">
                {unit ? "Edit catalog unit" : "New catalog unit"}
              </p>
              <h2 className="mt-1 truncate text-2xl font-semibold">
                Canonical unit
              </h2>
              <p className="mt-1 truncate text-sm text-muted-foreground">
                Tenant admins can choose active catalog units.
              </p>
            </div>
            <Link
              href="/platform/units"
              className="mac-link size-9 shrink-0 px-0"
              aria-label="Close catalog unit editor"
            >
              <X className="size-4" />
            </Link>
          </div>
        </div>

        <form action={saveUnitCatalogEntry} className="grid gap-4 p-4" noValidate>
          <input type="hidden" name="unit_id" value={unit?.id ?? ""} />
          <TextField name="code" label="Code" defaultValue={unit?.code ?? ""} />
          <TextField name="label" label="Singular label" defaultValue={unit?.label ?? ""} />
          <TextField
            name="plural_label"
            label="Plural label"
            defaultValue={unit?.plural_label ?? ""}
          />
          <SelectField
            name="calculation_basis"
            label="Calculation basis"
            options={UNIT_CALCULATION_BASES}
            defaultValue={unit?.calculation_basis ?? "other"}
          />
          <SelectField
            name="measurement_system"
            label="Measurement system"
            options={measurementSystems}
            defaultValue={unit?.measurement_system ?? "custom"}
          />
          <TextField
            name="aliases"
            label="Aliases"
            defaultValue={unit?.aliases.join(", ") ?? ""}
            required={false}
          />
          <SelectField
            name="quote_quantity_basis"
            label="Quote conversion basis"
            options={quoteQuantityBases}
            defaultValue={unit?.quote_quantity_basis ?? "none"}
          />
          <NumberField
            name="quote_quantity_factor"
            label="Factor to quote basis"
            defaultValue={unit?.quote_quantity_factor?.toString() ?? ""}
            required={false}
            step="0.00000001"
          />
          <NumberField
            name="sort_order"
            label="Sort order"
            defaultValue={unit?.sort_order?.toString() ?? "0"}
          />
          <label className="flex h-11 items-center gap-2 rounded-md bg-white/70 px-3 text-sm font-medium ring-1 ring-white/80">
            <input
              name="is_active"
              type="checkbox"
              defaultChecked={unit?.is_active ?? true}
              className="size-4"
            />
            Active
          </label>
          <Button type="submit" className="h-11 rounded-md">
            <Save className="size-4" />
            Save catalog unit
          </Button>
        </form>
      </div>
    </aside>
  );
}

function TextField({
  name,
  label,
  defaultValue,
  required = true,
}: {
  name: string;
  label: string;
  defaultValue: string;
  required?: boolean;
}) {
  return (
    <label className="block">
      <span className="text-sm font-medium text-muted-foreground">{label}</span>
      <input
        name={name}
        type="text"
        defaultValue={defaultValue}
        className="soft-control mt-2 w-full"
        required={required}
      />
    </label>
  );
}

function SelectField<T extends string>({
  name,
  label,
  options,
  defaultValue,
}: {
  name: string;
  label: string;
  options: readonly T[];
  defaultValue: T;
}) {
  return (
    <label className="block">
      <span className="text-sm font-medium text-muted-foreground">{label}</span>
      <select
        name={name}
        defaultValue={defaultValue}
        className="soft-control mt-2 w-full"
        required
      >
        {options.map((option) => (
          <option key={option} value={option}>
            {option
              .split("_")
              .map((part) => part[0]?.toUpperCase() + part.slice(1))
              .join(" ")}
          </option>
        ))}
      </select>
    </label>
  );
}

function NumberField({
  name,
  label,
  defaultValue,
  required = false,
  step = "1",
}: {
  name: string;
  label: string;
  defaultValue: string;
  required?: boolean;
  step?: string;
}) {
  return (
    <label className="block">
      <span className="text-sm font-medium text-muted-foreground">{label}</span>
      <input
        name={name}
        type="number"
        step={step}
        defaultValue={defaultValue}
        className="soft-control mt-2 w-full"
        required={required}
      />
    </label>
  );
}
