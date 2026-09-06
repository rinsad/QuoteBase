import { redirect } from "next/navigation";
import { CheckCircle2, KeyRound, MapPinned, ShieldCheck } from "lucide-react";

import { saveMapboxIntegration } from "@/app/(dashboard)/admin/integrations/mapbox/actions";
import { Button } from "@/components/ui/button";
import { getAdminMapboxIntegration } from "@/lib/admin/integrations";
import { getCurrentUser } from "@/lib/auth/current-user";

export default async function AdminMapboxIntegrationPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string }>;
}) {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/login");
  }

  if (user.role !== "admin") {
    redirect("/dashboard");
  }

  const [params, integration] = await Promise.all([
    searchParams,
    getAdminMapboxIntegration(user.organization_id),
  ]);
  const credentialsReady = Boolean(integration.public_access_token_last4);

  return (
    <>
      <div className="mb-5">
        <p className="text-sm font-semibold uppercase text-muted-foreground">
          Integrations
        </p>
        <h1 className="mt-1 text-3xl font-semibold tracking-normal sm:text-4xl">
          Mapbox
        </h1>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-muted-foreground">
          Configure tenant-owned Mapbox address search for plant locations and
          job site delivery addresses.
        </p>
      </div>

      {params.saved ? (
        <div className="mb-5 rounded-md border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          <p className="font-semibold">Mapbox settings saved</p>
          <p className="mt-1">
            This organization&apos;s encrypted Mapbox token was updated.
          </p>
        </div>
      ) : null}

      <section className="grid gap-4 lg:grid-cols-3">
        <StatusCard
          icon={MapPinned}
          label="Address Search"
          value={integration.is_enabled ? "Enabled" : "Disabled"}
          good={integration.is_enabled}
        />
        <StatusCard
          icon={KeyRound}
          label="Tenant Token"
          value={credentialsReady ? "Configured" : "Missing"}
          good={credentialsReady}
        />
        <StatusCard
          icon={ShieldCheck}
          label="Storage"
          value="Encrypted"
          good
        />
      </section>

      <section className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <form action={saveMapboxIntegration} className="glass-panel p-5 sm:p-6">
          <div className="flex items-start justify-between gap-4 border-b border-border pb-5">
            <div>
              <p className="text-sm font-medium text-muted-foreground">
                Tenant location settings
              </p>
              <h2 className="mt-1 text-2xl font-semibold">
                Mapbox address search
              </h2>
            </div>
          </div>

          <div className="mt-5 grid gap-5">
            <label className="flex items-center gap-3 rounded-md border border-border bg-background px-4 py-3">
              <input
                name="is_enabled"
                type="checkbox"
                defaultChecked={integration.is_enabled}
                className="size-4 accent-[#3d6652]"
              />
              <span>
                <span className="block text-sm font-semibold">
                  Enable Mapbox search
                </span>
                <span className="block text-xs text-muted-foreground">
                  Plant and job-site forms will use this tenant token.
                </span>
              </span>
            </label>

            <label>
              <span className="text-sm font-medium text-muted-foreground">
                Public access token
              </span>
              <input
                name="public_access_token"
                type="password"
                placeholder={
                  integration.public_access_token_last4
                    ? `Saved ending ${integration.public_access_token_last4}; leave blank to keep it`
                    : "Paste pk. token"
                }
                className="soft-control mt-2 w-full"
                autoComplete="off"
              />
              <span className="mt-2 block text-xs leading-5 text-muted-foreground">
                Use a Mapbox public token restricted to the domains where this
                tenant runs QuoteBase.
              </span>
            </label>
          </div>

          <Button type="submit" className="mt-5 h-11 rounded-md">
            Save Mapbox settings
          </Button>
        </form>

        <aside className="space-y-4">
          <div className="glass-panel p-5">
            <p className="text-sm font-medium text-muted-foreground">
              Used by
            </p>
            <h2 className="mt-1 text-xl font-semibold">Address selection</h2>
            <p className="mt-3 text-xs leading-5 text-muted-foreground">
              The selected result saves address details, Mapbox ID, latitude,
              and longitude for plant and job-site records.
            </p>
          </div>

          <div className="glass-panel p-5">
            <p className="text-sm font-medium text-muted-foreground">
              Tenant ownership
            </p>
            <h2 className="mt-1 text-xl font-semibold">No env token</h2>
            <p className="mt-3 text-xs leading-5 text-muted-foreground">
              Each organization can enable or disable Mapbox independently
              through Admin, without changing application environment values.
            </p>
          </div>
        </aside>
      </section>
    </>
  );
}

function StatusCard({
  icon: Icon,
  label,
  value,
  good,
}: {
  icon: typeof MapPinned;
  label: string;
  value: string;
  good: boolean;
}) {
  return (
    <div className="glass-tile p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase text-muted-foreground">
            {label}
          </p>
          <p className="mt-2 text-2xl font-semibold">{value}</p>
        </div>
        <div className="icon-well text-primary">
          <Icon className="size-5" />
        </div>
      </div>
      <p className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
        <CheckCircle2
          className={`size-4 ${good ? "text-primary" : "text-amber-700"}`}
        />
        {good ? "Ready" : "Needs attention"}
      </p>
    </div>
  );
}
