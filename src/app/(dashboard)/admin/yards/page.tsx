import Link from "next/link";
import { redirect } from "next/navigation";
import { MapPin, Save, X } from "lucide-react";

import { saveYard } from "@/app/(dashboard)/admin/yards/actions";
import { AdminNav } from "@/components/app-nav";
import { Button } from "@/components/ui/button";
import { getAdminYards, type AdminYard } from "@/lib/admin/yards";
import { getCurrentUser } from "@/lib/auth/current-user";

export default async function AdminYardsPage({
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

  const [params, yards] = await Promise.all([
    searchParams,
    getAdminYards(user.organization_id),
  ]);
  const editing =
    params.edit && params.edit !== "new"
      ? (yards.find((yard) => yard.id === params.edit) ?? null)
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
                <h1 className="truncate text-lg font-semibold">Yards</h1>
              </div>
            </div>
            <AdminNav />
          </div>
        </header>

        {params.saved ? (
          <div className="mt-6 rounded-[20px] border border-emerald-100 bg-emerald-50/80 px-5 py-4 text-sm font-medium text-emerald-800 shadow-sm">
            Yard saved.
          </div>
        ) : null}

        <section className="mt-6">
          <section className="glass-panel overflow-hidden">
            <div className="slide-panel-header">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
              <div className="flex items-center gap-3">
                <div className="icon-well text-blue-700">
                  <MapPin className="size-6" />
                </div>
                <div>
                <p className="text-sm font-medium text-muted-foreground">
                  Origins
                </p>
                <h2 className="accent-title text-2xl font-semibold tracking-normal">
                  {yards.length} yards
                </h2>
                </div>
              </div>
              <Link href="/admin/yards?edit=new" className="mac-button-primary h-10 px-4">
                New yard
              </Link>
              </div>
            </div>

            <div className="master-table-head lg:grid-cols-[minmax(220px,1fr)_minmax(240px,1.2fr)_160px_100px] lg:gap-4">
              <span>Yard</span>
              <span>Address</span>
              <span>Coordinates</span>
              <span>Status</span>
            </div>

            <div className="divide-y divide-border">
              {yards.map((yard) => (
                <Link
                  key={yard.id}
                  href={`/admin/yards?edit=${yard.id}`}
                  className={`grid gap-3 px-4 py-4 transition hover:bg-secondary/70 lg:grid-cols-[minmax(220px,1fr)_minmax(240px,1.2fr)_160px_100px] lg:items-center lg:gap-4 ${
                    editing?.id === yard.id ? "bg-secondary" : ""
                  }`}
                >
                  <div className="min-w-0">
                    <h3 className="truncate text-sm font-semibold">{yard.name}</h3>
                    <p className="mt-1 text-xs text-muted-foreground lg:hidden">
                      {formatAddress(yard.address)}
                    </p>
                  </div>
                  <p className="hidden truncate text-sm text-muted-foreground lg:block">
                    {formatAddress(yard.address)}
                  </p>
                  <p className="font-mono text-xs text-muted-foreground">
                    {yard.latitude ?? "lat pending"},{" "}
                    {yard.longitude ?? "lng pending"}
                  </p>
                  <span
                    className={`soft-chip w-fit shrink-0 ${
                      yard.is_active
                        ? "bg-emerald-50 text-emerald-700 ring-emerald-100"
                        : "bg-slate-100 text-slate-600 ring-slate-200"
                    }`}
                  >
                    {yard.is_active ? "Active" : "Inactive"}
                  </span>
                </Link>
              ))}
            </div>
          </section>
        </section>
        <YardSlideOver yard={editing} open={showEditor} />
      </div>
    </main>
  );
}

function YardSlideOver({
  yard,
  open,
}: {
  yard: AdminYard | null;
  open: boolean;
}) {
  if (!open) {
    return null;
  }

  return (
    <aside className="customer-slide-over" aria-label="Yard editor">
      <Link
        href="/admin/yards"
        className="customer-slide-backdrop"
        aria-label="Close yard editor"
      />
      <div className="customer-slide-panel">
        <div className="slide-panel-header">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-medium text-muted-foreground">
                {yard ? "Edit yard" : "New yard"}
              </p>
              <h2 className="mt-1 truncate text-2xl font-semibold">
                Dispatch origin
              </h2>
              <p className="mt-1 truncate text-sm text-muted-foreground">
                Yard location used for deadhead and dispatch planning.
              </p>
            </div>
            <Link
              href="/admin/yards"
              className="mac-link size-9 shrink-0 px-0"
              aria-label="Close yard editor"
            >
              <X className="size-4" />
            </Link>
          </div>
        </div>

        <form action={saveYard} className="grid gap-4 p-4" noValidate>
          <input type="hidden" name="yard_id" value={yard?.id ?? ""} />
          <TextField name="name" label="Name" defaultValue={yard?.name ?? ""} />
          <TextField name="street" label="Street" defaultValue={addressValue(yard, "street")} />
          <TextField name="city" label="City" defaultValue={addressValue(yard, "city")} />
          <TextField
            name="state"
            label="State"
            defaultValue={addressValue(yard, "state") || "CA"}
            maxLength={2}
          />
          <TextField
            name="postal_code"
            label="ZIP"
            defaultValue={addressValue(yard, "postal_code")}
          />
          <NumberField
            name="latitude"
            label="Latitude"
            defaultValue={yard?.latitude?.toString() ?? ""}
          />
          <NumberField
            name="longitude"
            label="Longitude"
            defaultValue={yard?.longitude?.toString() ?? ""}
          />
          <label className="flex h-11 items-center gap-2 rounded-md bg-white/70 px-3 text-sm font-medium ring-1 ring-white/80">
            <input
              name="is_active"
              type="checkbox"
              defaultChecked={yard?.is_active ?? true}
              className="size-4"
            />
            Active
          </label>
          <Button type="submit" className="h-11 rounded-md">
            <Save className="size-4" />
            Save yard
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
  maxLength,
}: {
  name: string;
  label: string;
  defaultValue: string;
  maxLength?: number;
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
        required={name !== "street" && name !== "postal_code"}
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

function addressValue(yard: AdminYard | null | undefined, key: string) {
  const value = yard?.address[key];

  return typeof value === "string" ? value : "";
}

function formatAddress(address: Record<string, unknown>) {
  const street = typeof address.street === "string" ? address.street : "";
  const city = typeof address.city === "string" ? address.city : "";
  const state = typeof address.state === "string" ? address.state : "";

  return [street, city, state].filter(Boolean).join(", ") || "Address pending";
}
