import Link from "next/link";
import { redirect } from "next/navigation";
import {
  Building2,
  ClipboardList,
  Database,
  MapPin,
  PackageOpen,
  ShieldCheck,
  Truck,
  X,
} from "lucide-react";

import { togglePlantActive } from "@/app/(dashboard)/admin/plants/actions";
import { AdminNav, WorkspaceNav } from "@/components/app-nav";
import {
  getAdminPlantsSummary,
  type AdminSupplier,
} from "@/lib/admin/plants";
import { getCurrentUser } from "@/lib/auth/current-user";
import { logAction } from "@/lib/audit/log-action";

export default async function AdminPlantsPage({
  searchParams,
}: {
  searchParams: Promise<{ supplier?: string }>;
}) {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/login");
  }

  if (user.role !== "admin" && user.role !== "account_manager") {
    redirect("/dashboard");
  }

  await logAction({
    user,
    action: "admin.plants.viewed",
    targetTable: "suppliers",
    metadata: {
      route: "/admin/plants",
    },
  });

  const [params, summary] = await Promise.all([
    searchParams,
    getAdminPlantsSummary(user.organization_id),
  ]);
  const selectedSupplier =
    summary.suppliers.find((supplier) => supplier.id === params.supplier) ?? null;

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
                <h1 className="truncate text-lg font-semibold">
                  Plants & Materials
                </h1>
              </div>
            </div>
            {user.role === "admin" ? (
              <AdminNav />
            ) : (
              <WorkspaceNav role={user.role} />
            )}
          </div>
        </header>

        <section className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-6">
          <CountTile
            icon={Building2}
            label="Suppliers"
            value={summary.counts.suppliers}
          />
          <CountTile
            icon={PackageOpen}
            label="Materials"
            value={summary.counts.materials}
          />
          <CountTile
            icon={Truck}
            label="Vehicle Types"
            value={summary.counts.vehicleTypes}
          />
          <CountTile icon={MapPin} label="Yards" value={summary.counts.yards} />
          <CountTile
            icon={Database}
            label="Tax Rates"
            value={summary.counts.taxRates}
          />
          <CountTile
            icon={ClipboardList}
            label="Audit Entries"
            value={summary.counts.auditEntries}
          />
        </section>

        <section className="mt-6 glass-panel overflow-hidden">
          <div className="slide-panel-header">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-sm font-medium text-muted-foreground">
                Read-only view
              </p>
              <h2 className="accent-title text-2xl font-semibold tracking-normal">
                Materials grouped by supplier
              </h2>
            </div>
            <div className="flex items-center gap-2 rounded-full bg-blue-50 px-3 py-1.5 text-sm font-medium text-blue-700 ring-1 ring-blue-100">
              <ShieldCheck className="size-4" />
                Admin and account manager
            </div>
            </div>
          </div>

          <div className="master-table-head lg:grid-cols-[minmax(220px,1fr)_minmax(240px,1fr)_160px_120px_100px] lg:gap-4">
            <span>Plant</span>
            <span>Location</span>
            <span>Coordinates</span>
            <span>Materials</span>
            <span>Status</span>
          </div>

          <div className="divide-y divide-border">
            {summary.suppliers.map((supplier) => (
              <Link
                key={supplier.id}
                href={`/admin/plants?supplier=${supplier.id}`}
                className={`grid gap-3 px-4 py-4 transition hover:bg-secondary/70 lg:grid-cols-[minmax(220px,1fr)_minmax(240px,1fr)_160px_120px_100px] lg:items-center lg:gap-4 ${
                  selectedSupplier?.id === supplier.id ? "bg-secondary" : ""
                }`}
              >
                <div className="min-w-0">
                  <h3 className="truncate text-sm font-semibold">{supplier.name}</h3>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {supplier.parent_company ?? "Independent supplier"}
                  </p>
                </div>
                <p className="truncate text-sm text-muted-foreground">
                  {formatAddress(supplier.address)}
                </p>
                <p className="font-mono text-xs text-muted-foreground">
                  {supplier.latitude ?? "lat pending"},{" "}
                  {supplier.longitude ?? "lng pending"}
                </p>
                <p className="text-sm font-medium">
                  {supplier.materials.length} material
                  {supplier.materials.length === 1 ? "" : "s"}
                </p>
                <span
                  className={`soft-chip w-fit ${
                    supplier.is_active
                      ? "bg-emerald-50 text-emerald-700 ring-emerald-100"
                      : "bg-slate-100 text-slate-600 ring-slate-200"
                  }`}
                >
                  {supplier.is_active ? "Active" : "Inactive"}
                </span>
              </Link>
            ))}
          </div>
        </section>
        <PlantSlideOver supplier={selectedSupplier} />
      </div>
    </main>
  );
}

