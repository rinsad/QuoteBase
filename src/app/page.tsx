import Link from "next/link";
import { redirect } from "next/navigation";
import { KeyRound, LockKeyhole, ShieldCheck } from "lucide-react";

import { getCurrentUser } from "@/lib/auth/current-user";

export default async function Home() {
  const user = await getCurrentUser();

  if (user) {
    redirect("/dashboard");
  }

  return (
    <main className="min-h-screen bg-background px-4 py-6 text-foreground sm:px-6 lg:px-8">
      <div className="mx-auto flex min-h-[calc(100vh-3rem)] w-full max-w-5xl items-center">
        <section className="grid w-full gap-6 lg:grid-cols-[1.05fr_0.95fr] lg:items-center">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full bg-secondary px-3 py-1 text-sm font-medium text-primary ring-1 ring-[#d7ded5]">
              <ShieldCheck className="size-4" />
              Protected quote workspace
            </div>
            <h1 className="mt-5 max-w-2xl text-4xl font-semibold tracking-normal sm:text-5xl">
              QuoteBase
            </h1>
            <p className="mt-4 max-w-xl text-base leading-7 text-muted-foreground">
              Sign in to access quoting, customer records, approvals, pricing,
              integrations, and tenant-scoped audit controls.
            </p>
            <div className="mt-7 flex flex-col gap-3 sm:flex-row">
              <Link href="/login" className="mac-button-primary h-11">
                <KeyRound className="size-4" />
                Open login
              </Link>
            </div>
          </div>

          <div className="glass-panel p-6 sm:p-8">
            <div className="icon-well text-primary">
              <LockKeyhole className="size-5" />
            </div>
            <h2 className="mt-5 text-2xl font-semibold">
              Workspace access is private
            </h2>
            <p className="mt-3 text-sm leading-6 text-muted-foreground">
              Operational menus and quote data are available only after
              authentication. Users are routed into their organization workspace
              based on their active account and role.
            </p>
            <div className="mt-6 grid gap-3">
              <SecurityRow label="Tenant-scoped records" />
              <SecurityRow label="Role-based navigation" />
              <SecurityRow label="Authenticated quote actions" />
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}

function SecurityRow({ label }: { label: string }) {
  return (
    <div className="soft-row flex min-h-11 items-center gap-3 px-3">
      <ShieldCheck className="size-4 text-primary" />
      <span className="text-sm font-medium">{label}</span>
    </div>
  );
}
