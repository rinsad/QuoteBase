import Link from "next/link";
import { redirect } from "next/navigation";
import {
  Bell,
  BookOpen,
  FileCheck2,
  FileText,
  LayoutDashboard,
  Search,
  Settings,
  ShieldCheck,
  Truck,
  Users,
  Zap,
} from "lucide-react";

import { signOut } from "@/app/(auth)/login/actions";
import { getCurrentUser } from "@/lib/auth/current-user";

type WorkspaceLayoutProps = {
  children: React.ReactNode;
};

type NavItem = {
  label: string;
  href?: string;
  icon: typeof LayoutDashboard;
  adminOnly?: boolean;
  children?: Array<{
    label: string;
    href: string;
  }>;
};

const primaryNav: NavItem[] = [
  { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  {
    label: "Quotes",
    href: "/quotes",
    icon: FileText,
    children: [
      { label: "All quotes", href: "/quotes" },
      { label: "New quote", href: "/quotes/new" },
      { label: "Approved", href: "/quotes/approved" },
    ],
  },
  { label: "Customers", href: "/customers", icon: Users },
  {
    label: "Approvals",
    href: "/quotes/approvals",
    icon: FileCheck2,
    adminOnly: true,
  },
  { label: "Pricing", href: "/admin/pricing", icon: BookOpen, adminOnly: true },
  { label: "Operations", href: "/admin/plants", icon: Truck, adminOnly: true },
  {
    label: "Integrations",
    href: "/admin/integrations/gmail",
    icon: Zap,
    adminOnly: true,
    children: [
      { label: "Gmail", href: "/admin/integrations/gmail" },
      { label: "Slack", href: "/admin/integrations/slack" },
      { label: "Pipedrive", href: "/admin/integrations/pipedrive" },
    ],
  },
  { label: "Admin", href: "/admin/system-check", icon: Settings, adminOnly: true },
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
      !item.adminOnly ||
      user.role === "admin" ||
      user.role === "account_manager",
  );

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
                <div key={item.label} className="min-w-fit lg:mb-2">
                  <div className="flex items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium text-muted-foreground">
                    <Icon className="size-4" />
                    {item.label}
                  </div>
                  <div className="flex gap-1 lg:ml-6 lg:block">
                    {item.children.map((child) => (
                      <Link
                        key={child.href}
                        href={child.href}
                        className="flex min-w-fit items-center rounded-md px-3 py-1.5 text-sm font-medium text-muted-foreground transition hover:bg-secondary hover:text-primary lg:mb-0.5"
                      >
                        {child.label}
                      </Link>
                    ))}
                  </div>
                </div>
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
            <div className="hidden min-w-0 items-center gap-3 rounded-md border border-border bg-background px-3 py-2 sm:flex sm:w-96">
              <Search className="size-4 text-muted-foreground" />
              <span className="truncate text-sm text-muted-foreground">
                Search quotes, customers, job sites, audit events
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
    </main>
  );
}

function formatRole(role: string) {
  return role
    .split("_")
    .map((part) => part[0]?.toUpperCase() + part.slice(1))
    .join(" ");
}
