import Link from "next/link";
import { redirect } from "next/navigation";
import { Save, Truck, X } from "lucide-react";

import { saveTruckingProfile } from "@/app/(dashboard)/admin/trucking-profiles/actions";
import { AdminNav } from "@/components/app-nav";
import { Button } from "@/components/ui/button";
import {
  getAdminTruckingProfiles,
  type AdminTruckingProfile,
} from "@/lib/admin/trucking-profiles";
import { getCurrentUser } from "@/lib/auth/current-user";

export default async function TruckingProfilesPage({
  searchParams,
}: {
  searchParams: Promise<{ edit?: string; new?: string; saved?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role !== "admin") redirect("/dashboard");

  const [params, data] = await Promise.all([
    searchParams,
    getAdminTruckingProfiles(user.organization_id),
  ]);
  const selected = data.profiles.find((profile) => profile.id === params.edit) ?? null;

  return (
    <main className="app-background">
      <div className="mx-auto w-full max-w-6xl">
        <header className="mac-window">
          <div className="mac-toolbar">
            <div className="min-w-0">
              <p className="text-sm font-medium text-muted-foreground">Materials &amp; Services Pricing</p>
              <h1 className="truncate text-lg font-semibold">Trucking profiles</h1>
            </div>
            <AdminNav />
          </div>
        </header>

        {params.saved ? (
          <div className="mt-6 rounded-[20px] border border-emerald-100 bg-emerald-50/80 px-5 py-4 text-sm font-medium text-emerald-800">
            Trucking profile saved.
          </div>
        ) : null}

        <section className="mt-6 glass-panel p-6 sm:p-8">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div className="flex items-center gap-3">
              <div className="icon-well text-blue-700"><Truck className="size-6" /></div>
              <div>
                <p className="text-sm font-medium text-muted-foreground">Recommendation engine</p>
                <h2 className="accent-title text-3xl font-semibold">Trucking profiles</h2>
              </div>
            </div>
            <Link href="/admin/trucking-profiles?new=1" className="mac-button-primary h-10 px-4">
              New profile
            </Link>
          </div>
          <p className="mt-4 max-w-3xl text-sm leading-6 text-muted-foreground">
            QuoteBase resolves one complete profile by plant, then supplier, then tenant default. Distance is calculated from the selected plant to the job site.
          </p>
        </section>

        <section className="mt-6 glass-panel overflow-hidden">
          <div className="master-table-head lg:grid-cols-[1.2fr_1fr_1fr_1fr_90px] lg:gap-4">
            <span>Profile</span><span>Assignment</span><span>Average speed</span><span>Hourly rate</span><span>Action</span>
          </div>
          <div className="divide-y divide-border">
            {data.profiles.map((profile) => (
              <Link key={profile.id} href={`/admin/trucking-profiles?edit=${profile.id}`}
                className="grid gap-2 px-4 py-4 hover:bg-secondary/70 lg:grid-cols-[1.2fr_1fr_1fr_1fr_90px] lg:items-center lg:gap-4">
                <div><p className="text-sm font-semibold">{profile.name}</p><p className="text-xs text-muted-foreground">Round trip × {profile.roundTripFactor}</p></div>
                <p className="text-sm">{profile.assignmentLabel}</p>
                <p className="font-mono text-sm">{profile.averageSpeedMph} MPH</p>
                <p className="font-mono text-sm">{formatCurrency(profile.hourlyRate)}/hr</p>
                <span className="mac-link h-9 justify-center px-3 text-xs">Edit</span>
              </Link>
            ))}
            {!data.profiles.length ? <p className="px-5 py-8 text-sm text-muted-foreground">No trucking profiles configured.</p> : null}
          </div>
        </section>

        <ProfileEditor
          profile={selected}
          open={Boolean(params.new || selected)}
          suppliers={data.suppliers}
          plants={data.plants}
        />
      </div>
    </main>
  );
}

function ProfileEditor({ profile, open, suppliers, plants }: {
  profile: AdminTruckingProfile | null;
  open: boolean;
  suppliers: Array<{ id: string; name: string }>;
  plants: Array<{ id: string; name: string; supplierId: string }>;
}) {
  if (!open) return null;
  const assignment = profile?.assignmentScope === "tenant"
    ? "tenant"
    : profile?.assignmentScope && profile.assignmentTargetId
      ? `${profile.assignmentScope}:${profile.assignmentTargetId}`
      : "tenant";

  return (
    <aside className="customer-slide-over" aria-label="Trucking profile editor">
      <Link href="/admin/trucking-profiles" className="customer-slide-backdrop" aria-label="Close editor" />
      <div className="customer-slide-panel">
        <div className="slide-panel-header flex items-start justify-between gap-3">
          <div><p className="text-sm text-muted-foreground">{profile ? "Edit profile" : "New profile"}</p><h2 className="mt-1 text-2xl font-semibold">Trucking recommendation</h2></div>
          <Link href="/admin/trucking-profiles" className="mac-link size-9 px-0" aria-label="Close editor"><X className="size-4" /></Link>
        </div>
        <form action={saveTruckingProfile} className="grid gap-4 p-4" noValidate>
          <input type="hidden" name="profile_id" value={profile?.id ?? ""} />
          <TextField name="name" label="Profile name" value={profile?.name ?? ""} />
          <NumberField name="average_speed_mph" label="Average speed (MPH)" value={profile?.averageSpeedMph ?? 35} max={100} />
          <NumberField name="hourly_rate" label="Hourly trucking rate" value={profile?.hourlyRate ?? 95} max={10000} />
          <NumberField name="round_trip_factor" label="Round-trip factor" value={profile?.roundTripFactor ?? 2} max={10} />
          <label className="block"><span className="text-sm font-medium text-muted-foreground">Applies to</span>
            <select name="assignment" defaultValue={assignment} className="soft-control mt-2 w-full" required>
              <option value="tenant">Tenant default</option>
              <optgroup label="Suppliers">{suppliers.map((supplier) => <option key={supplier.id} value={`supplier:${supplier.id}`}>{supplier.name}</option>)}</optgroup>
              <optgroup label="Plants">{plants.map((plant) => <option key={plant.id} value={`plant:${plant.id}`}>{plant.name}</option>)}</optgroup>
            </select>
          </label>
          <div className="soft-row p-4 text-xs leading-5 text-muted-foreground">
            Excel time adjustments remain active: +0.50 hr under 18 miles, +0.375 under 25, and +0.25 under 30.
          </div>
          <Button type="submit" className="h-11 rounded-md"><Save className="size-4" />Save profile</Button>
        </form>
      </div>
    </aside>
  );
}

function TextField({ name, label, value }: { name: string; label: string; value: string }) {
  return <label className="block"><span className="text-sm font-medium text-muted-foreground">{label}</span><input name={name} defaultValue={value} className="soft-control mt-2 w-full" required /></label>;
}

function NumberField({ name, label, value, max }: { name: string; label: string; value: number; max: number }) {
  return <label className="block"><span className="text-sm font-medium text-muted-foreground">{label}</span><input name={name} type="number" min={0.01} max={max} step={0.01} defaultValue={value} className="soft-control mt-2 w-full" required /></label>;
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value);
}
