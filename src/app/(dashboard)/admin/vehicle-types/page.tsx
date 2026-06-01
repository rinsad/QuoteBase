import Link from "next/link";
import { redirect } from "next/navigation";
import { Save, Truck } from "lucide-react";

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
  const editing = vehicleTypes.find((vehicle) => vehicle.id === params.edit);

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

        <section className="mt-6 grid gap-6 lg:grid-cols-[0.8fr_1.2fr]">
          <form action={saveVehicleType} className="glass-panel p-5 sm:p-6">
            <div className="flex items-center gap-3">
              <div className="icon-well text-blue-700">
                <Truck className="size-6" />
              </div>
              <div>
                <p className="text-sm font-medium text-muted-foreground">
                  {editing ? "Edit Vehicle" : "New Vehicle"}
                </p>
                <h2 className="accent-title text-2xl font-semibold tracking-normal">
                  Load capacity
                </h2>
              </div>
            </div>

            <input
              type="hidden"
              name="vehicle_type_id"
              value={editing?.id ?? ""}
            />

            <div className="mt-6 grid gap-4 sm:grid-cols-2">
              <TextField
                name="name"
                label="Name"
                defaultValue={editing?.name ?? ""}
              />
              <NumberField
                name="capacity_tons"
                label="Capacity tons"
                defaultValue={editing?.capacity_tons?.toString() ?? ""}
                required
              />
              <NumberField
                name="capacity_cy"
                label="Capacity CY"
                defaultValue={editing?.capacity_cy?.toString() ?? ""}
              />
              <label className="flex h-11 items-center gap-2 rounded-full bg-white/70 px-3 text-sm font-medium ring-1 ring-white/80 sm:self-end">
                <input
                  name="is_active"
                  type="checkbox"
                  defaultChecked={editing?.is_active ?? true}
                  className="size-4"
                />
                Active
              </label>
            </div>

            <div className="mt-6 flex justify-end">
              <Button type="submit" className="h-11 rounded-full">
                <Save className="size-4" />
                Save vehicle
              </Button>
            </div>
          </form>

          <section className="glass-panel p-5 sm:p-6">
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

            <div className="mt-6 space-y-3">
              {vehicleTypes.map((vehicle) => (
                <VehicleRow key={vehicle.id} vehicle={vehicle} />
              ))}
            </div>
          </section>
        </section>
      </div>
    </main>
  );
}

function VehicleRow({ vehicle }: { vehicle: AdminVehicleType }) {
  return (
    <Link
      href={`/admin/vehicle-types?edit=${vehicle.id}`}
      className="soft-row block px-4 py-4 transition hover:bg-white/80"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate font-semibold">{vehicle.name}</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            {vehicle.capacity_tons.toFixed(2)} tons
            {vehicle.capacity_cy ? ` / ${vehicle.capacity_cy.toFixed(2)} CY` : ""}
          </p>
        </div>
        <span
          className={`soft-chip shrink-0 ${
            vehicle.is_active
              ? "bg-emerald-50 text-emerald-700 ring-emerald-100"
              : "bg-slate-100 text-slate-600 ring-slate-200"
          }`}
        >
          {vehicle.is_active ? "Active" : "Inactive"}
        </span>
      </div>
    </Link>
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
