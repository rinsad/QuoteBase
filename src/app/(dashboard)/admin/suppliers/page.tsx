import Link from "next/link";
import { redirect } from "next/navigation";
import { Building2, MapPinned, Save } from "lucide-react";

import { saveSupplier } from "@/app/(dashboard)/admin/suppliers/actions";
import { Button } from "@/components/ui/button";
import {
  getAdminSuppliers,
  type AdminSupplierLocation,
} from "@/lib/admin/suppliers";
import { getCurrentUser } from "@/lib/auth/current-user";

export default async function AdminSuppliersPage({
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

  const [params, suppliers] = await Promise.all([
    searchParams,
    getAdminSuppliers(user.organization_id),
  ]);
  const editing = suppliers.find((supplier) => supplier.id === params.edit);

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
                <h1 className="truncate text-lg font-semibold">Suppliers</h1>
              </div>
            </div>
            <div className="flex flex-wrap items-center justify-end gap-2">
              <Link href="/admin/plants" className="mac-link">
                Materials
              </Link>
              <Link href="/admin/yards" className="mac-link">
                Yards
              </Link>
              <Link href="/admin/material-prices" className="mac-link">
                Material prices
              </Link>
              <Link href="/dashboard" className="mac-link">
                Dashboard
              </Link>
            </div>
          </div>
        </header>

        {params.saved ? (
          <div className="mt-6 rounded-[20px] border border-emerald-100 bg-emerald-50/80 px-5 py-4 text-sm font-medium text-emerald-800 shadow-sm">
            Supplier saved.
          </div>
        ) : null}

        <section className="mt-6 grid gap-6 lg:grid-cols-[0.8fr_1.2fr]">
          <form action={saveSupplier} className="glass-panel p-5 sm:p-6">
            <div className="flex items-center gap-3">
              <div className="icon-well text-blue-700">
                <Building2 className="size-6" />
              </div>
              <div>
                <p className="text-sm font-medium text-muted-foreground">
                  {editing ? "Edit Supplier" : "New Supplier"}
                </p>
                <h2 className="accent-title text-2xl font-semibold tracking-normal">
                  Plant location
                </h2>
              </div>
            </div>

            <input type="hidden" name="supplier_id" value={editing?.id ?? ""} />

            <div className="mt-6 grid gap-4 sm:grid-cols-2">
              <TextField name="name" label="Name" defaultValue={editing?.name ?? ""} />
              <TextField
                name="parent_company"
                label="Parent company"
                defaultValue={editing?.parent_company ?? ""}
                required={false}
              />
              <TextField
                name="street"
                label="Street"
                defaultValue={addressValue(editing, "street")}
                required={false}
              />
              <TextField
                name="city"
                label="City"
                defaultValue={addressValue(editing, "city")}
              />
              <TextField
                name="state"
                label="State"
                defaultValue={addressValue(editing, "state") || "CA"}
                maxLength={2}
              />
              <TextField
                name="postal_code"
                label="ZIP"
                defaultValue={addressValue(editing, "postal_code")}
                required={false}
              />
              <NumberField
                name="latitude"
                label="Latitude"
                defaultValue={editing?.latitude?.toString() ?? ""}
              />
              <NumberField
                name="longitude"
                label="Longitude"
                defaultValue={editing?.longitude?.toString() ?? ""}
              />
              <TextField
                name="hours"
                label="Hours"
                defaultValue={editing?.hours ?? ""}
                required={false}
              />
              <TextField
                name="primary_contact_name"
                label="Contact name"
                defaultValue={editing?.primary_contact_name ?? ""}
                required={false}
              />
              <TextField
                name="primary_contact_phone"
                label="Contact phone"
                defaultValue={editing?.primary_contact_phone ?? ""}
                required={false}
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

            <label className="mt-4 block">
              <span className="text-sm font-medium text-muted-foreground">
                Notes
              </span>
              <textarea
                name="notes"
                rows={4}
                defaultValue={editing?.notes ?? ""}
                className="soft-control mt-2 w-full resize-none"
              />
            </label>

            <div className="mt-6 flex justify-end">
              <Button type="submit" className="h-11 rounded-full">
                <Save className="size-4" />
                Save supplier
              </Button>
            </div>
          </form>

          <section className="glass-panel p-5 sm:p-6">
            <div className="flex items-center gap-3">
              <div className="icon-well text-blue-700">
                <MapPinned className="size-6" />
              </div>
              <div>
                <p className="text-sm font-medium text-muted-foreground">
                  Plants
                </p>
                <h2 className="accent-title text-2xl font-semibold tracking-normal">
                  {suppliers.length} suppliers
                </h2>
              </div>
            </div>

            <div className="mt-6 grid gap-3 xl:grid-cols-2">
              {suppliers.map((supplier) => (
                <Link
                  key={supplier.id}
                  href={`/admin/suppliers?edit=${supplier.id}`}
                  className="soft-row block px-4 py-4 transition hover:bg-white/80"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h3 className="truncate font-semibold">{supplier.name}</h3>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {supplier.parent_company ?? "Independent supplier"}
                      </p>
                    </div>
                    <span
                      className={`soft-chip shrink-0 ${
                        supplier.is_active
                          ? "bg-emerald-50 text-emerald-700 ring-emerald-100"
                          : "bg-slate-100 text-slate-600 ring-slate-200"
                      }`}
                    >
                      {supplier.is_active ? "Active" : "Inactive"}
                    </span>
                  </div>
                  <p className="mt-3 text-sm text-muted-foreground">
                    {formatAddress(supplier.address)}
                  </p>
                  <p className="mt-2 font-mono text-xs text-muted-foreground">
                    {supplier.latitude ?? "lat pending"},{" "}
                    {supplier.longitude ?? "lng pending"}
                  </p>
                </Link>
              ))}
            </div>
          </section>
        </section>
      </div>
    </main>
  );
}

function TextField({
  name,
  label,
  defaultValue,
  maxLength,
  required = true,
}: {
  name: string;
  label: string;
  defaultValue: string;
  maxLength?: number;
  required?: boolean;
}) {
  return (
    <label className="block">
      <span className="text-sm font-medium text-muted-foreground">{label}</span>
      <input
        name={name}
        type="text"
        defaultValue={defaultValue}
        maxLength={maxLength}
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
        step="0.0000001"
        defaultValue={defaultValue}
        className="soft-control mt-2 w-full"
      />
    </label>
  );
}

function addressValue(
  supplier: AdminSupplierLocation | undefined,
  key: string,
) {
  const value = supplier?.address[key];

  return typeof value === "string" ? value : "";
}

function formatAddress(address: Record<string, unknown>) {
  const street = typeof address.street === "string" ? address.street : "";
  const city = typeof address.city === "string" ? address.city : "";
  const state = typeof address.state === "string" ? address.state : "";

  return [street, city, state].filter(Boolean).join(", ") || "Address pending";
}
