import { redirect } from "next/navigation";
import {
  CheckCircle2,
  Clock3,
  DatabaseZap,
  KeyRound,
  ShieldCheck,
} from "lucide-react";

import {
  savePipedriveIntegration,
  syncPipedriveNow,
} from "@/app/(dashboard)/admin/integrations/pipedrive/actions";
import { SyncSubmitButton } from "@/app/(dashboard)/admin/integrations/pipedrive/sync-submit-button";
import { Button } from "@/components/ui/button";
import { getAdminPipedriveIntegration } from "@/lib/admin/integrations";
import { getCurrentUser } from "@/lib/auth/current-user";
import { getBaseUrl } from "@/lib/env";

export default async function AdminPipedriveIntegrationPage({
  searchParams,
}: {
  searchParams: Promise<{
    saved?: string;
    synced?: string;
    imported?: string;
    pushed?: string;
    attempted?: string;
    failed?: string;
    eligible?: string;
    skipped?: string;
  }>;
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
  const canSync = integration.is_enabled && integration.api_token_configured;

  return (
    <>
      <div className="mb-5">
        <div>
          <p className="text-sm font-semibold uppercase text-muted-foreground">
            Integrations
          </p>
          <h1 className="mt-1 text-3xl font-semibold tracking-normal sm:text-4xl">
            Pipedrive
          </h1>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-muted-foreground">
            Connect Pipedrive as the customer source of truth. QuoteBase pushes
            new customers and can pull updated contacts into the customer desk.
          </p>
        </div>
      </div>

      {params.saved ? (
        <StatusBanner
          tone="success"
          title="Pipedrive settings saved"
          detail="The encrypted token and sync settings were updated for this organization."
        />
      ) : null}

      {params.synced ? (
        <StatusBanner
          tone={params.skipped === "1" ? "warning" : "success"}
          title={
            params.skipped === "1"
              ? "Pipedrive sync skipped"
              : "Pipedrive sync complete"
          }
          detail={
            params.skipped === "1"
              ? "Enable the integration and save an API token before running sync."
              : `${params.imported ?? "0"} imported or updated from Pipedrive. ${params.pushed ?? "0"} pushed from QuoteBase. ${params.failed ?? "0"} push failures.`
          }
        />
      ) : null}

      <section className="grid gap-4 xl:grid-cols-[1fr_1fr_1fr_auto]">
        <StatusCard
          icon={DatabaseZap}
          label="Connection"
          value={integration.is_enabled ? "Enabled" : "Disabled"}
          good={integration.is_enabled}
        />
        <StatusCard
          icon={KeyRound}
          label="API token"
          value={integration.api_token_configured ? "Configured" : "Missing"}
          good={integration.api_token_configured}
        />
        <StatusCard
          icon={Clock3}
          label="Unsynced local"
          value={`${integration.unsynced_customer_count} customers`}
          good={canSync}
        />
        <div className="glass-tile flex min-h-28 flex-col justify-between p-4">
          <div>
            <p className="text-xs font-semibold uppercase text-muted-foreground">
              Manual action
            </p>
            <p className="mt-2 text-xl font-semibold">Customer sync</p>
          </div>
          <form action={syncPipedriveNow}>
            <SyncSubmitButton disabled={!canSync} />
          </form>
        </div>
      </section>

      <section className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <form action={savePipedriveIntegration} className="glass-panel p-5 sm:p-6">
          <div className="flex items-start justify-between gap-4 border-b border-border pb-5">
            <div>
              <p className="text-sm font-medium text-muted-foreground">
                Customer sync settings
              </p>
              <h2 className="mt-1 text-2xl font-semibold">
                Pipedrive connection
              </h2>
            </div>
            <div className="inline-flex items-center gap-2 rounded-md bg-[#ecf2ed] px-3 py-2 text-xs font-semibold text-primary ring-1 ring-border">
              <ShieldCheck className="size-4" />
              Secrets encrypted
            </div>
          </div>

          <div className="mt-5 grid gap-5 sm:grid-cols-2">
            <label className="flex items-center gap-3 rounded-md border border-border bg-[#fbfcf8] px-4 py-3">
              <input
                name="is_enabled"
                type="checkbox"
                defaultChecked={integration.is_enabled}
                className="size-4 accent-[#3d6652]"
              />
              <span>
                <span className="block text-sm font-semibold">
                  Enable Pipedrive sync
                </span>
                <span className="block text-xs text-muted-foreground">
                  Push new customers and allow scheduled pulls.
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
                    : "Paste Pipedrive API token"
                }
                className="soft-control mt-2 w-full"
                autoComplete="off"
              />
              <span className="mt-2 block text-xs text-muted-foreground">
                The token is encrypted at rest and is never shown again.
              </span>
            </label>
          </div>

          <Button type="submit" className="mt-5 h-11 rounded-md">
            Save Pipedrive settings
          </Button>
        </form>

        <aside className="space-y-4">
          <div className="glass-panel p-5">
            <p className="text-sm font-medium text-muted-foreground">
              Two-way sync
            </p>
            <h2 className="mt-1 text-xl font-semibold">How it runs</h2>
            <p className="mt-3 text-xs leading-5 text-muted-foreground">
              Sync pulls Pipedrive people into QuoteBase, then pushes up to the
              first 500 active QuoteBase customers that do not already have a
              Pipedrive person ID.
            </p>
          </div>

          <div className="glass-panel p-5">
            <p className="text-sm font-medium text-muted-foreground">
              Native cron sync
            </p>
            <h2 className="mt-1 text-xl font-semibold">Scheduled import</h2>
            <input
              readOnly
              value={syncUrl}
              className="soft-control mt-4 w-full bg-white font-mono text-xs"
            />
            <p className="mt-3 text-xs leading-5 text-muted-foreground">
              Production should set CRON_SECRET and call this route on the
              configured schedule. Cron pulls from Pipedrive; manual sync also
              pushes unsynced QuoteBase customers.
            </p>
          </div>

          <div className="glass-panel p-5">
            <p className="text-sm font-medium text-muted-foreground">
              Data ownership
            </p>
            <h2 className="mt-1 text-xl font-semibold">What sync changes</h2>
            <div className="mt-4 grid gap-2 text-sm text-muted-foreground">
              <CheckLine text="Pull imports Pipedrive people and organizations into QuoteBase." />
              <CheckLine text="Push sends unsynced QuoteBase customers into Pipedrive." />
              <CheckLine text="QuoteBase keeps pricing notes, payment terms, plants, and job sites locally." />
              <CheckLine text="Every push, pull, and manual sync is written to audit log." />
            </div>
          </div>
        </aside>
      </section>
    </>
  );
}

function StatusBanner({
  tone,
  title,
  detail,
}: {
  tone: "success" | "warning";
  title: string;
  detail: string;
}) {
  return (
    <div
      className={`mb-5 rounded-md border px-4 py-3 text-sm ${
        tone === "success"
          ? "border-emerald-100 bg-emerald-50 text-emerald-800"
          : "border-amber-100 bg-amber-50 text-amber-800"
      }`}
    >
      <p className="font-semibold">{title}</p>
      <p className="mt-1">{detail}</p>
    </div>
  );
}

function StatusCard({
  icon: Icon,
  label,
  value,
  good,
}: {
  icon: typeof DatabaseZap;
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

function CheckLine({ text }: { text: string }) {
  return (
    <p className="flex gap-2">
      <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-primary" />
      <span>{text}</span>
    </p>
  );
}
