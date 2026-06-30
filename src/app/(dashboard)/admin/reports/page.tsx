import { redirect } from "next/navigation";
import { BarChart3, TrendingUp, UsersRound } from "lucide-react";

import { AdminNav } from "@/components/app-nav";
import { getAdminReportsSummary } from "@/lib/admin/reports";
import { getCurrentUser } from "@/lib/auth/current-user";

export default async function AdminReportsPage() {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/login");
  }

  if (user.role !== "admin") {
    redirect("/dashboard");
  }

  const summary = await getAdminReportsSummary(user.organization_id);

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
                <h1 className="truncate text-lg font-semibold">Reports</h1>
              </div>
            </div>
            <AdminNav />
          </div>
        </header>

        <section className="mt-6 glass-panel p-5 sm:p-6">
          <div className="flex items-center gap-3">
            <div className="icon-well text-blue-700">
              <BarChart3 className="size-6" />
            </div>
            <div>
              <p className="text-sm font-medium text-muted-foreground">
                Historical Visibility
              </p>
              <h2 className="accent-title text-3xl font-semibold tracking-normal">
                Quote performance
              </h2>
            </div>
          </div>
        </section>

        <section className="mt-6 grid gap-6 xl:grid-cols-[1.25fr_0.75fr]">
          <div className="glass-panel p-5 sm:p-6">
            <div className="flex items-center gap-3">
              <UsersRound className="size-5 text-foreground" />
              <h2 className="text-xl font-semibold">Estimator performance</h2>
            </div>

            <div className="mt-5 space-y-3">
              {summary.estimatorPerformance.length ? (
                summary.estimatorPerformance.map((row) => (
                  <div
                    key={row.user_id}
                    className="soft-row grid gap-3 px-4 py-4 lg:grid-cols-[1.1fr_repeat(4,auto)] lg:items-center"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold">
                        {row.full_name}
                      </p>
                      <p className="mt-1 truncate text-xs text-muted-foreground">
                        {row.email || "No email recorded"}
                      </p>
                    </div>
                    <ReportMetric label="Quotes" value={row.quote_count} />
                    <ReportMetric
                      label="Approved"
                      value={row.approved_count}
                    />
                    <ReportMetric
                      label="Win rate"
                      value={`${row.win_rate.toFixed(0)}%`}
                    />
                    <ReportMetric
                      label="Value"
                      value={formatCurrency(row.total_value)}
                    />
                  </div>
                ))
              ) : (
                <div className="soft-row px-4 py-10 text-center text-sm text-muted-foreground">
                  No quote history is available yet.
                </div>
              )}
            </div>
          </div>

          <div className="glass-panel p-5 sm:p-6">
            <div className="flex items-center gap-3">
              <TrendingUp className="size-5 text-foreground" />
              <h2 className="text-xl font-semibold">Pricing trends</h2>
            </div>

            <div className="mt-5 space-y-3">
              {summary.pricingTrends.length ? (
                summary.pricingTrends.map((row) => (
                  <div key={row.status} className="soft-row px-4 py-4">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-sm font-semibold">
                        {formatStatus(row.status)}
                      </p>
                      <span className="soft-chip bg-slate-100 text-slate-700 ring-slate-200">
                        {row.quote_count}
                      </span>
                    </div>
                    <div className="mt-4 grid grid-cols-2 gap-3">
                      <ReportMetric
                        label="Total"
                        value={formatCurrency(row.total_value)}
                      />
                      <ReportMetric
                        label="Average"
                        value={formatCurrency(row.average_value)}
                      />
                    </div>
                  </div>
                ))
              ) : (
                <div className="soft-row px-4 py-10 text-center text-sm text-muted-foreground">
                  No pricing trend data is available yet.
                </div>
              )}
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}

function ReportMetric({
  label,
  value,
}: {
  label: string;
  value: number | string;
}) {
  return (
    <div>
      <p className="text-xs font-medium uppercase text-muted-foreground">
        {label}
      </p>
      <p className="mt-1 text-sm font-semibold">{value}</p>
    </div>
  );
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
}

function formatStatus(status: string) {
  return status
    .split("_")
    .map((part) => part[0]?.toUpperCase() + part.slice(1))
    .join(" ");
}
