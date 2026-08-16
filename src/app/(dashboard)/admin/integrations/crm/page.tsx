import { redirect } from "next/navigation";
import { DatabaseZap, ShieldCheck } from "lucide-react";

import { saveCrmIntegration, seedSalesforceTestContacts, syncCrmIntegration } from "@/app/(dashboard)/admin/integrations/crm/actions";
import { Button } from "@/components/ui/button";
import { CRM_PROVIDER_DETAILS, getAdminCrmIntegrations } from "@/lib/integrations/crm";
import { getCurrentUser } from "@/lib/auth/current-user";

export default async function CrmIntegrationsPage({ searchParams }: { searchParams: Promise<{ saved?: string; synced?: string; count?: string; seeded?: string; skipped?: string }> }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role !== "admin") redirect("/dashboard");
  const [params, integrations] = await Promise.all([searchParams, getAdminCrmIntegrations(user.organization_id)]);

  return <main>
    <div className="mb-5"><p className="text-sm font-semibold uppercase text-muted-foreground">Integrations</p><h1 className="mt-1 text-3xl font-semibold tracking-normal sm:text-4xl">CRM customer sources</h1><p className="mt-3 max-w-3xl text-sm leading-6 text-muted-foreground">Enable one or several CRMs. Customers synchronized from enabled sources become available in the quote customer search.</p></div>
    {params.saved ? <div className="mb-5 rounded-md border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm text-emerald-800"><strong>{CRM_PROVIDER_DETAILS[params.saved as keyof typeof CRM_PROVIDER_DETAILS]?.label ?? "CRM"} settings saved.</strong></div> : null}
    {params.synced ? <div className="mb-5 rounded-md border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm text-emerald-800"><strong>{CRM_PROVIDER_DETAILS[params.synced as keyof typeof CRM_PROVIDER_DETAILS]?.label ?? "CRM"} synchronized {params.count ?? "0"} customers.</strong></div> : null}
    {params.seeded ? <div className="mb-5 rounded-md border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm text-emerald-800"><strong>Created {params.seeded} Salesforce test contacts; {params.skipped ?? "0"} already existed.</strong></div> : null}
    <div className="mb-6 grid gap-4 sm:grid-cols-3"><Status label="Enabled CRMs" value={String(integrations.filter((item) => item.isEnabled).length)} /><Status label="Available providers" value={String(integrations.length)} /><Status label="Credential storage" value="Encrypted" /></div>
    <section className="grid gap-5 xl:grid-cols-2">
      {integrations.map((integration) => {
        const details = CRM_PROVIDER_DETAILS[integration.provider];
        return <form key={integration.provider} action={saveCrmIntegration} className="glass-panel p-5 sm:p-6">
          <input type="hidden" name="provider" value={integration.provider} />
          <div className="flex items-start justify-between gap-4 border-b border-border pb-4"><div><p className="text-sm text-muted-foreground">CRM provider</p><h2 className="text-2xl font-semibold">{details.label}</h2></div><span className={`soft-chip ${integration.isEnabled ? "bg-emerald-50 text-emerald-700" : "bg-secondary text-muted-foreground"}`}>{integration.isEnabled ? "Enabled" : "Disabled"}</span></div>
          <div className="mt-5 grid gap-4">
            <label className="flex items-start gap-3 rounded-md border border-border bg-background px-4 py-3"><input name="is_enabled" type="checkbox" defaultChecked={integration.isEnabled} className="mt-1 size-4"/><span><span className="block text-sm font-semibold">Use {details.label} customers</span><span className="block text-xs text-muted-foreground">Include synchronized customers in quote search.</span></span></label>
            <Field name="api_url" label="API URL" defaultValue={integration.apiUrl} />
            <Field name="account_identifier" label="Account / tenant identifier" defaultValue={integration.accountIdentifier} required={false} />
            {details.credentialFields.map((field) => <Field key={field.key} name={credentialInputName(field.key)} label={field.label} type="password" defaultValue="" required={false} placeholder={integration.credentialsLast4[field.key] ? `Saved ending ${integration.credentialsLast4[field.key]}; leave blank to keep` : "Not configured"} />)}
            {integration.provider === "salesforce" ? <p className="text-xs leading-5 text-muted-foreground">Uses OAuth 2.0 Client Credentials Flow. Configure a Salesforce Run As user with API access and read access to Contacts and Accounts.</p> : null}
          </div>
          <div className="mt-5 flex items-center justify-between gap-3"><span className="flex items-center gap-2 text-xs text-muted-foreground"><ShieldCheck className="size-4"/>Secrets are encrypted</span><div className="flex flex-wrap justify-end gap-2">{integration.provider === "salesforce" ? <Button type="submit" formAction={seedSalesforceTestContacts} variant="outline" disabled={!integration.isEnabled}>Create SFS test contacts</Button> : null}<Button type="submit" formAction={syncCrmIntegration} variant="outline" disabled={!integration.isEnabled}>Sync now</Button><Button type="submit">Save {details.label}</Button></div></div>
        </form>;
      })}
    </section>
  </main>;
}

function Status({ label, value }: { label: string; value: string }) { return <div className="glass-tile p-4"><div className="flex items-center justify-between"><div><p className="text-xs font-semibold uppercase text-muted-foreground">{label}</p><p className="mt-2 text-2xl font-semibold">{value}</p></div><div className="icon-well text-primary"><DatabaseZap className="size-5"/></div></div></div>; }

function Field({ name, label, defaultValue, type = "text", required = true, placeholder }: { name: string; label: string; defaultValue: string; type?: "text" | "password"; required?: boolean; placeholder?: string }) { return <label><span className="text-sm font-medium text-muted-foreground">{label}</span><input name={name} type={type} defaultValue={defaultValue} placeholder={placeholder} className="soft-control mt-2 w-full" required={required} autoComplete="off" /></label>; }

function credentialInputName(key: "accessToken" | "clientId" | "clientSecret" | "refreshToken"): string { return ({ accessToken: "access_token", clientId: "client_id", clientSecret: "client_secret", refreshToken: "refresh_token" })[key]; }
