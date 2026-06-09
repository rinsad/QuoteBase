import { redirect } from "next/navigation";
import { BellRing, ShieldCheck } from "lucide-react";

import { saveSlackIntegration } from "@/app/(dashboard)/admin/integrations/slack/actions";
import { AdminNav } from "@/components/app-nav";
import { Button } from "@/components/ui/button";
import { getAdminSlackIntegration } from "@/lib/admin/integrations";
import { getCurrentUser } from "@/lib/auth/current-user";
import { getBaseUrl } from "@/lib/env";

export default async function AdminSlackIntegrationPage({
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
    getAdminSlackIntegration(user.organization_id),
  ]);
  const requestUrl = `${getBaseUrl()}/api/slack/actions`;

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
                <h1 className="truncate text-lg font-semibold">Slack</h1>
              </div>
            </div>
            <AdminNav />
          </div>
        </header>

        {params.saved ? (
          <div className="mt-6 rounded-[20px] border border-emerald-100 bg-emerald-50/80 px-5 py-4 text-sm font-medium text-emerald-800 shadow-sm">
            Slack integration settings saved for this organization.
          </div>
        ) : null}

        <section className="mt-6 glass-panel p-6 sm:p-8">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex items-center gap-3">
              <div className="icon-well text-blue-700">
                <BellRing className="size-6" />
              </div>
              <div>
                <p className="text-sm font-medium text-muted-foreground">
                  Tenant Approval Routing
                </p>
                <h2 className="accent-title text-3xl font-semibold tracking-normal">
                  Slack quote approvals
                </h2>
              </div>
            </div>
            <div className="flex items-center gap-2 rounded-full bg-blue-50 px-3 py-1.5 text-sm font-medium text-blue-700 ring-1 ring-blue-100">
              <ShieldCheck className="size-4" />
              Secrets encrypted
            </div>
          </div>
          <p className="mt-4 max-w-3xl text-sm leading-6 text-muted-foreground">
            Configure the Slack app for this organization. QuoteBase sends
            approval requests to the configured incoming webhook and validates
            button clicks with this tenant&apos;s signing secret.
          </p>
        </section>

        <form action={saveSlackIntegration} className="mt-6 glass-panel p-5 sm:p-6">
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
                  Enable Slack approvals
                </span>
                <span className="block text-xs text-muted-foreground">
                  Send approval packets and accept Slack button actions.
                </span>
              </span>
            </label>

            <label>
              <span className="text-sm font-medium text-muted-foreground">
                Approver email
              </span>
              <input
                name="approver_email"
                type="email"
                defaultValue={integration.approver_email}
                placeholder="admin@example.com"
                className="soft-control mt-2 w-full"
              />
            </label>

            <label>
              <span className="text-sm font-medium text-muted-foreground">
                Channel label
              </span>
              <input
                name="channel_name"
                defaultValue={integration.channel_name}
                placeholder="#test"
                className="soft-control mt-2 w-full"
              />
            </label>

            <label className="sm:col-span-2">
              <span className="text-sm font-medium text-muted-foreground">
                Incoming webhook URL
              </span>
              <input
                name="webhook_url"
                type="password"
                placeholder={
                  integration.webhook_configured
                    ? "Webhook URL saved; leave blank to keep it"
                    : "https://hooks.slack.com/services/..."
                }
                className="soft-control mt-2 w-full"
              />
            </label>

            <label className="sm:col-span-2">
              <span className="text-sm font-medium text-muted-foreground">
                Signing secret
              </span>
              <input
                name="signing_secret"
                type="password"
                placeholder={
                  integration.signing_secret_configured
                    ? "Signing secret saved; leave blank to keep it"
                    : "Slack app signing secret"
                }
                className="soft-control mt-2 w-full"
              />
            </label>

            <label className="sm:col-span-2">
              <span className="text-sm font-medium text-muted-foreground">
                Bot token for estimator DMs
              </span>
              <input
                name="bot_token"
                type="password"
                placeholder={
                  integration.bot_token_configured
                    ? "Bot token saved; leave blank to keep it"
                    : "xoxb-..."
                }
                className="soft-control mt-2 w-full"
              />
            </label>
          </div>

          <div className="mt-5 rounded-[18px] border border-white/70 bg-white/65 p-4">
            <p className="text-sm font-semibold">Slack Request URL</p>
            <input
              readOnly
              value={requestUrl}
              className="soft-control mt-2 w-full bg-white/80 font-mono text-xs"
            />
            <p className="mt-2 text-xs leading-5 text-muted-foreground">
              The channel label is for admin clarity. Slack incoming webhooks
              post to the channel selected when the webhook was created. The bot
              token is used only for estimator direct messages.
            </p>
          </div>

          <Button type="submit" className="mt-5 h-11 w-full rounded-full">
            Save Slack settings
          </Button>
        </form>
      </div>
    </main>
  );
}
