import Link from "next/link";
import { redirect } from "next/navigation";
import { Save, Truck, X } from "lucide-react";

import { saveVehicleType } from "@/app/(dashboard)/admin/vehicle-types/actions";
import { AdminNav } from "@/components/app-nav";
import { Button } from "@/components/ui/button";
import {
  getAdminVehicleTypes,
  type AdminVehicleType,
} from "@/lib/admin/vehicle-types";
import { getCurrentUser } from "@/lib/auth/current-user";

export default async function AdminVehicleTypesPage({
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

  const [params, vehicleTypes] = await Promise.all([
    searchParams,
    getAdminVehicleTypes(user.organization_id),
  ]);
  const editing =
    params.edit && params.edit !== "new"
      ? (vehicleTypes.find((vehicle) => vehicle.id === params.edit) ?? null)
      : null;
  const showEditor = params.edit === "new" || Boolean(editing);

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
                  Vehicle Types
                </h1>
              </div>
            </div>
            <AdminNav />
          </div>
        </header>

        {params.saved ? (
          <div className="mt-6 rounded-[20px] border border-emerald-100 bg-emerald-50/80 px-5 py-4 text-sm font-medium text-emerald-800 shadow-sm">
            Vehicle type saved.
          </div>
        ) : null}

        <section className="mt-6">
          <section className="glass-panel overflow-hidden">
            <div className="slide-panel-header">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
              <div className="flex items-center gap-3">
                <div className="icon-well text-blue-700">
                  <Truck className="size-6" />
                </div>
                <div>
                <p className="text-sm font-medium text-muted-foreground">
                  Fleet
                </p>
                <h2 className="accent-title text-2xl font-semibold tracking-normal">
                  {vehicleTypes.length} vehicle types
                </h2>
                </div>
              </div>
              <Link
                href="/admin/vehicle-types?edit=new"
                className="mac-button-primary h-10 px-4"
              >
                New vehicle type
              </Link>
              </div>
            </div>

            <div className="master-table-head lg:grid-cols-[1fr_160px_160px_100px_90px] lg:gap-4">
              <span>Vehicle</span>
              <span>Capacity tons</span>
              <span>Capacity CY</span>
              <span>Status</span>
              <span>Action</span>
            </div>

            <div className="divide-y divide-border">
              {vehicleTypes.map((vehicle) => (
                <VehicleRow
                  key={vehicle.id}
                  vehicle={vehicle}
                  selected={editing?.id === vehicle.id}
                />
              ))}
            </div>
          </section>
        </section>
        <VehicleSlideOver vehicle={editing} open={showEditor} />
      </div>
    </main>
  );
}

function VehicleRow({
  vehicle,
  selected,
}: {
  vehicle: AdminVehicleType;
  selected: boolean;
}) {
  return (
    <Link
      href={`/admin/vehicle-types?edit=${vehicle.id}`}
      className={`grid gap-3 px-4 py-4 transition hover:bg-secondary/70 lg:grid-cols-[1fr_160px_160px_100px_90px] lg:items-center lg:gap-4 ${
        selected ? "bg-secondary" : ""
      }`}
    >
      <div className="min-w-0">
        <h3 className="truncate text-sm font-semibold">{vehicle.name}</h3>
        <p className="mt-1 text-xs text-muted-foreground lg:hidden">
          {vehicle.capacity_tons.toFixed(2)} tons
          {vehicle.capacity_cy ? ` / ${vehicle.capacity_cy.toFixed(2)} CY` : ""}
        </p>
      </div>
      <p className="font-mono text-sm">{vehicle.capacity_tons.toFixed(2)}</p>
      <p className="font-mono text-sm">
        {vehicle.capacity_cy ? vehicle.capacity_cy.toFixed(2) : "Not set"}
      </p>
      <span
        className={`soft-chip w-fit shrink-0 ${
          vehicle.is_active
            ? "bg-emerald-50 text-emerald-700 ring-emerald-100"
            : "bg-slate-100 text-slate-600 ring-slate-200"
        }`}
      >
        {vehicle.is_active ? "Active" : "Inactive"}
      </span>
      <span className="mac-link h-9 justify-center px-3 text-xs">Edit</span>
    </Link>
  );
}

function VehicleSlideOver({
  vehicle,
  open,
}: {
  vehicle: AdminVehicleType | null;
  open: boolean;
}) {
  if (!open) {
    return null;
  }

  return (
    <aside className="customer-slide-over" aria-label="Vehicle type editor">
      <Link
        href="/admin/vehicle-types"
        className="customer-slide-backdrop"
        aria-label="Close vehicle type editor"
      />
      <div className="customer-slide-panel">
        <div className="slide-panel-header">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-medium text-muted-foreground">
                {vehicle ? "Edit vehicle" : "New vehicle"}
              </p>
              <h2 className="mt-1 truncate text-2xl font-semibold">
                Load capacity
              </h2>
              <p className="mt-1 truncate text-sm text-muted-foreground">
                Capacity values used by quote load planning.
              </p>
            </div>
            <Link
              href="/admin/vehicle-types"
              className="mac-link size-9 shrink-0 px-0"
              aria-label="Close vehicle type editor"
            >
              <X className="size-4" />
            </Link>
          </div>
        </div>

        <form action={saveVehicleType} className="grid gap-4 p-4" noValidate>
          <input type="hidden" name="vehicle_type_id" value={vehicle?.id ?? ""} />
          <TextField name="name" label="Name" defaultValue={vehicle?.name ?? ""} />
          <NumberField
            name="capacity_tons"
            label="Capacity tons"
            defaultValue={vehicle?.capacity_tons?.toString() ?? ""}
            required
          />
          <NumberField
            name="capacity_cy"
            label="Capacity CY"
            defaultValue={vehicle?.capacity_cy?.toString() ?? ""}
          />
          <label className="flex h-11 items-center gap-2 rounded-md bg-white/70 px-3 text-sm font-medium ring-1 ring-white/80">
            <input
              name="is_active"
              type="checkbox"
              defaultChecked={vehicle?.is_active ?? true}
              className="size-4"
            />
            Active
          </label>
          <Button type="submit" className="h-11 rounded-md">
            <Save className="size-4" />
            Save vehicle
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
        type="text"
        defaultValue={defaultValue}
        className="soft-control mt-2 w-full"
        required
      />
    </label>
  );
}

function NumberField({
  name,
  label,
  defaultValue,
  required = false,
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
        type="number"
        min="0.01"
        step="0.01"
        defaultValue={defaultValue}
        className="soft-control mt-2 w-full"
        required={required}
      />
    </label>
  );
}
