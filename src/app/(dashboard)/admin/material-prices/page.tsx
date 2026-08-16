import { redirect } from "next/navigation";
import Link from "next/link";
import {
  ArrowUpDown,
  BadgeDollarSign,
  ChevronDown,
  ChevronUp,
  Clock3,
  FileUp,
  PackageOpen,
  Save,
  X,
} from "lucide-react";

import { updateMaterialPrice } from "@/app/(dashboard)/admin/material-prices/actions";
import { AdminNav } from "@/components/app-nav";
import { Button } from "@/components/ui/button";
import { DatePicker } from "@/components/ui/date-picker";
import {
  getAdminMaterialPrices,
  type AdminMaterialPrice,
} from "@/lib/admin/material-prices";
import { getCurrentUser } from "@/lib/auth/current-user";

const SORT_KEYS = [
  "material",
  "supplier",
  "tier",
  "unit_price",
  "supplier_pdf_info",
  "last_update",
] as const;

type SortKey = (typeof SORT_KEYS)[number];
type SortDir = "asc" | "desc";

export default async function AdminMaterialPricesPage({
  searchParams,
}: {
  searchParams: Promise<{
    material?: string;
    dir?: string;
    saved?: string;
    sort?: string;
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
  const sortKey = parseSortKey(params.sort);
  const sortDir: SortDir = params.dir === "desc" ? "desc" : "asc";
  const sortedMaterials = sortMaterials(data.materials, sortKey, sortDir);

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
                Upload supplier material PDFs through the price book workflow so
                QuoteBase can track each supplier version and preserve pricing
                used on older quotes.
              </p>
              <Link
                href="/admin/price-book"
                className="mac-button-primary h-10 shrink-0 px-4"
              >
                Open price book
              </Link>
            </div>
          </section>
        ) : null}

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

            <div className="master-table-head lg:grid-cols-[minmax(200px,1.1fr)_minmax(160px,0.8fr)_90px_135px_minmax(190px,1fr)_130px_90px] lg:gap-4">
              <SortableHeader
                label="Material"
                sortKey="material"
                activeSort={sortKey}
                sortDir={sortDir}
                selectedMaterialId={selected?.id ?? null}
              />
              <SortableHeader
                label="Supplier"
                sortKey="supplier"
                activeSort={sortKey}
                sortDir={sortDir}
                selectedMaterialId={selected?.id ?? null}
              />
              <SortableHeader
                label="Tier"
                sortKey="tier"
                activeSort={sortKey}
                sortDir={sortDir}
                selectedMaterialId={selected?.id ?? null}
              />
              <SortableHeader
                label="Unit price"
                sortKey="unit_price"
                activeSort={sortKey}
                sortDir={sortDir}
                selectedMaterialId={selected?.id ?? null}
              />
              <SortableHeader
                label="Supplier PDF Info"
                sortKey="supplier_pdf_info"
                activeSort={sortKey}
                sortDir={sortDir}
                selectedMaterialId={selected?.id ?? null}
              />
              <SortableHeader
                label="Last update"
                sortKey="last_update"
                activeSort={sortKey}
                sortDir={sortDir}
                selectedMaterialId={selected?.id ?? null}
              />
              <span>Action</span>
            </div>

            <div className="divide-y divide-border">
              {sortedMaterials.map((material) => (
                <Link
                  key={material.id}
                  href={buildMaterialPriceHref(material.id, sortKey, sortDir)}
                  className={`grid gap-3 px-4 py-4 transition hover:bg-secondary/70 lg:grid-cols-[minmax(200px,1.1fr)_minmax(160px,0.8fr)_90px_135px_minmax(190px,1fr)_130px_90px] lg:items-center lg:gap-4 ${
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
                  <div className="min-w-0 text-xs leading-5 text-muted-foreground">
                    <p className="truncate">
                      {material.catalog_source_plant ?? "Plant not mapped"}
                    </p>
                    <p className="truncate">
                      {material.catalog_surcharge_per_load === null
                        ? "No surcharge mapped"
                        : `${formatCurrency(material.catalog_surcharge_per_load)}/load`}
                      {material.catalog_quote_number
                        ? ` - ${material.catalog_quote_number}`
                        : ""}
                    </p>
                  </div>
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

function SortableHeader({
  activeSort,
  label,
  selectedMaterialId,
  sortDir,
  sortKey,
}: {
  activeSort: SortKey;
  label: string;
  selectedMaterialId: string | null;
  sortDir: SortDir;
  sortKey: SortKey;
}) {
  const isActive = activeSort === sortKey;
  const nextDir: SortDir = isActive && sortDir === "asc" ? "desc" : "asc";
  const Icon = isActive ? (sortDir === "asc" ? ChevronUp : ChevronDown) : ArrowUpDown;
  const params = new URLSearchParams({
    dir: nextDir,
    sort: sortKey,
  });

  if (selectedMaterialId) {
    params.set("material", selectedMaterialId);
  }

  return (
    <Link
      href={`/admin/material-prices?${params.toString()}`}
      className={`inline-flex min-w-0 items-center gap-1.5 transition hover:text-foreground ${
        isActive ? "text-foreground" : ""
      }`}
    >
      <span className="truncate">{label}</span>
      <Icon className="size-3.5 shrink-0" />
    </Link>
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
              <DatePicker
                name="price_date"
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

function buildMaterialPriceHref(
  materialId: string,
  sortKey: SortKey,
  sortDir: SortDir,
) {
  const params = new URLSearchParams({
    dir: sortDir,
    material: materialId,
    sort: sortKey,
  });

  return `/admin/material-prices?${params.toString()}`;
}

function parseSortKey(value: string | undefined): SortKey {
  return SORT_KEYS.includes(value as SortKey) ? (value as SortKey) : "material";
}

function sortMaterials(
  materials: AdminMaterialPrice[],
  sortKey: SortKey,
  sortDir: SortDir,
) {
  return [...materials].sort((a, b) => compareMaterials(a, b, sortKey, sortDir));
}

function compareMaterials(
  a: AdminMaterialPrice,
  b: AdminMaterialPrice,
  sortKey: SortKey,
  sortDir: SortDir,
) {
  const direction = sortDir === "asc" ? 1 : -1;

  switch (sortKey) {
    case "supplier":
      return compareText(a.supplier_name, b.supplier_name) * direction;
    case "tier":
      return compareText(a.tier, b.tier) * direction;
    case "unit_price":
      return (a.cost_per_unit - b.cost_per_unit) * direction;
    case "supplier_pdf_info":
      return (
        compareText(a.catalog_source_plant ?? "", b.catalog_source_plant ?? "") ||
        compareText(a.catalog_quote_number ?? "", b.catalog_quote_number ?? "") ||
        compareText(a.name, b.name)
      ) * direction;
    case "last_update":
      return compareNullableDate(a.last_price_update, b.last_price_update, sortDir);
    case "material":
    default:
      return compareText(a.name, b.name) * direction;
  }
}

function compareText(a: string, b: string) {
  return a.localeCompare(b, "en-US", {
    numeric: true,
    sensitivity: "base",
  });
}

function compareNullableDate(a: string | null, b: string | null, sortDir: SortDir) {
  if (!a && !b) {
    return 0;
  }

  if (!a) {
    return 1;
  }

  if (!b) {
    return -1;
  }

  const direction = sortDir === "asc" ? 1 : -1;
  return (new Date(a).getTime() - new Date(b).getTime()) * direction;
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
