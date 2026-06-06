import { redirect } from "next/navigation";

import { LoginForm } from "@/app/(auth)/login/login-form";
import { getCurrentUser } from "@/lib/auth/current-user";
import { isLocalSupabase } from "@/lib/env";

export default async function LoginPage() {
  const user = await getCurrentUser();
  const showDevSignIn =
    process.env.NODE_ENV !== "production" && isLocalSupabase();

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
                Western Materials
              </p>
              <h1 className="accent-title mt-4 max-w-xl text-4xl font-semibold tracking-normal text-balance sm:text-5xl">
                Sign in to QuoteBase.
              </h1>
              <p className="mt-5 max-w-lg text-base leading-7 text-muted-foreground">
                Use your allowlisted Western Materials email. Supabase will send
                a magic link; local development can use the Rinsad shortcut.
              </p>
              <LoginForm showDevSignIn={showDevSignIn} />
            </div>

            <aside className="border-t border-white/70 bg-white/40 p-6 sm:p-8 lg:border-l lg:border-t-0 lg:p-10">
              <p className="text-sm font-medium text-muted-foreground">
                Access list
              </p>
              <h2 className="mt-1 text-2xl font-semibold">
                Approved test users
              </h2>
              <div className="mt-5 grid gap-2 text-sm text-muted-foreground">
                <UserEmail email="john@westernmaterials.net" role="Admin" />
                <UserEmail email="admin@westernmaterials.net" role="Admin" />
                <UserEmail
                  email="estimate@westernmaterials.net"
                  role="Account Manager"
                />
                <UserEmail
                  email="bid@westernmaterials.net"
                  role="Account Manager"
                />
                <UserEmail
                  email="dispatch@westernmaterials.net"
                  role="Estimator"
                />
                <UserEmail email="info@westernmaterials.net" role="Estimator" />
                <UserEmail email="rinsad@gmail.com" role="Test Admin" />
              </div>
            </aside>
          </div>
        </div>
      </section>
    </main>
  );
}

function UserEmail({ email, role }: { email: string; role: string }) {
  return (
    <div className="soft-row flex items-center justify-between gap-4 px-4 py-3">
      <span className="min-w-0 truncate font-medium text-foreground">
        {email}
      </span>
      <span className="soft-chip shrink-0 bg-slate-100 text-slate-700 ring-slate-200">
        {role}
      </span>
    </div>
  );
}
