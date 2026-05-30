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
} from "lucide-react";

import { getAdminPlantsSummary } from "@/lib/admin/plants";
import { getCurrentUser } from "@/lib/auth/current-user";
import { logAction } from "@/lib/audit/log-action";

export default async function AdminPlantsPage() {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/login");
  }

  if (user.role !== "admin") {
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

  const summary = await getAdminPlantsSummary(user.organization_id);

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top_left,#ffffff_0,#f6f7f9_38%,#edf1f5_100%)] px-4 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto w-full max-w-7xl">
        <header className="glass-panel flex min-h-16 items-center justify-between px-4 sm:px-5">
          <div>
            <p className="text-sm font-medium text-muted-foreground">
              Admin
            </p>
            <h1 className="text-lg font-semibold">Plants & Materials</h1>
          </div>
          <div className="flex items-center gap-2">
            <HeaderLink href="/admin/system-check">System check</HeaderLink>
            <HeaderLink href="/dashboard">Dashboard</HeaderLink>
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

        <section className="mt-6 glass-panel p-5 sm:p-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-sm font-medium text-muted-foreground">
                Read-only view
              </p>
              <h2 className="text-2xl font-semibold tracking-normal">
                Materials grouped by supplier
              </h2>
            </div>
            <div className="flex items-center gap-2 rounded-full bg-blue-50 px-3 py-1.5 text-sm font-medium text-blue-700 ring-1 ring-blue-100">
              <ShieldCheck className="size-4" />
              Admin only
            </div>
          </div>

          <div className="mt-6 space-y-4">
            {summary.suppliers.map((supplier) => (
              <article
                key={supplier.id}
                className="overflow-hidden rounded-3xl border border-white/70 bg-white/60 shadow-sm"
              >
                <div className="grid gap-4 border-b border-white/70 px-5 py-4 md:grid-cols-[1fr_auto] md:items-center">
                  <div>
                    <h3 className="text-lg font-semibold">{supplier.name}</h3>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {supplier.parent_company ?? "Independent supplier"} ·{" "}
                      {formatAddress(supplier.address)}
                    </p>
                  </div>
                  <span
                    className={`w-fit rounded-full px-2.5 py-1 text-xs font-medium ring-1 ${
                      supplier.is_active
                        ? "bg-emerald-50 text-emerald-700 ring-emerald-100"
                        : "bg-slate-100 text-slate-600 ring-slate-200"
                    }`}
                  >
                    {supplier.is_active ? "Active" : "Inactive"}
                  </span>
                </div>

                <div className="grid gap-2 p-4">
                  {supplier.materials.length ? (
                    supplier.materials.map((material) => (
                      <div
                        key={material.id}
                        className="grid gap-3 rounded-2xl bg-white/70 px-4 py-3 text-sm shadow-sm sm:grid-cols-[1fr_auto_auto_auto] sm:items-center"
                      >
                        <div>
                          <p className="font-semibold">{material.name}</p>
                          <p className="text-xs text-muted-foreground">
                            {material.unit}
                          </p>
                        </div>
                        <TierBadge tier={material.tier} />
                        <p className="font-mono text-sm font-semibold">
                          ${Number(material.cost_per_unit).toFixed(2)}
                        </p>
                        <span
                          className={`w-fit rounded-full px-2.5 py-1 text-xs font-medium ring-1 ${
                            material.is_active
                              ? "bg-emerald-50 text-emerald-700 ring-emerald-100"
                              : "bg-slate-100 text-slate-600 ring-slate-200"
                          }`}
                        >
                          {material.is_active ? "Active" : "Inactive"}
                        </span>
                      </div>
                    ))
                  ) : (
                    <div className="rounded-2xl bg-white/70 px-4 py-5 text-sm text-muted-foreground shadow-sm">
                      No materials loaded for this supplier yet.
                    </div>
                  )}
                </div>
              </article>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}

function HeaderLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="inline-flex h-8 items-center justify-center rounded-2xl border border-border bg-background px-2.5 text-sm font-medium shadow-sm transition hover:bg-muted"
    >
      {children}
    </Link>
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

