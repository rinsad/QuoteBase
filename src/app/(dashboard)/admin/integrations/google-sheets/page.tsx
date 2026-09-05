import Link from "next/link";
import { redirect } from "next/navigation";
import {
  CloudCog,
  FileSpreadsheet,
  KeyRound,
  RefreshCw,
  ShieldCheck,
  Unplug,
} from "lucide-react";

import {
  disconnectGoogleSheets,
  runGoogleSheetsSyncNow,
  saveGoogleSheetsLink,
  saveGoogleSheetsOAuthSettings,
} from "@/app/(dashboard)/admin/integrations/google-sheets/actions";
import { AdminNav } from "@/components/app-nav";
import { Button } from "@/components/ui/button";
import { getCurrentUser } from "@/lib/auth/current-user";
import {
  googleSheetsRedirectUri,
  normalizeGoogleSheetsConfig,
  type GoogleSheetsIntegrationRecord,
} from "@/lib/integrations/google-sheets";
import { createClient } from "@/lib/supabase/server";

export default async function GoogleSheetsIntegrationPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role !== "admin") redirect("/dashboard");

  const supabase = await createClient();
  if (!supabase) throw new Error("Supabase is not configured.");
  const [{ data: integration }, params] = await Promise.all([
    supabase
      .from("organization_integrations")
      .select(
        "id, organization_id, is_enabled, config, credentials_encrypted, credentials_last4, updated_at",
      )
      .eq("organization_id", user.organization_id)
      .eq("provider", "google_sheets")
      .maybeSingle<GoogleSheetsIntegrationRecord>(),
    searchParams,
  ]);
  const config = normalizeGoogleSheetsConfig(integration?.config ?? null);
  const oauthConfigured = Boolean(
    integration?.credentials_last4?.client_secret,
  );
  const connected = Boolean(integration?.credentials_last4?.connected);
  const email =
    typeof integration?.credentials_last4?.email === "string"
      ? integration.credentials_last4.email
      : null;

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
              <div>
                <p className="text-sm font-medium text-muted-foreground">
                  Integrations
                </p>
                <h1 className="text-lg font-semibold">Supplier sheets</h1>
              </div>
            </div>
            <AdminNav role={user.role} />
          </div>
        </header>

        {noticeFor(params) ? <Notice {...noticeFor(params)!} /> : null}

        <section className="mt-6 glass-panel p-6 sm:p-8">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex items-center gap-3">
              <div className="icon-well text-emerald-700">
                <FileSpreadsheet className="size-6" />
              </div>
              <div>
                <p className="text-sm font-medium text-muted-foreground">
                  Daily supplier catalog
                </p>
                <h2 className="accent-title text-3xl font-semibold tracking-normal">
                  Google Sheets synchronization
                </h2>
              </div>
            </div>
            <div className="flex items-center gap-2 rounded-full bg-emerald-50 px-3 py-1.5 text-sm font-medium text-emerald-700 ring-1 ring-emerald-100">
              <ShieldCheck className="size-4" />
              Read-only access
            </div>
          </div>
          <p className="mt-4 max-w-3xl text-sm leading-6 text-muted-foreground">
            Each spreadsheet tab becomes a supplier. QuoteBase groups rows by
            plant address, decodes address fields, geocodes plants, and
            synchronizes materials and prices.
          </p>
        </section>

        <section className="mt-6 glass-panel p-5 sm:p-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h3 className="text-xl font-semibold">
                {connected ? "Google account connected" : "Connect Google"}
              </h3>
              <p className="mt-1 text-sm text-muted-foreground">
                {email ??
                  (oauthConfigured
                    ? "Authorize read-only access to the supplier spreadsheet."
                    : "Save your Google OAuth app credentials first.")}
              </p>
            </div>
            <div className="flex gap-3">
              {connected ? (
                <form action={disconnectGoogleSheets}>
                  <Button
                    type="submit"
                    variant="outline"
                    className="rounded-full text-rose-700"
                  >
                    <Unplug className="size-4" />
                    Disconnect
                  </Button>
                </form>
              ) : (
                <Link
                  href="/api/integrations/google-sheets/connect"
                  className={`mac-button ${oauthConfigured ? "" : "pointer-events-none opacity-50"}`}
                >
                  Connect Google
                </Link>
              )}
            </div>
          </div>
        </section>

        <form
          action={saveGoogleSheetsLink}
          className="mt-6 glass-panel p-5 sm:p-6"
        >
          <div className="flex items-center gap-3">
            <div className="icon-well text-emerald-700">
              <CloudCog className="size-5" />
            </div>
            <div>
              <p className="text-sm font-medium text-muted-foreground">
                Linked catalog
              </p>
              <h3 className="text-xl font-semibold">
                Spreadsheet and column mapping
              </h3>
            </div>
          </div>
          <label className="mt-5 block">
            <span className="text-sm font-medium">Google Sheets URL</span>
            <input
              name="spreadsheet_url"
              type="url"
              defaultValue={config.spreadsheetUrl}
              placeholder="https://docs.google.com/spreadsheets/d/..."
              className="soft-control mt-2 w-full"
              required
            />
          </label>
          <div className="mt-5 grid gap-4 sm:grid-cols-4">
            <ColumnInput
              label="Header row"
              name="header_row"
              value={String(config.headerRow)}
              numeric
            />
            <ColumnInput
              label="Plant address"
              name="address_column"
              value={config.columns.address}
            />
            <ColumnInput
              label="Material"
              name="material_column"
              value={config.columns.material}
            />
            <ColumnInput
              label="Price"
              name="price_column"
              value={config.columns.price}
            />
            <ColumnInput
              label="Unit"
              name="unit_column"
              value={config.columns.unit}
            />
            <ColumnInput
              label="Last updated"
              name="last_updated_column"
              value={config.columns.lastUpdated}
            />
            <ColumnInput
              label="Inventory"
              name="inventory_column"
              value={config.columns.inventory}
            />
            <ColumnInput
              label="Hours"
              name="hours_column"
              value={config.columns.hours}
            />
          </div>
          <div className="mt-5 flex flex-col gap-3 sm:flex-row">
            <Button
              type="submit"
              disabled={!connected}
              className="h-11 flex-1 rounded-full"
            >
              Link sheet and synchronize
            </Button>
            {integration?.is_enabled ? (
              <Button
                formAction={runGoogleSheetsSyncNow}
                variant="outline"
                className="h-11 rounded-full"
              >
                <RefreshCw className="size-4" />
                Sync now
              </Button>
            ) : null}
          </div>
          {config.lastSyncAt ? (
            <p className="mt-4 text-sm text-muted-foreground">
              Last sync: {new Date(config.lastSyncAt).toLocaleString()} ·{" "}
              {config.lastSyncStatus === "success" ? "Successful" : "Failed"}
              {config.lastSyncError ? ` — ${config.lastSyncError}` : ""}
            </p>
          ) : null}
        </form>

        <form
          action={saveGoogleSheetsOAuthSettings}
          className="mt-6 glass-panel p-5 sm:p-6"
        >
          <div className="flex items-center gap-3">
            <div className="icon-well text-blue-700">
              <KeyRound className="size-5" />
            </div>
            <div>
              <p className="text-sm font-medium text-muted-foreground">
                Google Cloud app
              </p>
              <h3 className="text-xl font-semibold">OAuth credentials</h3>
            </div>
          </div>
          <div className="mt-5 grid gap-5 sm:grid-cols-2">
            <SecretInput
              label="Client ID"
              name="client_id"
              placeholder={
                integration?.credentials_last4?.client_id
                  ? `Saved, ending ${integration.credentials_last4.client_id}`
                  : "Google OAuth client ID"
              }
            />
            <SecretInput
              label="Client secret"
              name="client_secret"
              placeholder={
                oauthConfigured
                  ? "Saved; enter to rotate"
                  : "Google OAuth client secret"
              }
            />
          </div>
          <p className="mt-4 break-all rounded-[16px] bg-muted/60 p-3 font-mono text-xs">
            Redirect URI: {googleSheetsRedirectUri()}
          </p>
          <Button type="submit" className="mt-5 h-11 w-full rounded-full">
            Save OAuth settings
          </Button>
        </form>
      </div>
    </main>
  );
}

