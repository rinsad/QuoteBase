import Link from "next/link";
import { redirect } from "next/navigation";
import { Ruler, Save, X } from "lucide-react";

import {
  saveOrganizationUnit,
  setOrganizationUnitActive,
} from "@/app/(dashboard)/admin/units/actions";
import { AdminNav } from "@/components/app-nav";
import { Button } from "@/components/ui/button";
import {
  getAdminUnits,
  type AdminUnit,
} from "@/lib/admin/units";
import { getCurrentUser } from "@/lib/auth/current-user";

export default async function AdminUnitsPage({
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

  const [params, units] = await Promise.all([
    searchParams,
    getAdminUnits(user.organization_id),
  ]);
  const editing =
    params.edit && params.edit !== "new"
      ? (units.find((unit) => unit.id === params.edit) ?? null)
      : null;
  const showEditor = params.edit === "new" || Boolean(editing);
  const activeUnitCount = units.filter((unit) => unit.is_active).length;

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
                <h1 className="truncate text-lg font-semibold">Units</h1>
              </div>
            </div>
            <AdminNav />
          </div>
        </header>

        {params.saved ? (
          <div className="mt-6 rounded-[20px] border border-emerald-100 bg-emerald-50/80 px-5 py-4 text-sm font-medium text-emerald-800 shadow-sm">
            Unit settings saved.
          </div>
        ) : null}

        <section className="mt-6 glass-panel p-6 sm:p-8">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div className="flex items-center gap-3">
              <div className="icon-well text-blue-700">
                <Ruler className="size-6" />
              </div>
              <div>
                <p className="text-sm font-medium text-muted-foreground">
                  Tenant Settings
                </p>
                <h2 className="accent-title text-3xl font-semibold tracking-normal">
                  {activeUnitCount} active units
                </h2>
              </div>
            </div>
            <Link href="/admin/units?edit=new" className="mac-button-primary h-10 px-4">
              New unit
            </Link>
          </div>
        </section>

        <section className="mt-6 glass-panel overflow-hidden">
          <div className="master-table-head lg:grid-cols-[120px_1fr_160px_110px_110px_150px] lg:gap-4">
            <span>Code</span>
            <span>Label</span>
            <span>Basis</span>
            <span>Order</span>
            <span>Status</span>
            <span>Actions</span>
          </div>

          <div className="divide-y divide-border">
            {units.map((unit) => (
              <UnitRow
                key={unit.id}
                unit={unit}
                selected={editing?.id === unit.id}
              />
            ))}
          </div>
        </section>

        <UnitSlideOver unit={editing} open={showEditor} />
      </div>
    </main>
  );
}

function UnitRow({
  unit,
  selected,
}: {
  unit: AdminUnit;
  selected: boolean;
}) {
  return (
    <div
      className={`grid gap-3 px-4 py-4 transition hover:bg-secondary/70 lg:grid-cols-[120px_1fr_160px_110px_110px_150px] lg:items-center lg:gap-4 ${
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
      <p className="font-mono text-sm">{unit.sort_order}</p>
      <span
        className={`soft-chip w-fit shrink-0 ${
          unit.is_active
            ? "bg-emerald-50 text-emerald-700 ring-emerald-100"
            : "bg-slate-100 text-slate-600 ring-slate-200"
        }`}
      >
        {unit.is_active ? "Active" : "Inactive"}
      </span>
      <div className="flex flex-wrap gap-2">
        <Link
          href={`/admin/units?edit=${unit.id}`}
          className="mac-link h-9 justify-center px-3 text-xs"
        >
          Edit
        </Link>
        <form action={setOrganizationUnitActive}>
          <input type="hidden" name="unit_id" value={unit.id} />
          <input
            type="hidden"
            name="is_active"
            value={unit.is_active ? "false" : "true"}
          />
          <button type="submit" className="mac-link h-9 px-3 text-xs">
            {unit.is_active ? "Deactivate" : "Activate"}
          </button>
        </form>
      </div>
    </div>
  );
}

function UnitSlideOver({
  unit,
  open,
}: {
  unit: AdminUnit | null;
  open: boolean;
}) {
  if (!open) {
    return null;
  }

  return (
    <aside className="customer-slide-over" aria-label="Unit editor">
      <Link
        href="/admin/units"
        className="customer-slide-backdrop"
        aria-label="Close unit editor"
      />
      <div className="customer-slide-panel">
        <div className="slide-panel-header">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-medium text-muted-foreground">
                {unit ? "Edit unit" : "New unit"}
              </p>
              <h2 className="mt-1 truncate text-2xl font-semibold">
                Calculation unit
              </h2>
              <p className="mt-1 truncate text-sm text-muted-foreground">
                Used by material pricing, quantities, imports, and quote math.
              </p>
            </div>
            <Link
              href="/admin/units"
              className="mac-link size-9 shrink-0 px-0"
              aria-label="Close unit editor"
            >
              <X className="size-4" />
            </Link>
          </div>
        </div>

        <form action={saveOrganizationUnit} className="grid gap-4 p-4" noValidate>
          <input type="hidden" name="unit_id" value={unit?.id ?? ""} />
          <TextField
            name="code"
            label="Unit value"
            defaultValue={unit?.code ?? ""}
          />
          <TextField
            name="label"
            label="Unit label"
            defaultValue={unit?.label ?? ""}
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
            Save unit
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

function NumberField({
  name,
  label,
  defaultValue,
}: {
  name: string;
  label: string;
  defaultValue: string;
}) {
  return (
    <label className="block">
      <span className="text-sm font-medium text-muted-foreground">{label}</span>
      <input
        name={name}
        type="number"
        step="1"
        defaultValue={defaultValue}
        className="soft-control mt-2 w-full"
      />
    </label>
  );
}
