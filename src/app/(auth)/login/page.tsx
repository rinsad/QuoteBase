import { redirect } from "next/navigation";

import { LoginForm } from "@/app/(auth)/login/login-form";
import { getCurrentUser } from "@/lib/auth/current-user";
import {
  isDevLoginEnabled,
  isLocalSupabase,
  isSupabaseReachable,
} from "@/lib/env";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ dev_login?: string }>;
}) {
  const query = await searchParams;
  const localSupabase = isLocalSupabase();
  const supabaseReachable = localSupabase
    ? await isSupabaseReachable()
    : true;
  const user = supabaseReachable ? await getCurrentUser() : null;
  const showDevSignIn = isDevLoginEnabled();

  if (user) {
    redirect("/dashboard");
  }

  return (
    <main className="app-background">
      <section className="mx-auto flex min-h-[calc(100vh-4rem)] w-full max-w-6xl items-center justify-center">
        <div className="mac-window w-full">
          <div className="mac-toolbar">
            <div className="flex min-w-0 items-center gap-3">
              <div className="mac-controls">
                <span className="mac-control-red" />
                <span className="mac-control-yellow" />
                <span className="mac-control-green" />
              </div>
              <div className="h-5 w-px bg-border/80" />
              <p className="truncate text-sm font-semibold text-muted-foreground">
                QuoteBase Sign In
              </p>
            </div>
            <span className="hidden rounded-full bg-white/70 px-3 py-1 text-xs font-medium text-muted-foreground ring-1 ring-white/80 sm:inline-flex">
              Local workspace
            </span>
          </div>

          <div className="grid lg:grid-cols-[1.05fr_0.95fr]">
            <div className="p-6 sm:p-8 lg:p-10">
              <p className="text-sm font-medium text-muted-foreground">
                Private workspace
              </p>
              <h1 className="accent-title mt-4 max-w-xl text-4xl font-semibold tracking-normal text-balance sm:text-5xl">
                Sign in to QuoteBase.
              </h1>
              <p className="mt-5 max-w-lg text-base leading-7 text-muted-foreground">
                Use an approved company account. Supabase will send a magic
                link to continue.
              </p>
              <LoginForm showDevSignIn={showDevSignIn} />
              {query.dev_login === "unavailable" || !supabaseReachable ? (
                <p className="mt-4 rounded-2xl bg-amber-50 px-4 py-3 text-sm text-amber-800 ring-1 ring-amber-100">
                  Local Supabase is not running, so the local shortcut is
                  unavailable. Start Supabase locally or use the magic-link
                  flow.
                </p>
              ) : null}
            </div>

            <aside className="border-t border-white/70 bg-white/40 p-6 sm:p-8 lg:border-l lg:border-t-0 lg:p-10">
              <p className="text-sm font-medium text-muted-foreground">
                Access
              </p>
              <h2 className="mt-1 text-2xl font-semibold">
                Secure access
              </h2>
              <div className="mt-5 grid gap-2 text-sm text-muted-foreground">
                <AccessItem text="Approved users only" />
                <AccessItem text="Tenant-scoped data access" />
                <AccessItem text="Audited quote workflow" />
              </div>
            </aside>
          </div>
        </div>
      </section>
    </main>
  );
}

function AccessItem({ text }: { text: string }) {
  return (
    <div className="soft-row px-4 py-3">
      <span className="min-w-0 truncate font-medium text-foreground">
        {text}
      </span>
    </div>
  );
}
