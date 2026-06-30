import { redirect } from "next/navigation";

import { TenantOnboardingPanel } from "@/app/(dashboard)/admin/onboarding/tenant-onboarding-panel";
import { AdminNav } from "@/components/app-nav";
import { getCurrentUser } from "@/lib/auth/current-user";
import { getHermesOnboardingSummary } from "@/lib/system/hermes";

export default async function TenantOnboardingPage() {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/login");
  }

  if (user.role !== "admin") {
    redirect("/dashboard");
  }

  const summary = await getHermesOnboardingSummary(user);

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
                  Tenant setup
                </p>
                <h1 className="truncate text-lg font-semibold">Onboarding</h1>
              </div>
            </div>
            <AdminNav />
          </div>
        </header>

        <section className="mt-6 glass-panel p-5 sm:p-6">
          <p className="text-sm font-semibold uppercase text-muted-foreground">
            New tenant onboarding
          </p>
          <h2 className="mt-1 text-3xl font-semibold tracking-normal">
            Prepare this workspace for quoting
          </h2>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-muted-foreground">
            Use this setup flow when a new company is added to QuoteBase. Once
            the tenant is configured, daily work should happen from the dashboard
            and quote pipeline.
          </p>
        </section>

        <div className="mt-6">
          <TenantOnboardingPanel summary={summary} />
        </div>
      </div>
    </main>
  );
}
