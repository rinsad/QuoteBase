import {
  AlertTriangle,
  BadgeCheck,
  Bell,
  BookOpen,
  CheckCircle2,
  ClipboardList,
  Columns3,
  Database,
  FileCheck2,
  FileClock,
  FilePlus2,
  FileText,
  Flag,
  Gauge,
  KeyRound,
  LayoutDashboard,
  LockKeyhole,
  Mail,
  MessageSquare,
  Search,
  Settings,
  ShieldCheck,
  Truck,
  Users,
  Workflow,
  Zap,
} from "lucide-react";
import Link from "next/link";

type NavItem = {
  label: string;
  href: string;
  icon: typeof LayoutDashboard;
};

const primaryNav: NavItem[] = [
  { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { label: "Quotes", href: "/quotes", icon: FileText },
  { label: "Customers", href: "/customers", icon: Users },
  { label: "Approvals", href: "/quotes/approvals", icon: FileCheck2 },
  { label: "Pricing", href: "/admin/pricing", icon: BookOpen },
  { label: "Operations", href: "/admin/plants", icon: Truck },
  { label: "Integrations", href: "/admin/integrations/gmail", icon: Zap },
  { label: "Admin", href: "/admin/system-check", icon: Settings },
];

const quoteStages = [
  {
    label: "Draft intake",
    detail: "Customer, job site, materials, trucking, taxes, and fees.",
    status: "Configured",
    icon: FilePlus2,
  },
  {
    label: "Approval workflow",
    detail: "Pending approval, changes requested, approved, and rejected.",
    status: "Active",
    icon: Workflow,
  },
  {
    label: "Customer delivery",
    detail: "PDF quote delivery, public links, sent/viewed response states.",
    status: "Ready",
    icon: Mail,
  },
  {
    label: "Revision history",
    detail: "Parent quote tracking and immutable revision records.",
    status: "Tracked",
    icon: FileClock,
  },
];

const attentionItems = [
  {
    label: "Pending approvals",
    detail: "Admin review queue for quotes waiting on approval.",
    href: "/quotes/approvals",
    icon: FileCheck2,
  },
  {
    label: "Approved queue",
    detail: "Quotes ready for customer delivery or follow-up.",
    href: "/quotes/approved",
    icon: BadgeCheck,
  },
  {
    label: "Integration health",
    detail: "Gmail, Slack, and Pipedrive connection status.",
    href: "/admin/integrations/gmail",
    icon: MessageSquare,
  },
];

const kpis = [
  { label: "Quote workflow", value: "9 states", sub: "Draft to accepted" },
  { label: "Pricing controls", value: "4 tiers", sub: "R1-R4 framework" },
  { label: "Config modules", value: "8", sub: "Materials, fees, taxes" },
  { label: "Audit coverage", value: "Required", sub: "State changes logged" },
  { label: "Tenant model", value: "Scoped", sub: "Organization records" },
  { label: "Integrations", value: "3", sub: "Gmail, Slack, Pipedrive" },
];

const guardrails = [
  {
    icon: Database,
    title: "Tenant-scoped data",
    detail: "Business records are designed around organization-owned data.",
  },
  {
    icon: LockKeyhole,
    title: "Role-aware access",
    detail: "Admin, account manager, and estimator workflows stay separated.",
  },
  {
    icon: ClipboardList,
    title: "Audit trail",
    detail: "Quote, pricing, and admin state changes are reviewable.",
  },
  {
    icon: Flag,
    title: "Feature gates",
    detail: "Capabilities can be enabled per organization as rollout changes.",
  },
];

const configAreas = [
  { label: "Plants", href: "/admin/plants" },
  { label: "Suppliers", href: "/admin/suppliers" },
  { label: "Yards", href: "/admin/yards" },
  { label: "Vehicle types", href: "/admin/vehicle-types" },
  { label: "Material prices", href: "/admin/material-prices" },
  { label: "Tax rates", href: "/admin/tax-rates" },
];

export default function Home() {
  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="grid min-h-screen lg:grid-cols-[15rem_1fr]">
        <aside className="border-b border-border bg-card lg:border-b-0 lg:border-r">
          <div className="flex items-center justify-between border-b border-border px-4 py-4 lg:block">
            <div>
              <p className="text-lg font-semibold tracking-tight">
                Quote<span className="text-primary">Base</span>
              </p>
              <p className="text-xs text-muted-foreground">
                Western Materials
              </p>
            </div>
            <Link href="/login" className="mac-button-primary h-9 lg:hidden">
              Login
            </Link>
          </div>

          <nav
            className="flex gap-1 overflow-x-auto p-2 lg:block"
            aria-label="Product navigation"
          >
            {primaryNav.map((item) => {
              const Icon = item.icon;

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className="flex min-w-fit items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition hover:bg-secondary hover:text-primary lg:mb-0.5"
                >
                  <Icon className="size-4" />
                  {item.label}
                </Link>
              );
            })}
          </nav>

          <div className="hidden border-t border-border p-3 lg:block">
            <div className="flex items-center gap-2 rounded-md bg-secondary px-3 py-2">
              <div className="flex size-7 items-center justify-center rounded-full bg-foreground text-xs font-semibold text-background">
                WM
              </div>
              <div>
                <p className="text-sm font-medium">Workspace</p>
                <p className="text-xs text-muted-foreground">Role protected</p>
              </div>
            </div>
          </div>
        </aside>

        <section className="min-w-0">
          <header className="flex min-h-14 items-center justify-between gap-4 border-b border-border bg-card px-4 sm:px-6">
            <div className="hidden min-w-0 items-center gap-3 rounded-md border border-border bg-background px-3 py-2 sm:flex sm:w-80">
              <Search className="size-4 text-muted-foreground" />
              <span className="truncate text-sm text-muted-foreground">
                Search quotes, customers, jobs, audit events
              </span>
            </div>
            <div className="flex items-center gap-2 sm:ml-auto">
              <span className="hidden items-center gap-2 rounded-full bg-secondary px-3 py-1 text-xs font-medium text-primary sm:inline-flex">
                <ShieldCheck className="size-3.5" />
                Tenant-safe workspace
              </span>
              <button
                type="button"
                className="rounded-md border border-border bg-card p-2 text-muted-foreground"
                aria-label="Notifications"
              >
                <Bell className="size-4" />
              </button>
              <Link href="/login" className="mac-button-primary hidden h-9 sm:flex">
                Open login
              </Link>
            </div>
          </header>

          <div className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
            <div className="mb-5 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="text-sm font-semibold uppercase text-muted-foreground">
                  Quote operations
                </p>
                <h1 className="mt-1 text-3xl font-semibold tracking-normal sm:text-4xl">
                  A command center for quoting, pricing, approvals, and follow-up.
                </h1>
                <p className="mt-3 max-w-3xl text-sm leading-6 text-muted-foreground">
                  The public first screen now mirrors the product experience:
                  module navigation, operational queues, pricing configuration,
                  integrations, and tenant-safe audit controls.
                </p>
              </div>
              <Link href="/quotes/new" className="mac-button-primary h-11">
                <FilePlus2 className="size-4" />
                New quote
              </Link>
            </div>

            <section className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
              {kpis.map((item) => (
                <MetricCard key={item.label} {...item} />
              ))}
            </section>

            <section className="mt-6 grid gap-6 xl:grid-cols-[1.35fr_0.65fr]">
              <div className="glass-panel overflow-hidden">
                <div className="flex items-center justify-between border-b border-border bg-[#fbfcf8] px-4 py-3">
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">
                      Quote workspace
                    </p>
                    <h2 className="text-xl font-semibold">
                      Workflow modules
                    </h2>
                  </div>
                  <Columns3 className="size-5 text-primary" />
                </div>

                <div className="grid gap-3 p-4 md:grid-cols-2">
                  {quoteStages.map((stage) => {
                    const Icon = stage.icon;

                    return (
                      <div key={stage.label} className="soft-row p-4">
                        <div className="flex items-start justify-between gap-3">
                          <div className="icon-well text-primary">
                            <Icon className="size-5" />
                          </div>
                          <StatusPill label={stage.status} />
                        </div>
                        <h3 className="mt-4 text-sm font-semibold">
                          {stage.label}
                        </h3>
                        <p className="mt-2 text-sm leading-6 text-muted-foreground">
                          {stage.detail}
                        </p>
                      </div>
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
                  {attentionItems.map((item) => {
                    const Icon = item.icon;

                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        className="soft-row block p-4 transition hover:border-[#cfd8ce] hover:bg-secondary"
                      >
                        <div className="flex items-center gap-3">
                          <Icon className="size-4 text-primary" />
                          <span className="text-sm font-semibold">
                            {item.label}
                          </span>
                        </div>
                        <p className="mt-2 text-sm leading-6 text-muted-foreground">
                          {item.detail}
                        </p>
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
                    <h2 className="text-xl font-semibold">
                      Admin setup areas
                    </h2>
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
                    <h2 className="text-xl font-semibold">
                      SaaS guardrails
                    </h2>
                  </div>
                  <AlertTriangle className="size-5 text-amber-700" />
                </div>
                <div className="grid gap-3 p-4 sm:grid-cols-2">
                  {guardrails.map((item) => {
                    const Icon = item.icon;

                    return (
                      <div key={item.title} className="soft-row p-4">
                        <Icon className="size-5 text-foreground" />
                        <h3 className="mt-4 text-sm font-semibold">
                          {item.title}
                        </h3>
                        <p className="mt-2 text-sm leading-6 text-muted-foreground">
                          {item.detail}
                        </p>
                      </div>
                    );
                  })}
                </div>
              </div>
            </section>

            <section className="mt-6 glass-panel p-5">
              <div className="flex items-center gap-3">
                <div className="icon-well text-primary">
                  <KeyRound className="size-5" />
                </div>
                <div>
                  <p className="text-sm font-medium text-muted-foreground">
                    Local environment
                  </p>
                  <h2 className="text-xl font-semibold">
                    Supabase and workflow readiness
                  </h2>
                </div>
              </div>
              <div className="mt-5 grid gap-2 md:grid-cols-3">
                <EnvRow name="NEXT_PUBLIC_SUPABASE_URL" />
                <EnvRow name="NEXT_PUBLIC_SUPABASE_ANON_KEY" />
                <EnvRow name="SUPABASE_SERVICE_ROLE_KEY" />
              </div>
            </section>
          </div>
        </section>
      </div>
    </main>
  );
}

function MetricCard({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub: string;
}) {
  return (
    <div className="glass-tile min-h-28 p-4">
      <p className="text-xs font-medium uppercase text-muted-foreground">
        {label}
      </p>
      <p className="mt-3 font-mono text-2xl font-semibold">{value}</p>
      <p className="mt-1 text-xs text-muted-foreground">{sub}</p>
    </div>
  );
}

function StatusPill({ label }: { label: string }) {
  return (
    <span className="soft-chip bg-[#ecf2ed] text-[#3d6652] ring-[#d7ded5]">
      {label}
    </span>
  );
}

function EnvRow({ name }: { name: string }) {
  return (
    <div className="soft-row flex min-h-11 items-center justify-between gap-3 px-3">
      <code className="min-w-0 truncate text-xs font-medium">{name}</code>
      <span className="soft-chip bg-emerald-50 text-emerald-700 ring-emerald-100">
        set
      </span>
    </div>
  );
}
