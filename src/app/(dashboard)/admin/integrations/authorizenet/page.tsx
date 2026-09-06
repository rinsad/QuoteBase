import { redirect } from "next/navigation";
import { BadgeDollarSign, CheckCircle2, KeyRound, ShieldCheck } from "lucide-react";

import { saveAuthorizeNetIntegration } from "@/app/(dashboard)/admin/integrations/authorizenet/actions";
import { Button } from "@/components/ui/button";
import { getAdminAuthorizeNetIntegration } from "@/lib/admin/integrations";
import { getCurrentUser } from "@/lib/auth/current-user";

export default async function AdminAuthorizeNetIntegrationPage({
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
    getAdminAuthorizeNetIntegration(user.organization_id),
  ]);
  const credentialsReady =
    Boolean(integration.api_login_id_last4) &&
    integration.transaction_key_configured;

  return (
    <>
      <div className="mb-5">
        <p className="text-sm font-semibold uppercase text-muted-foreground">
          Integrations
        </p>
        <h1 className="mt-1 text-3xl font-semibold tracking-normal sm:text-4xl">
          Authorize.net
        </h1>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-muted-foreground">
          Connect Accept Hosted so COD customers can pay by card before the
          quote is marked won.
        </p>
      </div>

      {params.saved ? (
        <div className="mb-5 rounded-md border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          <p className="font-semibold">Authorize.net settings saved</p>
          <p className="mt-1">
            The payment environment and encrypted credentials were updated for
            this organization.
          </p>
        </div>
      ) : null}

      <section className="grid gap-4 lg:grid-cols-3">
        <StatusCard
          icon={BadgeDollarSign}
          label="Hosted payments"
          value={integration.is_enabled ? "Enabled" : "Disabled"}
          good={integration.is_enabled}
        />
        <StatusCard
          icon={KeyRound}
          label="Credentials"
          value={credentialsReady ? "Configured" : "Missing"}
          good={credentialsReady}
        />
        <StatusCard
          icon={ShieldCheck}
          label="Environment"
          value={integration.environment === "production" ? "Production" : "Sandbox"}
          good={integration.environment === "production" || credentialsReady}
        />
      </section>

      <section className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <form action={saveAuthorizeNetIntegration} className="glass-panel p-5 sm:p-6">
          <div className="flex items-start justify-between gap-4 border-b border-border pb-5">
            <div>
              <p className="text-sm font-medium text-muted-foreground">
                COD checkout settings
              </p>
              <h2 className="mt-1 text-2xl font-semibold">
                Accept Hosted connection
              </h2>
            </div>
          </div>

          <div className="mt-5 grid gap-5 sm:grid-cols-2">
            <label className="flex items-center gap-3 rounded-md border border-border bg-background px-4 py-3">
              <input
                name="is_enabled"
                type="checkbox"
                defaultChecked={integration.is_enabled}
                className="size-4 accent-[#3d6652]"
              />
              <span>
                <span className="block text-sm font-semibold">
                  Enable Authorize.net
                </span>
                <span className="block text-xs text-muted-foreground">
                  COD quote acceptance will require payment.
                </span>
              </span>
            </label>

            <label>
              <span className="text-sm font-medium text-muted-foreground">
                Environment
              </span>
              <select
                name="environment"
                defaultValue={integration.environment}
                className="soft-control mt-2 w-full"
              >
                <option value="sandbox">Sandbox</option>
                <option value="production">Production</option>
              </select>
            </label>

            <label>
              <span className="text-sm font-medium text-muted-foreground">
                API Login ID
              </span>
              <input
                name="api_login_id"
                type="password"
                placeholder={
                  integration.api_login_id_last4
                    ? `Saved ending ${integration.api_login_id_last4}; leave blank to keep it`
                    : "Paste API Login ID"
                }
                className="soft-control mt-2 w-full"
                autoComplete="off"
              />
            </label>

            <label>
              <span className="text-sm font-medium text-muted-foreground">
                Transaction Key
              </span>
              <input
                name="transaction_key"
                type="password"
                placeholder={
                  integration.transaction_key_configured
                    ? "Transaction key saved; leave blank to keep it"
                    : "Paste Transaction Key"
                }
                className="soft-control mt-2 w-full"
                autoComplete="off"
              />
            </label>
          </div>

          <Button type="submit" className="mt-5 h-11 rounded-md">
            Save Authorize.net settings
          </Button>
        </form>

        <aside className="space-y-4">
          <div className="glass-panel p-5">
            <p className="text-sm font-medium text-muted-foreground">
              Acceptance rule
            </p>
            <h2 className="mt-1 text-xl font-semibold">COD vs Net30</h2>
            <p className="mt-3 text-xs leading-5 text-muted-foreground">
              COD customers open the hosted card checkout first. Customers with
              other saved terms, such as Net30, accept directly as a terms
              confirmation.
            </p>
          </div>

          <div className="glass-panel p-5">
            <p className="text-sm font-medium text-muted-foreground">
              Card handling
            </p>
            <h2 className="mt-1 text-xl font-semibold">Hosted by Authorize.net</h2>
            <p className="mt-3 text-xs leading-5 text-muted-foreground">
              QuoteBase requests a short-lived hosted payment token. The card
              form is served by Authorize.net, and QuoteBase stores only payment
              status, transaction ID, and non-sensitive response details.
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
  icon: typeof BadgeDollarSign;
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
