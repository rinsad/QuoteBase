import Link from "next/link";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";
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
            <div className="flex flex-wrap items-center justify-end gap-2">
              <HeaderLink href="/admin/system-check">System check</HeaderLink>
              <HeaderLink href="/dashboard">Dashboard</HeaderLink>
            </div>
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
                className="overflow-hidden rounded-[22px] border border-white/70 bg-white/60 shadow-[0_12px_34px_rgba(15,23,42,0.055)]"
              >
                <div className="grid gap-4 border-b border-white/70 px-5 py-4 md:grid-cols-[1fr_auto] md:items-center">
                  <div>
                    <h3 className="text-lg font-semibold">{supplier.name}</h3>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {supplier.parent_company ?? "Independent supplier"} -{" "}
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
                        className="soft-row grid gap-3 px-4 py-3 text-sm sm:grid-cols-[1fr_auto_auto_auto] sm:items-center"
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
                    <div className="soft-row px-4 py-5 text-sm text-muted-foreground">
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

function HeaderLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link href={href} className="mac-link">
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
