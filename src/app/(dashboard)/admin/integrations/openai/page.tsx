import { redirect } from "next/navigation";
import { Bot, CheckCircle2, KeyRound, ShieldCheck } from "lucide-react";

import { saveOpenAIIntegration } from "@/app/(dashboard)/admin/integrations/openai/actions";
import { Button } from "@/components/ui/button";
import { getAdminOpenAIIntegration } from "@/lib/admin/integrations";
import { getCurrentUser } from "@/lib/auth/current-user";
import { OPENAI_MODEL_OPTIONS } from "@/lib/integrations/openai";

export default async function AdminOpenAIIntegrationPage({
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
    getAdminOpenAIIntegration(user.organization_id),
  ]);
  const apiKeyReady = Boolean(integration.api_key_last4);

  return (
    <>
      <div className="mb-5">
        <p className="text-sm font-semibold uppercase text-muted-foreground">
          Integrations
        </p>
        <h1 className="mt-1 text-3xl font-semibold tracking-normal sm:text-4xl">
          OpenAI
        </h1>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-muted-foreground">
          Configure the tenant-owned OpenAI key and model used by Ask QuoteBase.
        </p>
      </div>

      {params.saved ? (
        <div className="mb-5 rounded-md border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          <p className="font-semibold">OpenAI settings saved</p>
          <p className="mt-1">
            This organization&apos;s encrypted OpenAI configuration was updated.
          </p>
        </div>
      ) : null}

      <section className="grid gap-4 lg:grid-cols-3">
        <StatusCard
          icon={Bot}
          label="Ask QuoteBase"
          value={integration.is_enabled ? "Enabled" : "Disabled"}
          good={integration.is_enabled}
        />
        <StatusCard
          icon={KeyRound}
          label="Tenant API Key"
          value={apiKeyReady ? "Configured" : "Missing"}
          good={apiKeyReady}
        />
        <StatusCard
          icon={ShieldCheck}
          label="Storage"
          value="Encrypted"
          good
        />
      </section>

      <section className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <form action={saveOpenAIIntegration} className="glass-panel p-5 sm:p-6">
          <div className="flex items-start justify-between gap-4 border-b border-border pb-5">
            <div>
              <p className="text-sm font-medium text-muted-foreground">
                Tenant assistant settings
              </p>
              <h2 className="mt-1 text-2xl font-semibold">
                OpenAI configuration
              </h2>
            </div>
            <div className="inline-flex items-center gap-2 rounded-md bg-secondary px-3 py-2 text-xs font-semibold text-primary ring-1 ring-border">
              <ShieldCheck className="size-4" />
              Secrets encrypted
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
                  Enable Ask QuoteBase
                </span>
                <span className="block text-xs text-muted-foreground">
                  Dashboard assistant uses this organization&apos;s key.
                </span>
              </span>
            </label>

            <label>
              <span className="text-sm font-medium text-muted-foreground">
                Model
              </span>
              <select
                name="model"
                defaultValue={integration.model}
                className="soft-control mt-2 w-full"
              >
                {OPENAI_MODEL_OPTIONS.map((model) => (
                  <option key={model.value} value={model.value}>
                    {model.label} - {model.description}
                  </option>
                ))}
              </select>
            </label>

            <label>
              <span className="text-sm font-medium text-muted-foreground">
                OpenAI API key
              </span>
              <input
                name="api_key"
                type="password"
                placeholder={
                  integration.api_key_last4
                    ? `Saved ending ${integration.api_key_last4}; leave blank to keep it`
                    : "Paste OpenAI API key"
                }
                className="soft-control mt-2 w-full"
                autoComplete="off"
              />
            </label>
          </div>

          <Button type="submit" className="mt-5 h-11 rounded-md">
            Save OpenAI settings
          </Button>
        </form>

        <aside className="space-y-4">
          <div className="glass-panel p-5">
            <p className="text-sm font-medium text-muted-foreground">
              Used by
            </p>
            <h2 className="mt-1 text-xl font-semibold">Ask QuoteBase</h2>
            <p className="mt-3 text-xs leading-5 text-muted-foreground">
              The dashboard assistant uses the selected model with tenant-scoped
              quote context.
            </p>
          </div>

          <div className="glass-panel p-5">
            <p className="text-sm font-medium text-muted-foreground">
              Tenant ownership
            </p>
            <h2 className="mt-1 text-xl font-semibold">No shared key</h2>
            <p className="mt-3 text-xs leading-5 text-muted-foreground">
              Each organization can enable, disable, or rotate OpenAI access
              independently.
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
  icon: typeof Bot;
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
