import Link from "next/link";
import { redirect } from "next/navigation";
import {
  AlertTriangle,
  BadgeCheck,
  CheckCircle2,
  ClipboardList,
  Columns3,
  FileCheck2,
  FileClock,
  FilePlus2,
  Flag,
  Gauge,
  LockKeyhole,
  Mail,
  MessageSquare,
  ShieldCheck,
  Workflow,
} from "lucide-react";

import { getCurrentUser } from "@/lib/auth/current-user";
import { getQuoteList } from "@/lib/quotes/quotes";
import { getDashboardSummary } from "@/lib/system/checks";

const workflowModules = [
  {
    label: "Draft intake",
    detail:
      "Create quotes with customer, job-site, material, trucking, tax, and fee data.",
    href: "/quotes/new",
    icon: FilePlus2,
  },
  {
    label: "Approval workflow",
    detail: "Review pending approvals, changes requested, approvals, and rejections.",
    href: "/quotes/approvals",
    icon: Workflow,
  },
  {
    label: "Customer delivery",
    detail: "Send approved PDFs, public links, and track customer-facing states.",
    href: "/quotes/approved",
    icon: Mail,
  },
  {
    label: "Quote history",
    detail: "Review quote revisions, owner, totals, customer, and job-site context.",
    href: "/quotes",
    icon: FileClock,
  },
];

const configAreas = [
  { label: "Pricing rules", href: "/admin/pricing" },
  { label: "Material prices", href: "/admin/material-prices" },
  { label: "Tax rates", href: "/admin/tax-rates" },
  { label: "Plants", href: "/admin/plants" },
  { label: "Suppliers", href: "/admin/suppliers" },
  { label: "Vehicle types", href: "/admin/vehicle-types" },
];

const guardrails = [
  {
    icon: LockKeyhole,
    title: "Role-aware access",
    detail: "Admin-only setup, approval, and reporting routes stay protected.",
  },
  {
    icon: ClipboardList,
    title: "Audit trail",
    detail: "State-changing quote and admin workflows write reviewable events.",
  },
  {
    icon: Flag,
    title: "Feature gates",
    detail: "Organization features can be enabled without changing workflow code.",
  },
  {
    icon: ShieldCheck,
    title: "Tenant scope",
    detail: "Dashboard data is loaded through the current organization context.",
  },
];

