import Link from "next/link";
import { redirect } from "next/navigation";
import {
  Bell,
  BookOpen,
  FileText,
  LayoutDashboard,
  Search,
  Settings,
  Users,
  Zap,
} from "lucide-react";

import { signOut } from "@/app/(auth)/login/actions";
import { AssistantBox } from "@/app/(dashboard)/dashboard/assistant-box";
import { ThemeToggle } from "@/components/theme-toggle";
import { getCurrentUser } from "@/lib/auth/current-user";
import { createClient } from "@/lib/supabase/server";

type WorkspaceLayoutProps = {
  children: React.ReactNode;
};

type NavItem = {
  label: string;
  href?: string;
  icon: typeof LayoutDashboard;
  adminOnly?: boolean;
  platformOnly?: boolean;
  accountManagerAllowed?: boolean;
  children?: Array<{
    label: string;
    href: string;
    adminOnly?: boolean;
    nested?: boolean;
  }>;
};

const primaryNav: NavItem[] = [
  { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  {
    label: "Quotes",
    href: "/quotes",
    icon: FileText,
  },
  { label: "Customers", href: "/customers", icon: Users },
  {
    label: "Masters",
    href: "/admin/pricing",
    icon: BookOpen,
    adminOnly: true,
    accountManagerAllowed: true,
    children: [
      { label: "Suppliers", href: "/admin/suppliers" },
      { label: "Plants", href: "/admin/plants", nested: true },
      { label: "Materials", href: "/admin/material-prices", nested: true },
      { label: "Pricing rules", href: "/admin/pricing" },
      { label: "Customer types", href: "/admin/customer-types" },
      { label: "Units", href: "/admin/units" },
      { label: "Tax rates", href: "/admin/tax-rates" },
      { label: "Vehicle types", href: "/admin/vehicle-types" },
      { label: "Yards", href: "/admin/yards" },
    ],
  },
  {
    label: "Integrations",
    href: "/admin/integrations/gmail",
    icon: Zap,
    children: [
      { label: "CRM customers", href: "/admin/integrations/crm", adminOnly: true },
      { label: "Gmail", href: "/admin/integrations/gmail" },
      { label: "OpenAI", href: "/admin/integrations/openai", adminOnly: true },
      { label: "Slack", href: "/admin/integrations/slack", adminOnly: true },
      { label: "Mapbox", href: "/admin/integrations/mapbox", adminOnly: true },
      {
        label: "Stripe",
        href: "/admin/integrations/stripe",
        adminOnly: true,
      },
      {
        label: "Authorize.net",
        href: "/admin/integrations/authorizenet",
        adminOnly: true,
      },
    ],
  },
  {
    label: "Admin",
    href: "/admin/system-check",
    icon: Settings,
    adminOnly: true,
    accountManagerAllowed: true,
    children: [
      { label: "Settings", href: "/admin/settings", adminOnly: true },
      { label: "Assets", href: "/assets" },
      { label: "Onboarding", href: "/admin/onboarding", adminOnly: true },
      { label: "Branding", href: "/admin/branding", adminOnly: true },
      { label: "Users", href: "/admin/users", adminOnly: true },
      { label: "System check", href: "/admin/system-check", adminOnly: true },
    ],
  },
  {
    label: "Platform",
    href: "/platform/units",
    icon: Settings,
    platformOnly: true,
    children: [{ label: "Unit catalog", href: "/platform/units" }],
  },
];

export default async function WorkspaceLayout({
  children,
}: WorkspaceLayoutProps) {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/login");
  }

  const visibleNav = primaryNav.filter(
    (item) =>
      (!item.platformOnly || user.role === "platform_admin") &&
      (!item.adminOnly ||
        user.role === "admin" ||
        (item.accountManagerAllowed && user.role === "account_manager")),
  );
  const showAssistant = await isAssistantEnabled(user.organization_id);

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
                {user.organization?.name ?? "Workspace"}
              </p>
            </div>
            <form action={signOut} className="lg:hidden">
              <button type="submit" className="mac-link h-9">
                Sign out
              </button>
            </form>
          </div>

          <nav
            className="flex gap-1 overflow-x-auto p-2 lg:block"
            aria-label="Workspace navigation"
          >
            {visibleNav.map((item) => {
              const Icon = item.icon;

              return item.children ? (
                <details key={item.label} className="group min-w-fit lg:mb-2">
                  <summary className="flex cursor-pointer list-none items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition hover:bg-secondary hover:text-primary [&::-webkit-details-marker]:hidden">
                    <Icon className="size-4" />
                    <span>{item.label}</span>
                    <span className="ml-auto text-xs transition group-open:rotate-90">
                      ›
                    </span>
                  </summary>
                  <div className="flex gap-1 border-l border-border/70 pl-2 lg:ml-5 lg:mt-1 lg:block">
                    {item.children
                      .filter((child) => !child.adminOnly || user.role === "admin")
                      .map((child) => (
                        <Link
                          key={child.href}
                          href={child.href}
                          className={`flex min-w-fit items-center rounded-md px-3 py-1.5 text-xs font-medium text-muted-foreground/80 transition hover:bg-secondary hover:text-primary lg:mb-0.5 ${
                            child.nested ? "lg:pl-6" : ""
                          }`}
                        >
                          <span className="mr-2 hidden h-1.5 w-1.5 rounded-full bg-border lg:inline-block" />
                          {child.label}
                        </Link>
                      ))}
                  </div>
                </details>
              ) : (
                <Link
                  key={item.href ?? item.label}
                  href={item.href ?? "/dashboard"}
                  className="flex min-w-fit items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition hover:bg-secondary hover:text-primary lg:mb-0.5"
                >
                  <Icon className="size-4" />
                  {item.label}
                </Link>
              );
            })}
          </nav>

          <div className="hidden border-t border-border p-3 lg:block">
            <div className="rounded-md bg-secondary px-3 py-2">
              <p className="text-sm font-medium">{user.full_name}</p>
              <p className="text-xs text-muted-foreground">
                {formatRole(user.role)}
              </p>
            </div>
          </div>
        </aside>

        <section className="min-w-0">
          <header className="flex min-h-14 items-center justify-between gap-4 border-b border-border bg-card px-4 sm:px-6">
            <form
              action="/dashboard"
              className="hidden min-w-0 items-center gap-3 rounded-md border border-border bg-background px-3 py-2 transition focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/20 sm:flex sm:w-96"
              role="search"
            >
              <Search className="size-4 text-muted-foreground" />
              <label htmlFor="workspace-search" className="sr-only">
                Search quotes, customers, job sites, audit events
              </label>
              <input
                id="workspace-search"
                name="q"
                type="search"
                className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
                placeholder="Search quotes, customers, job sites, audit events"
              />
            </form>
            <div className="flex items-center gap-2 sm:ml-auto">
              <ThemeToggle />
              <button
                type="button"
                className="rounded-md border border-border bg-card p-2 text-muted-foreground"
                aria-label="Notifications"
              >
                <Bell className="size-4" />
              </button>
              <form action={signOut} className="hidden sm:block">
                <button type="submit" className="mac-link h-9">
                  Sign out
                </button>
              </form>
            </div>
          </header>

          <div className="workspace-content mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
            {children}
          </div>
        </section>
      </div>
      {showAssistant ? <AssistantBox /> : null}
    </main>
  );
}

async function isAssistantEnabled(organizationId: string): Promise<boolean> {
  const supabase = await createClient();

  if (!supabase) {
    return false;
  }

  const { data } = await supabase
    .from("organization_integrations")
    .select("is_enabled")
    .eq("organization_id", organizationId)
    .eq("provider", "openai")
    .maybeSingle<{ is_enabled: boolean }>();

  return data?.is_enabled ?? false;
}

function formatRole(role: string) {
  return role
    .split("_")
    .map((part) => part[0]?.toUpperCase() + part.slice(1))
    .join(" ");
}
