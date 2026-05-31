import Link from "next/link";
import { redirect } from "next/navigation";
import { ClipboardList, ShieldCheck } from "lucide-react";

import { getAdminAuditLog } from "@/lib/admin/audit-log";
import { getCurrentUser } from "@/lib/auth/current-user";

export default async function AdminAuditLogPage() {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/login");
  }

  if (user.role !== "admin") {
    redirect("/dashboard");
  }

  const entries = await getAdminAuditLog(user.organization_id);

  return (
    <main className="app-background">
      <div className="mx-auto w-full max-w-7xl">
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
                <h1 className="truncate text-lg font-semibold">Audit Log</h1>
              </div>
            </div>
            <div className="flex flex-wrap items-center justify-end gap-2">
              <Link href="/admin/users" className="mac-link">
                Users
              </Link>
              <Link href="/admin/feature-flags" className="mac-link">
                Features
              </Link>
              <Link href="/dashboard" className="mac-link">
                Dashboard
              </Link>
            </div>
          </div>
        </header>

        <section className="mt-6 glass-panel p-5 sm:p-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div className="flex items-center gap-3">
              <div className="icon-well text-blue-700">
                <ClipboardList className="size-6" />
              </div>
              <div>
                <p className="text-sm font-medium text-muted-foreground">
                  Compliance
                </p>
                <h2 className="accent-title text-3xl font-semibold tracking-normal">
                  Last {entries.length} audit entries
                </h2>
              </div>
            </div>
            <div className="flex items-center gap-2 rounded-full bg-blue-50 px-3 py-1.5 text-sm font-medium text-blue-700 ring-1 ring-blue-100">
              <ShieldCheck className="size-4" />
              Read only
            </div>
          </div>

          <div className="mt-6 space-y-3">
            {entries.length ? (
              entries.map((entry) => (
                <article
                  key={entry.id}
                  className="soft-row grid gap-3 px-4 py-4 lg:grid-cols-[1fr_auto_auto] lg:items-center"
                >
                  <div className="min-w-0">
                    <h3 className="truncate text-sm font-semibold">
                      {formatAction(entry.action)}
                    </h3>
                    <p className="mt-1 truncate font-mono text-xs text-muted-foreground">
                      {entry.target_table ?? "workspace"}{" "}
                      {entry.target_id ? `#${entry.target_id}` : ""}
                    </p>
                  </div>
                  <div className="text-sm text-muted-foreground">
                    {entry.user?.full_name ?? "System"}
                  </div>
                  <div className="font-mono text-xs text-muted-foreground">
                    {new Date(entry.created_at).toLocaleString("en-US")}
                  </div>
                </article>
              ))
            ) : (
              <div className="soft-row px-4 py-6 text-sm text-muted-foreground">
                No audit entries are visible yet.
              </div>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}

function formatAction(action: string) {
  return action
    .split(".")
    .join(" ")
    .split("_")
    .map((part) => part[0]?.toUpperCase() + part.slice(1))
    .join(" ");
}
