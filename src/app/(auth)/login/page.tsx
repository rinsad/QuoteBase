import { redirect } from "next/navigation";

import { LoginForm } from "@/app/(auth)/login/login-form";
import { getCurrentUser } from "@/lib/auth/current-user";

export default async function LoginPage() {
  const user = await getCurrentUser();

  if (user) {
    redirect("/dashboard");
  }

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top_left,#ffffff_0,#f6f7f9_38%,#edf1f5_100%)] px-4 py-8 sm:px-6 lg:px-8">
      <section className="mx-auto flex min-h-[calc(100vh-4rem)] w-full max-w-6xl items-center justify-center">
        <div className="glass-panel grid w-full overflow-hidden lg:grid-cols-[1.05fr_0.95fr]">
          <div className="p-6 sm:p-8 lg:p-10">
            <p className="text-sm font-medium text-muted-foreground">
              Western Materials
            </p>
            <h1 className="mt-4 max-w-xl text-4xl font-semibold tracking-normal text-balance sm:text-5xl">
              Sign in to QuoteBase.
            </h1>
            <p className="mt-5 max-w-lg text-base leading-7 text-muted-foreground">
              Use your allowlisted Western Materials email. Supabase will send a
              magic link; no passwords are stored in this app.
            </p>
            <LoginForm />
          </div>

          <aside className="border-t border-white/70 bg-white/40 p-6 sm:p-8 lg:border-l lg:border-t-0 lg:p-10">
            <h2 className="text-lg font-semibold">Allowed users</h2>
            <div className="mt-5 grid gap-2 text-sm text-muted-foreground">
              <UserEmail email="john@westernmaterials.net" role="Admin" />
              <UserEmail email="admin@westernmaterials.net" role="Admin" />
              <UserEmail email="estimate@westernmaterials.net" role="Account Manager" />
              <UserEmail email="bid@westernmaterials.net" role="Account Manager" />
              <UserEmail email="dispatch@westernmaterials.net" role="Estimator" />
              <UserEmail email="info@westernmaterials.net" role="Estimator" />
              <UserEmail email="rinsad@gmail.com" role="Test Admin" />
            </div>
          </aside>
        </div>
      </section>
    </main>
  );
}

function UserEmail({ email, role }: { email: string; role: string }) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-2xl border border-white/70 bg-white/60 px-4 py-3 shadow-sm">
      <span className="min-w-0 truncate font-medium text-foreground">
        {email}
      </span>
      <span className="shrink-0 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700">
        {role}
      </span>
    </div>
  );
}
