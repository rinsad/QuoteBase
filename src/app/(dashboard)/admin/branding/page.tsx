import Image from "next/image";
import { redirect } from "next/navigation";
import { Building2, ImageUp, Save } from "lucide-react";

import { updateQuoteBranding } from "@/app/(dashboard)/admin/branding/actions";
import { AdminNav } from "@/components/app-nav";
import { Button } from "@/components/ui/button";
import { getQuoteBranding } from "@/lib/admin/branding";
import { getCurrentUser } from "@/lib/auth/current-user";

export default async function AdminBrandingPage({
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

  const [params, brandingResult] = await Promise.all([
    searchParams,
    getQuoteBranding(user.organization_id),
  ]);

  if (!brandingResult) {
    throw new Error("Quote branding configuration is missing.");
  }

  const { branding, setupMessage, setupRequired } = brandingResult;

  return (
    <main className="app-background">
      <div className="mx-auto w-full max-w-6xl">
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
                  Admin
                </p>
                <h1 className="truncate text-lg font-semibold">
                  Quote Branding
                </h1>
              </div>
            </div>
            <AdminNav />
          </div>
        </header>

        {params.saved ? (
          <div className="mt-6 rounded-[20px] border border-emerald-100 bg-emerald-50/80 px-5 py-4 text-sm font-medium text-emerald-800 shadow-sm">
            Quote branding saved.
          </div>
        ) : null}

        {setupMessage ? (
          <div className="mt-6 rounded-[20px] border border-amber-200 bg-amber-50/90 px-5 py-4 text-sm font-medium text-amber-900 shadow-sm">
            {setupMessage}
          </div>
        ) : null}

        <section className="mt-6 glass-panel p-6 sm:p-8">
          <div className="flex items-center gap-3">
            <div className="icon-well text-emerald-800">
              <Building2 className="size-6" />
            </div>
            <div>
              <p className="text-sm font-medium text-muted-foreground">
                Customer Documents
              </p>
              <h2 className="accent-title text-3xl font-semibold tracking-normal">
                Quote PDF branding
              </h2>
            </div>
          </div>
          <p className="mt-4 max-w-3xl text-sm leading-6 text-muted-foreground">
            These settings are used when the customer email PDF is generated
            after a quote is approved.
          </p>
        </section>

        <form
          action={updateQuoteBranding}
          encType="multipart/form-data"
          className="mt-6 space-y-6"
        >
          <section className="glass-panel p-5 sm:p-6">
            <div className="flex items-center gap-3">
              <div className="icon-well text-emerald-800">
                <ImageUp className="size-5" />
              </div>
              <div>
                <h2 className="text-xl font-semibold">Logo</h2>
                <p className="text-sm text-muted-foreground">
                  Upload PNG, JPG, WEBP, or SVG. Max 2 MB.
                </p>
              </div>
            </div>
            <input
              type="hidden"
              name="existing_logo_url"
              value={branding.logo_url ?? ""}
            />
            <div className="mt-5 grid gap-4 lg:grid-cols-[1fr_2fr]">
              <div className="soft-row p-4">
                <p className="text-sm font-semibold">Current logo</p>
                {branding.logo_url ? (
                  <>
                    <div className="mt-3 flex min-h-28 items-center justify-center rounded-md border border-border bg-white p-4">
                      <Image
                        src={branding.logo_url}
                        alt={`${branding.company_name} logo`}
                        width={320}
                        height={96}
                        unoptimized
                        className="max-h-24 max-w-full object-contain"
                      />
                    </div>
                    <p className="mt-2 truncate text-xs text-muted-foreground">
                      {branding.logo_url}
                    </p>
                  </>
                ) : (
                  <p className="mt-2 text-sm text-muted-foreground">
                    No logo uploaded yet.
                  </p>
                )}
              </div>
              <label className="block">
                <span className="text-sm font-medium text-muted-foreground">
                  Upload replacement logo
                </span>
                <input
                  name="logo"
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/svg+xml"
                  className="soft-control mt-2 w-full"
                />
              </label>
            </div>
          </section>

          <section className="glass-panel p-5 sm:p-6">
            <h2 className="text-xl font-semibold">Company details</h2>
            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <TextField
                name="company_name"
                label="Company name"
                value={branding.company_name}
              />
              <TextField name="phone" label="Phone" value={branding.phone} />
              <TextField
                name="address_line1"
                label="Address line 1"
                value={branding.address_line1}
              />
              <TextField
                name="address_line2"
                label="Address line 2"
                value={branding.address_line2 ?? ""}
                required={false}
              />
              <TextField name="city" label="City" value={branding.city} />
              <TextField name="state" label="State" value={branding.state} />
              <TextField
                name="postal_code"
                label="Postal code"
                value={branding.postal_code}
              />
              <TextField
                name="country"
                label="Country"
                value={branding.country}
              />
            </div>
          </section>

          <section className="glass-panel p-5 sm:p-6">
            <h2 className="text-xl font-semibold">Document copy</h2>
            <div className="mt-5 space-y-4">
              <label className="block">
                <span className="text-sm font-medium text-muted-foreground">
                  Footer note
                </span>
                <input
                  name="footer_note"
                  defaultValue={branding.footer_note ?? ""}
                  className="soft-control mt-2 w-full"
                />
              </label>
              <label className="block">
                <span className="text-sm font-medium text-muted-foreground">
                  Disclaimer
                </span>
                <textarea
                  name="disclaimer"
                  defaultValue={branding.disclaimer}
                  className="soft-control mt-2 min-h-40 w-full"
                  required
                />
              </label>
            </div>
          </section>

          <div className="flex justify-end">
            <Button
              type="submit"
              className="h-11 rounded-full"
              disabled={setupRequired}
            >
              <Save className="size-4" />
              {setupRequired ? "Setup required" : "Save branding"}
            </Button>
          </div>
        </form>
      </div>
    </main>
  );
}

function TextField({
  name,
  label,
  value,
  required = true,
}: {
  name: string;
  label: string;
  value: string;
  required?: boolean;
}) {
  return (
    <label className="block">
      <span className="text-sm font-medium text-muted-foreground">{label}</span>
      <input
        name={name}
        defaultValue={value}
        className="soft-control mt-2 w-full"
        required={required}
      />
    </label>
  );
}
