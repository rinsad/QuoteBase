import { redirect } from "next/navigation";
import Link from "next/link";
import {
  BadgeDollarSign,
  Clock3,
  FileUp,
  PackageOpen,
  Save,
  X,
} from "lucide-react";

import {
  updateMaterialPrice,
  uploadMaterialPriceCsv,
} from "@/app/(dashboard)/admin/material-prices/actions";
import { AdminNav } from "@/components/app-nav";
import { Button } from "@/components/ui/button";
import {
  getAdminMaterialPrices,
  type AdminMaterialPrice,
} from "@/lib/admin/material-prices";
import { getCurrentUser } from "@/lib/auth/current-user";

export default async function AdminMaterialPricesPage({
  searchParams,
}: {
  searchParams: Promise<{
    material?: string;
    saved?: string;
    unchanged?: string;
    catalog_imported?: string;
  }>;
}) {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/login");
  }

  if (user.role !== "admin" && user.role !== "account_manager") {
    redirect("/dashboard");
  }

  const [params, data] = await Promise.all([
    searchParams,
    getAdminMaterialPrices(user.organization_id),
  ]);
  const selected =
    params.material
      ? (data.materials.find((material) => material.id === params.material) ??
        null)
      : null;

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
                  Material Prices
                </h1>
              </div>
            </div>
            <AdminNav />
          </div>
        </header>

        {params.saved ? (
          <div className="mt-6 rounded-[20px] border border-emerald-100 bg-emerald-50/80 px-5 py-4 text-sm font-medium text-emerald-800 shadow-sm">
            {params.catalog_imported
              ? `${params.catalog_imported} supplier catalog rows imported.`
              : params.unchanged
                ? "No material price change was needed."
              : "Material price updated."}
          </div>
        ) : null}

        <section className="mt-6 grid gap-4 md:grid-cols-4">
          <SummaryCard
            label="Catalog rows"
            value={data.summary.activeMaterials.toString()}
          />
          <SummaryCard
            label="Suppliers"
            value={data.summary.suppliers.toString()}
          />
          <SummaryCard
            label="Material families"
            value={data.summary.materialFamilies.toString()}
          />
          <SummaryCard
            label="Prices over 30 days"
            value={data.summary.stalePrices.toString()}
            attention={data.summary.stalePrices > 0}
          />
        </section>

        <section className="mt-6">
          <section className="glass-panel overflow-hidden">
            <div className="slide-panel-header">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">
                  Current Catalog
                </p>
                <h2 className="accent-title text-2xl font-semibold tracking-normal">
                  {data.materials.length} active materials
                </h2>
              </div>
              <div className="flex items-center gap-2 rounded-full bg-blue-50 px-3 py-1.5 text-sm font-medium text-blue-700 ring-1 ring-blue-100">
                <PackageOpen className="size-4" />
                Quote source
              </div>
              </div>
            </div>

            <div className="master-table-head lg:grid-cols-[minmax(220px,1.2fr)_minmax(180px,1fr)_100px_150px_150px_90px] lg:gap-4">
              <span>Material</span>
              <span>Supplier</span>
              <span>Tier</span>
              <span>Unit price</span>
              <span>Last update</span>
              <span>Action</span>
            </div>

            <div className="divide-y divide-border">
              {data.materials.map((material) => (
                <Link
                  key={material.id}
                  href={`/admin/material-prices?material=${material.id}`}
                  className={`grid gap-3 px-4 py-4 transition hover:bg-secondary/70 lg:grid-cols-[minmax(220px,1.2fr)_minmax(180px,1fr)_100px_150px_150px_90px] lg:items-center lg:gap-4 ${
                    selected?.id === material.id ? "bg-secondary" : ""
                  }`}
                >
                  <div className="min-w-0">
                    <h3 className="truncate text-sm font-semibold">
                      {material.name}
                    </h3>
                    <p className="mt-1 text-xs text-muted-foreground lg:hidden">
                      {material.supplier_name}
                    </p>
                  </div>
                  <p className="hidden min-w-0 truncate text-sm text-muted-foreground lg:block">
                    {material.supplier_name}
                  </p>
                  <TierBadge tier={material.tier} />
                  <p className="font-mono text-sm font-semibold">
                    {formatCurrency(material.cost_per_unit)}/{material.unit}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {formatDate(material.last_price_update)}
                  </p>
                  <span className="mac-link h-9 justify-center px-3 text-xs">
                    Update
                  </span>
                </Link>
              ))}
            </div>
          </section>
        </section>

        <MaterialPriceSlideOver material={selected} />

        <section className="mt-6 glass-panel p-5 sm:p-6">
          <div className="flex items-center gap-3">
            <div className="icon-well text-blue-700">
              <FileUp className="size-5" />
            </div>
            <div>
              <p className="text-sm font-medium text-muted-foreground">
                Bulk Update
              </p>
              <h2 className="text-xl font-semibold">Upload price CSV</h2>
            </div>
          </div>

          <form
            action={uploadMaterialPriceCsv}
            className="mt-5 grid gap-4 lg:grid-cols-[1fr_auto]"
          >
            <label>
              <span className="text-sm font-medium text-muted-foreground">
                CSV file
              </span>
              <input
                name="price_csv"
                type="file"
                accept=".csv,text/csv"
                className="soft-control mt-2 w-full"
                required
              />
            </label>
            <Button type="submit" className="h-11 self-end rounded-full">
              <FileUp className="size-4" />
              Upload CSV
            </Button>
          </form>
          <p className="mt-3 text-xs text-muted-foreground">
            Header: material_id,new_price,price_date,notes. Uploads are capped
            at 100 rows.
          </p>
        </section>

        {user.role === "admin" || user.role === "account_manager" ? (
          <section className="mt-6 glass-panel p-5 sm:p-6">
            <div className="flex items-center gap-3">
              <div className="icon-well text-[#3d6652]">
                <FileUp className="size-5" />
              </div>
              <div>
                <p className="text-sm font-medium text-muted-foreground">
                  Supplier Price Book
                </p>
                <h2 className="text-xl font-semibold">
                  Versioned catalog imports
                </h2>
              </div>
            </div>

            <div className="mt-5 flex flex-col gap-4 rounded-[18px] border border-border bg-card/70 p-4 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm leading-6 text-muted-foreground">
                New supplier files should go through the versioned price book
                workflow so old quotes keep their original costs.
              </p>
              <Link
                href="/admin/price-book"
                className="mac-button-primary h-10 shrink-0 px-4"
              >
                Open price book
              </Link>
            </div>
            <p className="mt-3 text-xs leading-5 text-muted-foreground">
              The old bulk catalog importer is intentionally bypassed from the
              UI now that catalog versions are tracked.
            </p>
          </section>
        ) : null}

        <section className="mt-6 glass-panel p-5 sm:p-6">
          <div className="flex items-center gap-3">
            <div className="icon-well text-emerald-700">
              <Clock3 className="size-5" />
            </div>
            <div>
              <p className="text-sm font-medium text-muted-foreground">
                History
              </p>
              <h2 className="text-xl font-semibold">Recent price changes</h2>
            </div>
          </div>

          <div className="mt-5 space-y-3">
            {data.history.length ? (
              data.history.map((entry) => (
                <article
                  key={entry.id}
                  className="soft-row grid gap-3 px-4 py-3 sm:grid-cols-[1fr_auto_auto] sm:items-center"
                >
                  <div>
                    <p className="text-sm font-semibold">
                      {formatCurrency(entry.old_price ?? 0)} to{" "}
                      {formatCurrency(entry.new_price)}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {entry.notes ?? "No notes"}
                    </p>
                  </div>
                  <span className="text-sm text-muted-foreground">
                    {entry.changed_by?.full_name ?? "Unknown user"}
                  </span>
                  <span className="font-mono text-xs text-muted-foreground">
                    {new Date(entry.changed_at).toLocaleDateString("en-US")}
                  </span>
                </article>
              ))
            ) : (
              <div className="soft-row px-4 py-6 text-sm text-muted-foreground">
                No price history captured yet.
              </div>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}

function MaterialPriceSlideOver({
  material,
}: {
  material: AdminMaterialPrice | null;
}) {
  if (!material) {
    return null;
  }

  return (
    <aside className="customer-slide-over" aria-label="Selected material price update">
      <Link
        href="/admin/material-prices"
        className="customer-slide-backdrop"
        aria-label="Close material price update"
      />
      <div className="customer-slide-panel">
        <div className="slide-panel-header">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-medium text-muted-foreground">
                Price update
              </p>
              <h2 className="mt-1 truncate text-2xl font-semibold">
                {material.name}
              </h2>
              <p className="mt-1 truncate text-sm text-muted-foreground">
                {material.supplier_name}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <TierBadge tier={material.tier} />
              <Link
                href="/admin/material-prices"
                className="mac-link size-9 px-0"
                aria-label="Close material price update"
              >
                <X className="size-4" />
              </Link>
            </div>
          </div>
        </div>

        <div className="grid gap-4 p-4">
          <section className="soft-row p-4">
            <div className="flex items-start gap-3">
              <div className="icon-well text-blue-700">
                <BadgeDollarSign className="size-5" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-medium text-muted-foreground">
                  Current supplier cost
                </p>
                <p className="mt-1 font-mono text-2xl font-semibold">
                  {formatCurrency(material.cost_per_unit)}/{material.unit}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Last updated {formatDate(material.last_price_update)}
                </p>
              </div>
            </div>
          </section>

          <form action={updateMaterialPrice} className="grid gap-4" noValidate>
            <input type="hidden" name="material_id" value={material.id} />

            <label className="block">
              <span className="text-sm font-medium text-muted-foreground">
                New price
              </span>
              <input
                name="new_price"
                type="number"
                min="0.01"
                step="0.01"
                defaultValue={material.cost_per_unit}
                className="soft-control mt-2 w-full"
                required
              />
            </label>

            <label className="block">
              <span className="text-sm font-medium text-muted-foreground">
                Price date
              </span>
              <input
                name="price_date"
                type="date"
                defaultValue={today()}
                className="soft-control mt-2 w-full"
                required
              />
            </label>

            <label className="block">
              <span className="text-sm font-medium text-muted-foreground">
                Notes
              </span>
              <textarea
                name="notes"
                rows={4}
                className="soft-control mt-2 w-full resize-none"
                placeholder="Supplier quote, effective window, or source."
              />
            </label>

            <Button type="submit" className="h-11 rounded-md">
              <Save className="size-4" />
              Update price
            </Button>
          </form>
        </div>
      </div>
    </aside>
  );
}

function SummaryCard({
  label,
  value,
  attention = false,
}: {
  label: string;
  value: string;
  attention?: boolean;
}) {
  return (
    <div className="glass-panel p-5">
      <p className="text-sm font-medium text-muted-foreground">{label}</p>
      <p
        className={`mt-2 font-mono text-3xl font-semibold ${
          attention ? "text-amber-700" : ""
        }`}
      >
        {value}
      </p>
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
      className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium ring-1 ${tones[tier]}`}
    >
      {tier}
    </span>
  );
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(value);
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function formatDate(value: string | null) {
  return value ? new Date(value).toLocaleDateString("en-US") : "not recorded";
}
