import Link from "next/link";
import { redirect } from "next/navigation";
import { KeyRound, Mail, ShieldCheck, Unplug } from "lucide-react";

import {
  disconnectGmailIntegration,
  saveGmailOAuthSettings,
} from "@/app/(dashboard)/admin/integrations/gmail/actions";
import { AdminNav } from "@/components/app-nav";
import { Button } from "@/components/ui/button";
import { getAdminGmailIntegration } from "@/lib/admin/integrations";
import { getCurrentUser } from "@/lib/auth/current-user";
import { gmailRedirectUri } from "@/lib/integrations/gmail";

export default async function AdminGmailIntegrationPage({
  searchParams,
}: {
  searchParams: Promise<{
    connected?: string;
    disconnected?: string;
    error?: string;
    saved?: string;
  }>;
}) {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/login");
  }

  const [params, integration] = await Promise.all([
    searchParams,
    getAdminGmailIntegration(user.organization_id, user.id),
  ]);
  const googleConfigured = integration.oauth_configured;
  const redirectUri = gmailRedirectUri();

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
                <h1 className="truncate text-lg font-semibold">Gmail</h1>
              </div>
            </div>
            <AdminNav role={user.role} />
          </div>
        </header>

        {params.connected ? (
          <Notice tone="success" text="Your Gmail account is connected." />
        ) : null}
        {params.disconnected ? (
          <Notice tone="warn" text="Your Gmail account was disconnected." />
        ) : null}
        {params.saved ? (
          <Notice
            tone="success"
            text="Google OAuth app credentials saved for this organization."
          />
        ) : null}
        {params.error ? (
          <Notice tone="error" text={gmailErrorMessage(params.error)} />
        ) : null}

        <section className="mt-6 glass-panel p-6 sm:p-8">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex items-center gap-3">
              <div className="icon-well text-blue-700">
                <Mail className="size-6" />
              </div>
              <div>
                <p className="text-sm font-medium text-muted-foreground">
                  Personal Email Delivery
                </p>
                <h2 className="accent-title text-3xl font-semibold tracking-normal">
                  Gmail quote sending
                </h2>
              </div>
            </div>
            <div className="flex items-center gap-2 rounded-full bg-blue-50 px-3 py-1.5 text-sm font-medium text-blue-700 ring-1 ring-blue-100">
              <ShieldCheck className="size-4" />
              OAuth tokens encrypted
            </div>
          </div>
          <p className="mt-4 max-w-3xl text-sm leading-6 text-muted-foreground">
            Connect your Gmail or Google Workspace mailbox. Quotes you send
            will be emailed from your own account with a QuoteBase PDF attached
            and a customer review link in the message.
          </p>
        </section>

        <section className="mt-6 glass-panel p-5 sm:p-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h3 className="text-xl font-semibold">
                {integration.is_enabled ? "Connected" : "Not connected"}
              </h3>
              <p className="mt-1 text-sm text-muted-foreground">
                {integration.email
                  ? `You are sending from ${integration.email}`
                  : googleConfigured
                    ? "Connect your Gmail account to send customer quote emails."
                    : "Google OAuth app credentials are not configured yet. Ask an admin to set them up."}
              </p>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row">
              <Link
                href="/api/integrations/gmail/connect"
                className={`mac-button text-center ${
                  googleConfigured ? "" : "pointer-events-none opacity-50"
                }`}
              >
                Connect Gmail
              </Link>
              {integration.is_enabled ? (
                <form action={disconnectGmailIntegration}>
                  <Button
                    type="submit"
                    variant="outline"
                    className="h-10 rounded-full bg-white/70 text-rose-700 hover:bg-rose-50"
                  >
                    <Unplug className="size-4" />
                    Disconnect
                  </Button>
                </form>
              ) : null}
            </div>
          </div>
        </section>

        {user.role === "admin" ? (
          <form
            action={saveGmailOAuthSettings}
            className="mt-6 glass-panel p-5 sm:p-6"
          >
            <div className="flex items-center gap-3">
              <div className="icon-well text-blue-700">
                <KeyRound className="size-5" />
              </div>
              <div>
                <p className="text-sm font-medium text-muted-foreground">
                  Tenant Google Cloud App
                </p>
                <h3 className="text-xl font-semibold">
                  OAuth client credentials
                </h3>
              </div>
            </div>

            <div className="mt-5 grid gap-5 sm:grid-cols-2">
              <label>
                <span className="text-sm font-medium text-muted-foreground">
                  Client ID
                </span>
                <input
                  name="client_id"
                  type="password"
                  placeholder={
                    integration.client_id_last4
                      ? `Saved, ending ${integration.client_id_last4}`
                      : "Google OAuth client ID"
                  }
                  className="soft-control mt-2 w-full"
                  required
                />
              </label>
              <label>
                <span className="text-sm font-medium text-muted-foreground">
                  Client secret
                </span>
                <input
                  name="client_secret"
                  type="password"
                  placeholder={
                    integration.oauth_configured
                      ? "Saved; enter a new secret to rotate"
                      : "Google OAuth client secret"
                  }
                  className="soft-control mt-2 w-full"
                  required
                />
              </label>
            </div>

            <div className="mt-5 rounded-[18px] border border-white/70 bg-white/65 p-4">
              <p className="text-sm font-semibold">Authorized redirect URI</p>
              <input
                readOnly
                value={redirectUri}
                className="soft-control mt-2 w-full bg-white/80 font-mono text-xs"
              />
            </div>

            <Button type="submit" className="mt-5 h-11 w-full rounded-full">
              Save Google OAuth settings
            </Button>
          </form>
        ) : null}
      </div>
    </main>
  );
}

function Notice({
  tone,
  text,
}: {
  tone: "success" | "warn" | "error";
  text: string;
}) {
  const tones = {
    success: "border-emerald-100 bg-emerald-50/80 text-emerald-800",
    warn: "border-amber-100 bg-amber-50/80 text-amber-900",
    error: "border-rose-100 bg-rose-50/80 text-rose-800",
  };

  return (
    <div
      className={`mt-6 rounded-[20px] border px-5 py-4 text-sm font-medium shadow-sm ${tones[tone]}`}
    >
      {text}
    </div>
  );
}

function gmailErrorMessage(error: string): string {
  const messages: Record<string, string> = {
    google_not_configured:
      "Tenant Google OAuth app credentials are not configured.",
    invalid_state: "Google returned an invalid connection state.",
    missing_code: "Google did not return an authorization code.",
    oauth_failed: "Gmail connection failed during OAuth.",
    oauth_settings_unreadable:
      "Saved Google OAuth app credentials cannot be read with the current encryption key. Re-enter the Client ID and Client secret, save, then connect Gmail.",
    unauthorized: "You must be an admin to connect Gmail.",
  };

  return messages[error] ?? "Gmail connection failed.";
}
