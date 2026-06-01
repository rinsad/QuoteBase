import Link from "next/link";
import { redirect } from "next/navigation";
import { MapPin, Navigation, Save } from "lucide-react";

import { saveYard } from "@/app/(dashboard)/admin/yards/actions";
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
  const editing = yards.find((yard) => yard.id === params.edit);

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
            <div className="flex flex-wrap items-center justify-end gap-2">
              <Link href="/admin/plants" className="mac-link">
                Materials
              </Link>
              <Link href="/admin/pricing" className="mac-link">
                Pricing
              </Link>
              <Link href="/dashboard" className="mac-link">
                Dashboard
              </Link>
            </div>
          </div>
        </header>

        {params.saved ? (
          <div className="mt-6 rounded-[20px] border border-emerald-100 bg-emerald-50/80 px-5 py-4 text-sm font-medium text-emerald-800 shadow-sm">
            Yard saved.
          </div>
        ) : null}

        <section className="mt-6 grid gap-6 lg:grid-cols-[0.85fr_1.15fr]">
          <form action={saveYard} className="glass-panel p-5 sm:p-6">
            <div className="flex items-center gap-3">
              <div className="icon-well text-blue-700">
                <Navigation className="size-6" />
              </div>
              <div>
                <p className="text-sm font-medium text-muted-foreground">
                  {editing ? "Edit Yard" : "New Yard"}
                </p>
                <h2 className="accent-title text-2xl font-semibold tracking-normal">
                  Dispatch origin
                </h2>
              </div>
            </div>

            <input type="hidden" name="yard_id" value={editing?.id ?? ""} />

            <div className="mt-6 grid gap-4 sm:grid-cols-2">
              <TextField name="name" label="Name" defaultValue={editing?.name ?? ""} />
              <TextField
                name="street"
                label="Street"
                defaultValue={addressValue(editing, "street")}
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
                Save yard
              </Button>
            </div>
          </form>

          <section className="glass-panel p-5 sm:p-6">
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

            <div className="mt-6 space-y-3">
              {yards.map((yard) => (
                <Link
                  key={yard.id}
                  href={`/admin/yards?edit=${yard.id}`}
                  className="soft-row block px-4 py-4 transition hover:bg-white/80"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h3 className="truncate font-semibold">{yard.name}</h3>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {formatAddress(yard.address)}
                      </p>
                    </div>
                    <span
                      className={`soft-chip shrink-0 ${
                        yard.is_active
                          ? "bg-emerald-50 text-emerald-700 ring-emerald-100"
                          : "bg-slate-100 text-slate-600 ring-slate-200"
                      }`}
                    >
                      {yard.is_active ? "Active" : "Inactive"}
                    </span>
                  </div>
                  <p className="mt-3 font-mono text-xs text-muted-foreground">
                    {yard.latitude ?? "lat pending"},{" "}
                    {yard.longitude ?? "lng pending"}
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

function addressValue(yard: AdminYard | undefined, key: string) {
  const value = yard?.address[key];

  return typeof value === "string" ? value : "";
}

function formatAddress(address: Record<string, unknown>) {
  const street = typeof address.street === "string" ? address.street : "";
  const city = typeof address.city === "string" ? address.city : "";
  const state = typeof address.state === "string" ? address.state : "";

  return [street, city, state].filter(Boolean).join(", ") || "Address pending";
}
