import {
  BadgeCheck,
  CheckCircle2,
  ClipboardList,
  Database,
  Flag,
  KeyRound,
  LockKeyhole,
  Route,
  ShieldCheck,
} from "lucide-react";

const setupItems = [
  { label: "Next.js 15 app scaffold", status: "Done" },
  { label: "TypeScript strict mode", status: "Done" },
  { label: "Tailwind CSS v4", status: "Done" },
  { label: "shadcn/ui foundation", status: "Done" },
  { label: "Supabase project values", status: "Needed" },
  { label: "Day 1 schema migration", status: "Next" },
];

const guardrails = [
  {
    icon: Database,
    title: "Multi-tenant",
    detail: "Every business table and query is scoped by organization_id.",
  },
  {
    icon: LockKeyhole,
    title: "RLS + auth",
    detail: "Policies protect the database; API routes verify role and org.",
  },
  {
    icon: ClipboardList,
    title: "Audit trail",
    detail: "State-changing actions write immutable audit_log entries.",
  },
  {
    icon: Flag,
    title: "Feature gates",
    detail: "Capabilities turn on per organization without code deploys.",
  },
];

const dayOneTasks = [
  "Create organizations, users, and feature_flags tables.",
  "Enable RLS before loading business data.",
  "Allowlist the six Western Materials users.",
  "Build login and dashboard role display.",
  "Verify cross-organization reads fail.",
  "Log the day in docs/build-log.md.",
];

