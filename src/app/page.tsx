import {
  BadgeCheck,
  ClipboardList,
  Database,
  Flag,
  LockKeyhole,
  Route,
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
    title: "Multi-tenant from day 1",
    detail: "Every business table and query is scoped by organization_id.",
  },
  {
    icon: LockKeyhole,
    title: "RLS plus server checks",
    detail: "Supabase RLS is required, but API routes still verify role and org.",
  },
  {
    icon: ClipboardList,
    title: "Audit every change",
    detail: "State-changing actions write immutable audit_log entries.",
  },
  {
    icon: Flag,
    title: "Feature flags",
    detail: "Capabilities are enabled per organization without code deploys.",
  },
];

export default function Home() {
  return (
    <main className="min-h-screen bg-background">
      <section className="border-b bg-muted/30">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-6 py-10 sm:px-8 lg:px-10">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-3xl">
              <p className="text-sm font-medium text-muted-foreground">
                Western Materials Quoting App
              </p>
              <h1 className="mt-3 text-4xl font-semibold tracking-normal text-foreground sm:text-5xl">
                QuoteBase foundation console
              </h1>
              <p className="mt-4 max-w-2xl text-base leading-7 text-muted-foreground">
                Day 0 setup is underway. This app starts as Western Materials&apos;
                internal quoting system and is being built as tenant one of the
                future QuoteBase AI SaaS.
              </p>
            </div>
            <div className="flex items-center gap-2 rounded-md border bg-background px-3 py-2 text-sm">
              <BadgeCheck className="size-4 text-emerald-600" />
              <span className="font-medium">Project memory loaded</span>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {setupItems.map((item) => (
              <div
                key={item.label}
                className="flex items-center justify-between rounded-md border bg-background px-4 py-3"
              >
                <span className="text-sm font-medium">{item.label}</span>
                <span
                  className={`rounded-sm px-2 py-1 text-xs font-medium ${
                    item.status === "Done"
                      ? "bg-emerald-50 text-emerald-700"
                      : item.status === "Next"
                        ? "bg-blue-50 text-blue-700"
                        : "bg-amber-50 text-amber-700"
                  }`}
                >
                  {item.status}
                </span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto grid w-full max-w-6xl gap-8 px-6 py-10 sm:px-8 lg:grid-cols-[1.15fr_0.85fr] lg:px-10">
        <div>
          <div className="flex items-center gap-2">
            <Route className="size-5 text-blue-700" />
            <h2 className="text-xl font-semibold">Next Build Step</h2>
          </div>
          <div className="mt-5 rounded-md border">
            <div className="border-b px-5 py-4">
              <p className="text-sm font-medium text-muted-foreground">
                Day 1 target
              </p>
              <h3 className="mt-1 text-lg font-semibold">
                Database schema and magic-link authentication
              </h3>
            </div>
            <div className="grid gap-4 px-5 py-5 sm:grid-cols-2">
              <ChecklistItem text="Create organizations, users, and feature_flags tables." />
              <ChecklistItem text="Enable RLS before loading business data." />
              <ChecklistItem text="Allowlist the six Western Materials users." />
              <ChecklistItem text="Build login and dashboard role display." />
              <ChecklistItem text="Verify cross-organization reads fail." />
              <ChecklistItem text="Log the day in docs/build-log.md." />
            </div>
          </div>
        </div>

        <aside className="rounded-md border bg-muted/20 p-5">
          <h2 className="text-xl font-semibold">Environment Needed</h2>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            Add the Supabase project URL and anon key to `.env.local` before
            Day 1 auth work begins.
          </p>
          <div className="mt-5 space-y-2 text-sm">
            <EnvRow name="NEXT_PUBLIC_SUPABASE_URL" />
            <EnvRow name="NEXT_PUBLIC_SUPABASE_ANON_KEY" />
            <EnvRow name="SUPABASE_SERVICE_ROLE_KEY" />
          </div>
        </aside>
      </section>

      <section className="mx-auto grid w-full max-w-6xl gap-4 px-6 pb-12 sm:px-8 md:grid-cols-2 lg:grid-cols-4 lg:px-10">
        {guardrails.map((item) => {
          const Icon = item.icon;

          return (
            <div key={item.title} className="rounded-md border p-5">
              <Icon className="size-5 text-foreground" />
              <h3 className="mt-4 text-sm font-semibold">{item.title}</h3>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                {item.detail}
              </p>
            </div>
          );
        })}
      </section>
    </main>
  );
}

function ChecklistItem({ text }: { text: string }) {
  return (
    <div className="flex gap-3">
      <BadgeCheck className="mt-0.5 size-4 shrink-0 text-emerald-600" />
      <p className="text-sm leading-6 text-muted-foreground">{text}</p>
    </div>
  );
}

function EnvRow({ name }: { name: string }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-md border bg-background px-3 py-2">
      <code className="text-xs font-medium">{name}</code>
      <span className="rounded-sm bg-amber-50 px-2 py-1 text-xs font-medium text-amber-700">
        blank
      </span>
    </div>
  );
}
