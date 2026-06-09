import { redirect } from "next/navigation";
import { DatabaseZap, ShieldCheck } from "lucide-react";

import { savePipedriveIntegration } from "@/app/(dashboard)/admin/integrations/pipedrive/actions";
import { AdminNav } from "@/components/app-nav";
import { Button } from "@/components/ui/button";
import { getAdminPipedriveIntegration } from "@/lib/admin/integrations";
import { getCurrentUser } from "@/lib/auth/current-user";
import { getBaseUrl } from "@/lib/env";

export default async function AdminPipedriveIntegrationPage({
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
    getAdminPipedriveIntegration(user.organization_id),
  ]);
  const syncUrl = `${getBaseUrl()}/api/cron/pipedrive-sync`;

  return (
    <main className="app-background">
      <div className="mx-auto w-full max-w-5xl">
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
                  Integrations
                </p>
                <h1 className="truncate text-lg font-semibold">Pipedrive</h1>
              </div>
            </div>
            <AdminNav />
          </div>
        </header>

        {params.saved ? (
          <div className="mt-6 rounded-[20px] border border-emerald-100 bg-emerald-50/80 px-5 py-4 text-sm font-medium text-emerald-800 shadow-sm">
            Pipedrive integration settings saved for this organization.
          </div>
        ) : null}

        <section className="mt-6 glass-panel p-6 sm:p-8">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex items-center gap-3">
              <div className="icon-well text-blue-700">
                <DatabaseZap className="size-6" />
              </div>
              <div>
                <p className="text-sm font-medium text-muted-foreground">
                  Customer Source of Truth
                </p>
                <h2 className="accent-title text-3xl font-semibold tracking-normal">
                  Pipedrive customer sync
                </h2>
              </div>
            </div>
            <div className="flex items-center gap-2 rounded-full bg-blue-50 px-3 py-1.5 text-sm font-medium text-blue-700 ring-1 ring-blue-100">
              <ShieldCheck className="size-4" />
              Secrets encrypted
            </div>
          </div>
          <p className="mt-4 max-w-3xl text-sm leading-6 text-muted-foreground">
            Pipedrive owns customer identity and contact fields. QuoteBase keeps
            WM-specific fields such as payment terms, pricing notes, and
            default plant locally.
          </p>
        </section>

        <form
          action={savePipedriveIntegration}
          className="mt-6 glass-panel p-5 sm:p-6"
        >
          <div className="grid gap-5 sm:grid-cols-2">
            <label className="flex items-center gap-3 rounded-[18px] border border-white/70 bg-white/65 px-4 py-3">
              <input
                name="is_enabled"
                type="checkbox"
                defaultChecked={integration.is_enabled}
                className="size-4 accent-blue-700"
              />
              <span>
                <span className="block text-sm font-semibold">
                  Enable Pipedrive sync
                </span>
                <span className="block text-xs text-muted-foreground">
                  Push new WM customers and run native scheduled pulls.
                </span>
              </span>
            </label>

            <label>
              <span className="text-sm font-medium text-muted-foreground">
                Sync interval minutes
              </span>
              <input
                name="sync_interval_minutes"
                type="number"
                min="1"
                max="1440"
                defaultValue={integration.sync_interval_minutes}
                className="soft-control mt-2 w-full"
              />
            </label>

            <label className="sm:col-span-2">
              <span className="text-sm font-medium text-muted-foreground">
                Pipedrive API base URL
              </span>
              <input
                name="api_base_url"
                defaultValue={integration.api_base_url}
                className="soft-control mt-2 w-full"
              />
            </label>

            <label className="sm:col-span-2">
              <span className="text-sm font-medium text-muted-foreground">
                Pipedrive API token
              </span>
              <input
                name="api_token"
                type="password"
                placeholder={
                  integration.api_token_configured
                    ? "API token saved; leave blank to keep it"
                    : "Pipedrive API token"
                }
                className="soft-control mt-2 w-full"
              />
            </label>
          </div>

          <div className="mt-5 rounded-[18px] border border-white/70 bg-white/65 p-4">
            <p className="text-sm font-semibold">Native Cron Sync URL</p>
            <input
              readOnly
              value={syncUrl}
              className="soft-control mt-2 w-full bg-white/80 font-mono text-xs"
            />
            <p className="mt-2 text-xs leading-5 text-muted-foreground">
              Vercel calls this route every 30 minutes. Set CRON_SECRET in the
              deployment environment so production cron requests are authorized.
            </p>
          </div>

          <Button type="submit" className="mt-5 h-11 w-full rounded-full">
            Save Pipedrive settings
          </Button>
        </form>
      </div>
    </main>
  );
}
