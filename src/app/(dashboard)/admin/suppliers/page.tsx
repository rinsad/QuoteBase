import Link from "next/link";
import { redirect } from "next/navigation";
import { Building2, Save, X } from "lucide-react";

import { saveSupplier } from "@/app/(dashboard)/admin/suppliers/actions";
import { AdminNav } from "@/components/app-nav";
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
  const editing =
    params.edit && params.edit !== "new"
      ? (suppliers.find((supplier) => supplier.id === params.edit) ?? null)
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
                  Admin
                </p>
                <h1 className="truncate text-lg font-semibold">Suppliers</h1>
              </div>
            </div>
            <AdminNav />
          </div>
        </header>

        {params.saved ? (
          <div className="mt-6 rounded-[20px] border border-emerald-100 bg-emerald-50/80 px-5 py-4 text-sm font-medium text-emerald-800 shadow-sm">
            Supplier saved.
          </div>
        ) : null}

        <section className="mt-6">
          <section className="glass-panel overflow-hidden">
            <div className="slide-panel-header">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
              <div className="flex items-center gap-3">
                <div className="icon-well text-blue-700">
                  <Building2 className="size-6" />
                </div>
                <div>
                <p className="text-sm font-medium text-muted-foreground">
                  Supplier companies
                </p>
                <h2 className="accent-title text-2xl font-semibold tracking-normal">
                  {suppliers.length} suppliers
                </h2>
                </div>
              </div>
              <Link
                href="/admin/suppliers?edit=new"
                className="mac-button-primary h-10 px-4"
              >
                New supplier
              </Link>
              </div>
            </div>

            <div className="master-table-head lg:grid-cols-[minmax(220px,1.2fr)_120px_minmax(260px,1fr)_220px_90px] lg:gap-4">
              <span>Supplier</span>
              <span>Plants</span>
              <span>Notes</span>
              <span>Supplier cascade</span>
              <span>Status</span>
            </div>

            <div className="divide-y divide-border">
              {suppliers.map((supplier) => (
                <div
                  key={supplier.id}
                  className={`grid gap-3 px-4 py-4 transition hover:bg-secondary/70 lg:grid-cols-[minmax(220px,1.2fr)_120px_minmax(260px,1fr)_220px_90px] lg:items-center lg:gap-4 ${
                    editing?.id === supplier.id ? "bg-secondary" : ""
                  }`}
                >
                  <div className="min-w-0">
                    <Link
                      href={`/admin/suppliers?edit=${supplier.id}`}
                      className="block truncate text-sm font-semibold hover:text-primary"
                    >
                      {supplier.name}
                    </Link>
                    <p className="mt-1 text-xs text-muted-foreground lg:hidden">
                      {supplier.plant_count} plant
                      {supplier.plant_count === 1 ? "" : "s"}
                    </p>
                  </div>
                  <p className="text-sm font-medium">
                    {supplier.plant_count} plant
                    {supplier.plant_count === 1 ? "" : "s"}
                  </p>
                  <p className="truncate text-sm text-muted-foreground">
                    {supplier.notes ?? "No notes"}
                  </p>
                  <div className="flex flex-wrap items-center gap-2">
                    <Link
                      href={`/admin/plants?supplier=${supplier.id}`}
                      className="mac-link h-8 px-3 text-xs"
                    >
                      Plants
                    </Link>
                    <Link
                      href={`/admin/plants?supplier=${supplier.id}`}
                      className="mac-link h-8 px-3 text-xs"
                    >
                      Materials
                    </Link>
                    <Link
                      href={`/admin/price-book?supplier_company=${supplier.id}`}
                      className="mac-link h-8 px-3 text-xs"
                    >
                      Map PDF
                    </Link>
                  </div>
                  <span
                    className={`soft-chip w-fit shrink-0 ${
                      supplier.is_active
                        ? "bg-emerald-50 text-emerald-700 ring-emerald-100"
                        : "bg-slate-100 text-slate-600 ring-slate-200"
                    }`}
                  >
                    {supplier.is_active ? "Active" : "Inactive"}
                  </span>
                </div>
              ))}
            </div>
          </section>
        </section>
        <SupplierSlideOver supplier={editing} open={showEditor} />
      </div>
    </main>
  );
}

function SupplierSlideOver({
  supplier,
  open,
}: {
  supplier: AdminSupplierLocation | null;
  open: boolean;
}) {
  if (!open) {
    return null;
  }

  return (
    <aside className="customer-slide-over" aria-label="Supplier editor">
      <Link
        href="/admin/suppliers"
        className="customer-slide-backdrop"
        aria-label="Close supplier editor"
      />
      <div className="customer-slide-panel">
        <div className="slide-panel-header">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-medium text-muted-foreground">
                {supplier ? "Edit supplier" : "New supplier"}
              </p>
              <h2 className="mt-1 truncate text-2xl font-semibold">
                Supplier company
              </h2>
              <p className="mt-1 truncate text-sm text-muted-foreground">
                Parent supplier used to group plants and material PDFs.
              </p>
            </div>
            <Link
              href="/admin/suppliers"
              className="mac-link size-9 shrink-0 px-0"
              aria-label="Close supplier editor"
            >
              <X className="size-4" />
            </Link>
          </div>
        </div>

        <form action={saveSupplier} className="grid gap-4 p-4" noValidate>
          <input type="hidden" name="supplier_id" value={supplier?.id ?? ""} />
          <TextField name="name" label="Name" defaultValue={supplier?.name ?? ""} />
          <label className="flex h-11 items-center gap-2 rounded-md bg-white/70 px-3 text-sm font-medium ring-1 ring-white/80">
            <input
              name="is_active"
              type="checkbox"
              defaultChecked={supplier?.is_active ?? true}
              className="size-4"
            />
            Active
          </label>
          <label className="block">
            <span className="text-sm font-medium text-muted-foreground">
              Notes
            </span>
            <textarea
              name="notes"
              rows={4}
              defaultValue={supplier?.notes ?? ""}
              className="soft-control mt-2 w-full resize-none"
            />
          </label>
          <Button type="submit" className="h-11 rounded-md">
            <Save className="size-4" />
            Save supplier
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