export default function Home() {
  return (
    <main className="min-h-screen overflow-hidden bg-[radial-gradient(circle_at_top_left,#ffffff_0,#f6f7f9_38%,#edf1f5_100%)] text-foreground">
      <div className="mx-auto flex w-full max-w-7xl flex-col px-4 py-4 sm:px-6 lg:px-8">
        <header className="glass-panel sticky top-4 z-10 flex min-h-14 items-center justify-between px-4">
          <div className="flex items-center gap-3">
            <div className="flex gap-1.5">
              <span className="size-3 rounded-full bg-[#ff5f57]" />
              <span className="size-3 rounded-full bg-[#ffbd2e]" />
              <span className="size-3 rounded-full bg-[#28c840]" />
            </div>
            <div className="h-5 w-px bg-border" />
            <p className="text-sm font-medium text-muted-foreground">
              QuoteBase
            </p>
          </div>
          <div className="hidden items-center gap-2 rounded-full border border-white/70 bg-white/55 px-3 py-1.5 text-sm shadow-sm sm:flex">
            <ShieldCheck className="size-4 text-emerald-600" />
            <span className="font-medium">Memory loaded</span>
          </div>
        </header>

        <section className="grid gap-6 py-8 lg:grid-cols-[1.1fr_0.9fr] lg:py-10">
          <div className="glass-panel p-6 sm:p-8 lg:p-10">
            <p className="text-sm font-medium text-muted-foreground">
              Western Materials Quoting App
            </p>
            <h1 className="mt-4 max-w-3xl text-4xl font-semibold tracking-normal text-balance sm:text-5xl lg:text-6xl">
              A calm command center for the QuoteBase build.
            </h1>
            <p className="mt-5 max-w-2xl text-base leading-7 text-muted-foreground sm:text-lg">
              The foundation is set up as a professional internal product from
              day one: multi-tenant, auditable, configurable, and ready for the
              Western Materials quoting workflow.
            </p>

            <div className="mt-8 grid gap-3 sm:grid-cols-3">
              <Metric label="Phase" value="Day 0" />
              <Metric label="Stack" value="Next 15" />
              <Metric label="Mode" value="MVP" />
            </div>
          </div>

          <aside className="glass-panel p-5 sm:p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">
                  Setup Progress
                </p>
                <h2 className="mt-1 text-2xl font-semibold">Foundation</h2>
              </div>
              <div className="rounded-full bg-emerald-50 p-2 text-emerald-700 ring-1 ring-emerald-100">
                <BadgeCheck className="size-5" />
              </div>
            </div>

            <div className="mt-6 space-y-2.5">
              {setupItems.map((item) => (
                <div
                  key={item.label}
                  className="flex min-h-12 items-center justify-between gap-3 rounded-xl border border-white/70 bg-white/60 px-4 shadow-sm"
                >
                  <span className="text-sm font-medium">{item.label}</span>
                  <StatusPill status={item.status} />
                </div>
              ))}
            </div>
          </aside>
        </section>

        <section className="grid gap-6 pb-8 lg:grid-cols-[1.15fr_0.85fr]">
          <div className="glass-panel p-5 sm:p-6">
            <div className="flex items-center gap-3">
              <div className="rounded-xl bg-blue-50 p-2 text-blue-700 ring-1 ring-blue-100">
                <Route className="size-5" />
              </div>
              <div>
                <p className="text-sm font-medium text-muted-foreground">
                  Next Build Step
                </p>
                <h2 className="text-xl font-semibold">
                  Database schema and magic-link authentication
                </h2>
              </div>
            </div>

            <div className="mt-6 grid gap-3 sm:grid-cols-2">
              {dayOneTasks.map((task) => (
                <ChecklistItem key={task} text={task} />
              ))}
            </div>
          </div>

          <aside className="glass-panel p-5 sm:p-6">
            <div className="flex items-center gap-3">
              <div className="rounded-xl bg-amber-50 p-2 text-amber-700 ring-1 ring-amber-100">
                <KeyRound className="size-5" />
              </div>
              <div>
                <p className="text-sm font-medium text-muted-foreground">
                  Environment Needed
                </p>
                <h2 className="text-xl font-semibold">Supabase keys</h2>
              </div>
            </div>
            <p className="mt-4 text-sm leading-6 text-muted-foreground">
              Add these values to `.env.local` before Day 1 auth work begins.
            </p>
            <div className="mt-5 space-y-2.5">
              <EnvRow name="NEXT_PUBLIC_SUPABASE_URL" />
              <EnvRow name="NEXT_PUBLIC_SUPABASE_ANON_KEY" />
              <EnvRow name="SUPABASE_SERVICE_ROLE_KEY" />
            </div>
          </aside>
        </section>

        <section className="grid gap-4 pb-10 md:grid-cols-2 lg:grid-cols-4">
          {guardrails.map((item) => {
            const Icon = item.icon;

            return (
              <div key={item.title} className="glass-tile p-5">
                <Icon className="size-5 text-foreground" />
                <h3 className="mt-4 text-sm font-semibold">{item.title}</h3>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">
                  {item.detail}
                </p>
              </div>
            );
          })}
        </section>
      </div>
    </main>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white/70 bg-white/55 px-4 py-3 shadow-sm">
      <p className="text-xs font-medium uppercase text-muted-foreground">
        {label}
      </p>
      <p className="mt-1 text-lg font-semibold">{value}</p>
    </div>
  );
}

function ChecklistItem({ text }: { text: string }) {
  return (
    <div className="flex gap-3 rounded-xl border border-white/70 bg-white/55 p-4 shadow-sm">
      <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-600" />
      <p className="text-sm leading-6 text-muted-foreground">{text}</p>
    </div>
  );
}

function EnvRow({ name }: { name: string }) {
  return (
    <div className="flex min-h-11 items-center justify-between gap-3 rounded-xl border border-white/70 bg-white/60 px-3 shadow-sm">
      <code className="min-w-0 truncate text-xs font-medium">{name}</code>
      <span className="rounded-full bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-700 ring-1 ring-amber-100">
        blank
      </span>
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  const className =
    status === "Done"
      ? "bg-emerald-50 text-emerald-700 ring-emerald-100"
      : status === "Next"
        ? "bg-blue-50 text-blue-700 ring-blue-100"
        : "bg-amber-50 text-amber-700 ring-amber-100";

  return (
    <span
      className={`rounded-full px-2.5 py-1 text-xs font-medium ring-1 ${className}`}
    >
      {status}
    </span>
  );
}
