import Link from "next/link";

type AppRole = "platform_admin" | "admin" | "account_manager" | "estimator";

export function WorkspaceNav({ role }: { role: AppRole }) {
  return (
    <nav className="toolbar-nav" aria-label="Workspace navigation">
      <Link href="/dashboard" className="mac-link">
        Dashboard
      </Link>
      <Link href="/quotes/new" className="mac-link">
        New Quote
      </Link>
      <Link href="/quotes" className="mac-link">
        Pipeline
      </Link>
      <Link href="/customers" className="mac-link">
        Customers
      </Link>
      <Link href="/audit-log" className="mac-link">
        Audit log
      </Link>
      {role === "admin" || role === "account_manager" ? (
        <>
          <Link href="/admin/suppliers" className="mac-link">
            Suppliers
          </Link>
        </>
      ) : null}
      {role === "admin" || role === "account_manager" ? (
        <AdminMenu role={role} />
      ) : null}
      {role === "platform_admin" ? <PlatformMenu /> : null}
    </nav>
  );
}

export function AdminNav({ role = "admin" }: { role?: AppRole } = {}) {
  return (
    <nav className="toolbar-nav" aria-label="Admin navigation">
      <Link href="/dashboard" className="mac-link">
        Dashboard
      </Link>
      <Link href="/quotes" className="mac-link">
        Pipeline
      </Link>
      {role === "admin" || role === "account_manager" ? (
        <AdminMenu role={role} />
      ) : null}
      {role === "platform_admin" ? <PlatformMenu /> : null}
    </nav>
  );
}

export function QuoteNav({
  quoteId,
  includePrint = false,
}: {
  quoteId?: string;
  includePrint?: boolean;
}) {
  return (
    <nav className="toolbar-nav" aria-label="Quote navigation">
      <Link href="/dashboard" className="mac-link">
        Dashboard
      </Link>
      <Link href="/quotes/new" className="mac-link">
        New Quote
      </Link>
      <Link href="/quotes" className="mac-link">
        Pipeline
      </Link>
      {includePrint && quoteId ? (
        <Link href={`/quotes/${quoteId}/print`} className="mac-link">
          Print
        </Link>
      ) : null}
    </nav>
  );
}

function PlatformMenu() {
  return (
    <details className="nav-menu">
      <summary className="nav-summary">Platform</summary>
      <div className="nav-panel">
        <NavGroup
          title="Catalogs"
          links={[{ href: "/platform/units", label: "Unit catalog" }]}
        />
      </div>
    </details>
  );
}

function AdminMenu({ role }: { role: "admin" | "account_manager" }) {
  if (role === "account_manager") {
    return (
      <details className="nav-menu">
        <summary className="nav-summary">Admin</summary>
        <div className="nav-panel">
          <NavGroup
            title="Workspace"
            links={[{ href: "/assets", label: "Assets" }]}
          />
        </div>
      </details>
    );
  }

  return (
    <details className="nav-menu">
      <summary className="nav-summary">Admin</summary>
      <div className="nav-panel">
        <NavGroup
          title="Masters"
          links={[
            { href: "/admin/suppliers", label: "Suppliers" },
            { href: "/admin/plants", label: "Plants", nested: true },
            {
              href: "/admin/material-prices",
              label: "Materials",
              nested: true,
            },
            { href: "/admin/pricing", label: "Pricing rules" },
            { href: "/admin/units", label: "Units" },
            { href: "/admin/tax-rates", label: "Tax rates" },
            { href: "/admin/yards", label: "Yards" },
            { href: "/admin/vehicle-types", label: "Vehicle types" },
          ]}
        />
        <NavGroup
          title="Workspace"
          links={[
            { href: "/admin/settings", label: "Settings" },
            { href: "/assets", label: "Assets" },
            { href: "/admin/onboarding", label: "Onboarding" },
            { href: "/admin/branding", label: "Branding" },
            { href: "/admin/reports", label: "Reports" },
            { href: "/admin/feature-flags", label: "Features" },
            { href: "/admin/integrations/gmail", label: "Gmail" },
            { href: "/admin/integrations/openai", label: "OpenAI" },
            { href: "/admin/integrations/slack", label: "Slack integration" },
            { href: "/admin/integrations/mapbox", label: "Mapbox" },
            { href: "/admin/integrations/stripe", label: "Stripe" },
            { href: "/admin/integrations/authorizenet", label: "Authorize.net" },
            { href: "/admin/users", label: "Users" },
            { href: "/admin/audit-log", label: "Audit log" },
            { href: "/admin/system-check", label: "System check" },
          ]}
        />
      </div>
    </details>
  );
}

function NavGroup({
  title,
  links,
}: {
  title: string;
  links: Array<{ href: string; label: string; nested?: boolean }>;
}) {
  return (
    <div>
      <p className="nav-group-title">{title}</p>
      <div className="nav-group-links">
        {links.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className={`nav-panel-link ${link.nested ? "pl-6 text-muted-foreground" : ""}`}
          >
            {link.label}
          </Link>
        ))}
      </div>
    </div>
  );
}
