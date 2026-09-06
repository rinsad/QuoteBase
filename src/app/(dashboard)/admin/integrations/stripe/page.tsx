import { redirect } from "next/navigation";
import { BadgeDollarSign, CheckCircle2, KeyRound, ShieldCheck } from "lucide-react";

import { saveStripeIntegration } from "@/app/(dashboard)/admin/integrations/stripe/actions";
import { Button } from "@/components/ui/button";
import { getAdminStripeIntegration } from "@/lib/admin/integrations";
import { getCurrentUser } from "@/lib/auth/current-user";

export default async function AdminStripeIntegrationPage({
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
    getAdminStripeIntegration(user.organization_id),
  ]);
  const credentialsReady = Boolean(integration.secret_key_last4);

  return (
    <>
      <div className="mb-5">
        <p className="text-sm font-semibold uppercase text-muted-foreground">
          Integrations
        </p>
        <h1 className="mt-1 text-3xl font-semibold tracking-normal sm:text-4xl">
          Stripe
        </h1>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-muted-foreground">
          Connect Stripe Checkout so tenants that prefer Stripe can collect card
          payment before COD quotes are marked won.
        </p>
      </div>

      {params.saved ? (
        <div className="mb-5 rounded-md border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          <p className="font-semibold">Stripe settings saved</p>
          <p className="mt-1">
            The encrypted Stripe credentials were updated for this organization.
          </p>
        </div>
      ) : null}

      <section className="grid gap-4 lg:grid-cols-3">
        <StatusCard
          icon={BadgeDollarSign}
          label="Stripe Checkout"
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
          label="Webhooks"
          value={integration.webhook_secret_configured ? "Configured" : "Missing"}
          good={integration.webhook_secret_configured}
        />
      </section>

      <section className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <form action={saveStripeIntegration} className="glass-panel p-5 sm:p-6">
          <div className="flex items-start justify-between gap-4 border-b border-border pb-5">
            <div>
              <p className="text-sm font-medium text-muted-foreground">
                COD checkout settings
              </p>
              <h2 className="mt-1 text-2xl font-semibold">
                Stripe Checkout connection
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
                  Enable Stripe
                </span>
                <span className="block text-xs text-muted-foreground">
                  COD quote acceptance will use Stripe Checkout when enabled.
                </span>
              </span>
            </label>

            <label>
              <span className="text-sm font-medium text-muted-foreground">
                Secret key
              </span>
              <input
                name="secret_key"
                type="password"
                placeholder={
                  integration.secret_key_last4
                    ? `Saved ending ${integration.secret_key_last4}; leave blank to keep it`
                    : "Paste sk_test_ or sk_live_ key"
                }
                className="soft-control mt-2 w-full"
                autoComplete="off"
              />
            </label>

            <label>
              <span className="text-sm font-medium text-muted-foreground">
                Webhook signing secret
              </span>
              <input
                name="webhook_secret"
                type="password"
                placeholder={
                  integration.webhook_secret_configured
                    ? "Saved; leave blank to keep it"
                    : "Paste whsec_ signing secret"
                }
                className="soft-control mt-2 w-full"
                autoComplete="off"
              />
              <span className="mt-2 block text-xs leading-5 text-muted-foreground">
                Point Stripe Checkout webhooks at /api/webhooks/stripe.
              </span>
            </label>
          </div>

          <Button type="submit" className="mt-5 h-11 rounded-md">
            Save Stripe settings
          </Button>
        </form>

        <aside className="space-y-4">
          <div className="glass-panel p-5">
            <p className="text-sm font-medium text-muted-foreground">
              Provider priority
            </p>
            <h2 className="mt-1 text-xl font-semibold">Stripe first</h2>
            <p className="mt-3 text-xs leading-5 text-muted-foreground">
              If Stripe is enabled for this organization, COD quote payments
              use Stripe Checkout. If Stripe is disabled, QuoteBase falls back
              to Authorize.net when it is enabled.
            </p>
          </div>

          <div className="glass-panel p-5">
            <p className="text-sm font-medium text-muted-foreground">
              Card handling
            </p>
            <h2 className="mt-1 text-xl font-semibold">Hosted by Stripe</h2>
            <p className="mt-3 text-xs leading-5 text-muted-foreground">
              QuoteBase creates a short-lived Checkout Session. Card entry is
              hosted by Stripe, and webhook events are processed once by event
              ID before a quote is marked won.
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