function PlantSlideOver({ supplier }: { supplier: AdminSupplier | null }) {
  if (!supplier) {
    return null;
  }

  return (
    <aside className="customer-slide-over" aria-label="Plant details">
      <Link
        href="/admin/plants"
        className="customer-slide-backdrop"
        aria-label="Close plant details"
      />
      <div className="customer-slide-panel">
        <div className="slide-panel-header">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-medium text-muted-foreground">
                Plant details
              </p>
              <h2 className="mt-1 truncate text-2xl font-semibold">
                {supplier.name}
              </h2>
              <p className="mt-1 truncate text-sm text-muted-foreground">
                {supplier.parent_company ?? "Independent supplier"}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <span
                className={`soft-chip ${
                  supplier.is_active
                    ? "bg-emerald-50 text-emerald-700 ring-emerald-100"
                    : "bg-slate-100 text-slate-600 ring-slate-200"
                }`}
              >
                {supplier.is_active ? "Active" : "Inactive"}
              </span>
              <Link
                href="/admin/plants"
                className="mac-link size-9 px-0"
                aria-label="Close plant details"
              >
                <X className="size-4" />
              </Link>
            </div>
          </div>
        </div>

        <div className="grid gap-4 p-4">
          <section className="soft-row p-4">
            <h3 className="text-xs font-semibold uppercase text-muted-foreground">
              Location
            </h3>
            <p className="mt-2 text-sm font-medium">
              {formatAddress(supplier.address)}
            </p>
            <p className="mt-2 font-mono text-xs text-muted-foreground">
              {supplier.latitude ?? "lat pending"},{" "}
              {supplier.longitude ?? "lng pending"}
            </p>
          </section>

          <form action={togglePlantActive} className="soft-row flex items-center justify-between gap-3 p-4">
            <div>
              <p className="text-sm font-semibold">Plant status</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Inactive plants are hidden from active quote setup.
              </p>
            </div>
            <input type="hidden" name="supplier_id" value={supplier.id} />
            <input
              type="hidden"
              name="is_active"
              value={supplier.is_active ? "false" : "true"}
            />
            <button type="submit" className="mac-link h-10 px-3">
              {supplier.is_active ? "Flag inactive" : "Reactivate"}
            </button>
          </form>

          <section>
            <div className="mb-2 flex items-center justify-between gap-3">
              <h3 className="text-xs font-semibold uppercase text-muted-foreground">
                Materials ({supplier.materials.length})
              </h3>
              <Link
                href="/admin/material-prices"
                className="text-xs font-semibold text-primary hover:text-foreground"
              >
                Manage prices
              </Link>
            </div>
            <div className="grid gap-2">
              {supplier.materials.length ? (
                supplier.materials.map((material) => (
                  <div key={material.id} className="soft-row p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold">
                          {material.name}
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {material.unit} - Updated{" "}
                          {formatDate(material.last_price_update)}
                        </p>
                      </div>
                      <TierBadge tier={material.tier} />
                    </div>
                    <p className="mt-3 font-mono text-sm font-semibold">
                      ${Number(material.cost_per_unit).toFixed(2)}
                    </p>
                  </div>
                ))
              ) : (
                <div className="soft-row px-4 py-5 text-sm text-muted-foreground">
                  No materials loaded for this supplier yet.
                </div>
              )}
            </div>
          </section>
        </div>
      </div>
    </aside>
  );
}

function CountTile({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Building2;
  label: string;
  value: number;
}) {
  return (
    <div className="glass-tile min-h-32 p-5">
      <Icon className="size-5 text-foreground" />
      <p className="mt-5 text-xs font-medium uppercase text-muted-foreground">
        {label}
      </p>
      <p className="mt-2 text-3xl font-semibold">{value}</p>
    </div>
  );
}

function TierBadge({ tier }: { tier: "R1" | "R2" | "R3" | "R4" }) {
  const tones = {
    R1: "bg-slate-100 text-slate-700 ring-slate-200",
    R2: "bg-blue-50 text-blue-700 ring-blue-100",
    R3: "bg-amber-50 text-amber-700 ring-amber-100",
    R4: "bg-purple-50 text-purple-700 ring-purple-100",
  };

  return (
    <span
      className={`w-fit rounded-full px-2.5 py-1 text-xs font-medium ring-1 ${tones[tier]}`}
    >
      {tier}
    </span>
  );
}

function formatAddress(address: Record<string, unknown>) {
  const city = typeof address.city === "string" ? address.city : "";
  const state = typeof address.state === "string" ? address.state : "";

  return [city, state].filter(Boolean).join(", ") || "Address pending";
}

function formatDate(value: string | null) {
  return value ? new Date(value).toLocaleDateString("en-US") : "not recorded";
}
