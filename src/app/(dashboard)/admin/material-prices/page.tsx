import Link from "next/link";
import { redirect } from "next/navigation";
import { BadgeDollarSign, Clock3, PackageOpen, Save } from "lucide-react";

import { updateMaterialPrice } from "@/app/(dashboard)/admin/material-prices/actions";
import { Button } from "@/components/ui/button";
import { getAdminMaterialPrices } from "@/lib/admin/material-prices";
import { getCurrentUser } from "@/lib/auth/current-user";

export default async function AdminMaterialPricesPage({
  searchParams,
}: {
  searchParams: Promise<{ material?: string; saved?: string }>;
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
    data.materials.find((material) => material.id === params.material) ??
    data.materials[0];

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
            <div className="flex flex-wrap items-center justify-end gap-2">
              <Link href="/admin/pricing" className="mac-link">
                Pricing
              </Link>
              <Link href="/admin/tax-rates" className="mac-link">
                Taxes
              </Link>
              <Link href="/admin/feature-flags" className="mac-link">
                Features
              </Link>
              <Link href="/admin/plants" className="mac-link">
                Materials
              </Link>
              <Link href="/dashboard" className="mac-link">
                Dashboard
              </Link>
            </div>
          </div>
        </header>

        {params.saved ? (
          <div className="mt-6 rounded-[20px] border border-emerald-100 bg-emerald-50/80 px-5 py-4 text-sm font-medium text-emerald-800 shadow-sm">
            Material price updated.
          </div>
        ) : null}

        <section className="mt-6 grid gap-6 lg:grid-cols-[0.8fr_1.2fr]">
          <form action={updateMaterialPrice} className="glass-panel p-5 sm:p-6">
            <div className="flex items-center gap-3">
              <div className="icon-well text-blue-700">
                <BadgeDollarSign className="size-6" />
              </div>
              <div>
                <p className="text-sm font-medium text-muted-foreground">
                  Price Update
                </p>
                <h2 className="accent-title text-2xl font-semibold tracking-normal">
                  Supplier material cost
                </h2>
              </div>
            </div>

            <div className="mt-6 space-y-4">
              <label className="block">
                <span className="text-sm font-medium text-muted-foreground">
                  Material
                </span>
                <select
                  name="material_id"
                  className="soft-control mt-2 w-full"
                  defaultValue={selected?.id}
                  required
                >
                  {data.materials.map((material) => (
                    <option key={material.id} value={material.id}>
                      {material.name} - {material.supplier_name} -{" "}
                      {formatCurrency(material.cost_per_unit)}/{material.unit}
                    </option>
                  ))}
                </select>
              </label>

              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block">
                  <span className="text-sm font-medium text-muted-foreground">
                    New price
                  </span>
                  <input
                    name="new_price"
                    type="number"
                    min="0.01"
                    step="0.01"
                    defaultValue={selected?.cost_per_unit}
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
              </div>

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
            </div>

            <div className="mt-6 flex justify-end">
              <Button
                type="submit"
                className="h-11 rounded-full"
                disabled={!data.materials.length}
              >
                <Save className="size-4" />
                Update price
              </Button>
            </div>
          </form>

          <section className="glass-panel p-5 sm:p-6">
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

            <div className="mt-6 grid gap-3 md:grid-cols-2">
              {data.materials.map((material) => (
                <Link
                  key={material.id}
                  href={`/admin/material-prices?material=${material.id}`}
                  className="soft-row block px-4 py-4 transition hover:bg-white/80"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h3 className="truncate font-semibold">
                        {material.name}
                      </h3>
                      <p className="mt-1 truncate text-sm text-muted-foreground">
                        {material.supplier_name}
                      </p>
                    </div>
                    <TierBadge tier={material.tier} />
                  </div>
                  <div className="mt-4 flex items-center justify-between gap-3">
                    <span className="font-mono text-lg font-semibold">
                      {formatCurrency(material.cost_per_unit)}
                    </span>
                    <span className="text-sm text-muted-foreground">
                      per {material.unit}
                    </span>
                  </div>
                </Link>
              ))}
            </div>
          </section>
        </section>

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