export default async function DashboardPage() {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/login");
  }

  const [summary, quoteList] = await Promise.all([
    getDashboardSummary(user),
    getQuoteList(user),
  ]);
  const enabledFlags = summary.featureFlags.filter((flag) => flag.is_enabled).length;
  const needsAttention = [
    {
      label: "Pending approvals",
      value: quoteList.counts.pendingApproval,
      detail: "Quotes waiting for review",
      href: "/quotes/approvals",
      icon: FileCheck2,
    },
    {
      label: "Approved queue",
      value: quoteList.counts.approved,
      detail: "Ready for delivery planning",
      href: "/quotes/approved",
      icon: BadgeCheck,
    },
    {
      label: "Sent quotes",
      value: quoteList.counts.sent,
      detail: "Customer-facing follow-up pool",
      href: "/quotes",
      icon: MessageSquare,
    },
  ];

  return (
    <>
      <div className="mb-5 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-semibold uppercase text-muted-foreground">
            Quote operations
          </p>
          <h1 className="mt-1 text-3xl font-semibold tracking-normal sm:text-4xl">
            Welcome, {firstName(user.full_name)}.
          </h1>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-muted-foreground">
            Your workspace is scoped to{" "}
            {user.organization?.name ?? "this organization"}. Use this dashboard
            to move quotes through intake, approval, delivery, configuration,
            and audit review.
          </p>
        </div>
        <Link href="/quotes/new" className="mac-button-primary h-11">
          <FilePlus2 className="size-4" />
          New quote
        </Link>
      </div>

      <section className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <MetricCard label="All quotes" value={quoteList.counts.total} sub="Active records" />
        <MetricCard label="Drafts" value={quoteList.counts.drafts} sub="In preparation" />
        <MetricCard label="Pending" value={quoteList.counts.pendingApproval} sub="Approval queue" />
        <MetricCard label="Approved" value={quoteList.counts.approved} sub="Ready to send" />
        <MetricCard label="Sent" value={quoteList.counts.sent} sub="Customer follow-up" />
        <MetricCard label="Flags on" value={enabledFlags} sub={`${summary.featureFlags.length} visible`} />
      </section>

      <section className="mt-6 grid gap-6 xl:grid-cols-[1.35fr_0.65fr]">
        <div className="glass-panel overflow-hidden">
          <div className="flex items-center justify-between border-b border-border bg-[#fbfcf8] px-4 py-3">
            <div>
              <p className="text-sm font-medium text-muted-foreground">
                Quote workspace
              </p>
              <h2 className="text-xl font-semibold">Workflow modules</h2>
            </div>
            <Columns3 className="size-5 text-primary" />
          </div>
          <div className="grid gap-3 p-4 md:grid-cols-2">
            {workflowModules.map((module) => {
              const Icon = module.icon;

              return (
                <Link
                  key={module.href}
                  href={module.href}
                  className="soft-row block p-4 transition hover:border-[#cfd8ce] hover:bg-secondary"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="icon-well text-primary">
                      <Icon className="size-5" />
                    </div>
                    <CheckCircle2 className="size-4 text-primary" />
                  </div>
                  <h3 className="mt-4 text-sm font-semibold">{module.label}</h3>
                  <p className="mt-2 text-sm leading-6 text-muted-foreground">
                    {module.detail}
                  </p>
                </Link>
              );
            })}
          </div>
        </div>

        <aside className="glass-panel overflow-hidden">
          <div className="border-b border-border bg-[#fbfcf8] px-4 py-3">
            <p className="text-sm font-medium text-muted-foreground">
              Needs attention
            </p>
            <h2 className="text-xl font-semibold">Daily queues</h2>
          </div>
          <div className="space-y-2 p-4">
            {needsAttention.map((item) => {
              const Icon = item.icon;

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className="soft-row grid grid-cols-[auto_1fr_auto] items-center gap-3 p-4 transition hover:bg-secondary"
                >
                  <Icon className="size-4 text-primary" />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold">{item.label}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {item.detail}
                    </p>
                  </div>
                  <span className="font-mono text-xl font-semibold">
                    {item.value}
                  </span>
                </Link>
              );
            })}
          </div>
        </aside>
      </section>

      <section className="mt-6 grid gap-6 xl:grid-cols-[0.8fr_1.2fr]">
        <div className="glass-panel p-5">
          <div className="flex items-center gap-3">
            <div className="icon-well text-amber-700">
              <Gauge className="size-5" />
            </div>
            <div>
              <p className="text-sm font-medium text-muted-foreground">
                Pricing and configuration
              </p>
              <h2 className="text-xl font-semibold">Admin setup areas</h2>
            </div>
          </div>
          <div className="mt-5 grid gap-2 sm:grid-cols-2">
            {configAreas.map((area) => (
              <Link
                key={area.href}
                href={area.href}
                className="soft-row flex min-h-11 items-center justify-between gap-3 px-3 text-sm font-medium transition hover:bg-secondary"
              >
                {area.label}
                <CheckCircle2 className="size-4 text-primary" />
              </Link>
            ))}
          </div>
        </div>

        <div className="glass-panel overflow-hidden">
          <div className="flex items-center justify-between border-b border-border bg-[#fbfcf8] px-4 py-3">
            <div>
              <p className="text-sm font-medium text-muted-foreground">
                Governance
              </p>
              <h2 className="text-xl font-semibold">SaaS guardrails</h2>
            </div>
            <AlertTriangle className="size-5 text-amber-700" />
          </div>
          <div className="grid gap-3 p-4 sm:grid-cols-2">
            {guardrails.map((item) => {
              const Icon = item.icon;

              return (
                <div key={item.title} className="soft-row p-4">
                  <Icon className="size-5 text-foreground" />
                  <h3 className="mt-4 text-sm font-semibold">{item.title}</h3>
                  <p className="mt-2 text-sm leading-6 text-muted-foreground">
                    {item.detail}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      </section>
    </>
  );
}

function MetricCard({
  label,
  value,
  sub,
}: {
  label: string;
  value: number;
  sub: string;
}) {
  return (
    <div className="glass-tile min-h-28 p-4">
      <p className="text-xs font-medium uppercase text-muted-foreground">
        {label}
      </p>
      <p className="mt-3 font-mono text-3xl font-semibold">{value}</p>
      <p className="mt-1 text-xs text-muted-foreground">{sub}</p>
    </div>
  );
}

function firstName(name: string) {
  return name.split(" ")[0] || name;
}
