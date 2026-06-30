import Link from "next/link";

type AppRole = "admin" | "account_manager" | "estimator";

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
          <Link href="/admin/plants" className="mac-link">
            Plants
          </Link>
          <Link href="/admin/material-prices" className="mac-link">
            Material prices
          </Link>
        </>
      ) : null}
      {role === "admin" ? <AdminMenu /> : null}
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
      {role === "admin" ? <AdminMenu /> : null}
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

function AdminMenu() {
  return (
    <details className="nav-menu">
      <summary className="nav-summary">Admin</summary>
      <div className="nav-panel">
        <NavGroup
          title="Operations"
          links={[
            { href: "/admin/plants", label: "Plants" },
            { href: "/admin/suppliers", label: "Suppliers" },
            { href: "/admin/yards", label: "Yards" },
            { href: "/admin/vehicle-types", label: "Vehicle types" },
          ]}
        />
        <NavGroup
          title="Pricing"
          links={[
            { href: "/admin/pricing", label: "Pricing rules" },
            { href: "/admin/price-book", label: "Price book" },
            { href: "/admin/tax-rates", label: "Tax rates" },
            { href: "/admin/material-prices", label: "Material prices" },
          ]}
        />
        <NavGroup
          title="Workspace"
          links={[
            { href: "/admin/onboarding", label: "Onboarding" },
            { href: "/admin/branding", label: "Branding" },
            { href: "/admin/reports", label: "Reports" },
            { href: "/admin/feature-flags", label: "Features" },
            { href: "/admin/integrations/gmail", label: "Gmail integration" },
            { href: "/admin/integrations/slack", label: "Slack integration" },
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
  links: Array<{ href: string; label: string }>;
}) {
  return (
    <div>
      <p className="nav-group-title">{title}</p>
      <div className="nav-group-links">
        {links.map((link) => (
          <Link key={link.href} href={link.href} className="nav-panel-link">
            {link.label}
          </Link>
        ))}
      </div>
    </div>
  );
}