function ColumnInput({
  label,
  name,
  value,
  numeric = false,
}: {
  label: string;
  name: string;
  value: string;
  numeric?: boolean;
}) {
  return (
    <label>
      <span className="text-sm font-medium text-muted-foreground">{label}</span>
      <input
        name={name}
        type={numeric ? "number" : "text"}
        min={numeric ? 1 : undefined}
        max={numeric ? 100 : undefined}
        defaultValue={value}
        className="soft-control mt-2 w-full"
        required
      />
    </label>
  );
}

function SecretInput({
  label,
  name,
  placeholder,
}: {
  label: string;
  name: string;
  placeholder: string;
}) {
  return (
    <label>
      <span className="text-sm font-medium text-muted-foreground">{label}</span>
      <input
        name={name}
        type="password"
        placeholder={placeholder}
        className="soft-control mt-2 w-full"
        required
      />
    </label>
  );
}

function noticeFor(params: Record<string, string | undefined>) {
  if (params.connected)
    return { tone: "success" as const, text: "Google account connected." };
  if (params.linked)
    return {
      tone: "success" as const,
      text: "Spreadsheet linked and synchronized.",
    };
  if (params.synced)
    return { tone: "success" as const, text: "Supplier catalog synchronized." };
  if (params.disconnected)
    return { tone: "warn" as const, text: "Google Sheets disconnected." };
  if (params.saved)
    return { tone: "success" as const, text: "OAuth settings saved." };
  if (params.error)
    return {
      tone: "error" as const,
      text: "Google Sheets connection failed. Check OAuth settings and try again.",
    };
  return null;
}

function Notice({
  tone,
  text,
}: {
  tone: "success" | "warn" | "error";
  text: string;
}) {
  const styles = {
    success: "border-emerald-100 bg-emerald-50 text-emerald-800",
    warn: "border-amber-100 bg-amber-50 text-amber-900",
    error: "border-rose-100 bg-rose-50 text-rose-800",
  };
  return (
    <div
      className={`mt-6 rounded-[20px] border px-5 py-4 text-sm font-medium ${styles[tone]}`}
    >
      {text}
    </div>
  );
}
