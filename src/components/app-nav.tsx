import Link from "next/link";

type AppRole = "admin" | "account_manager" | "estimator";

export function WorkspaceNav({ role }: { role: AppRole }) {
  return (
    <nav className="toolbar-nav" aria-label="Workspace navigation">
      <Link href="/dashboard" className="mac-link">
        Dashboard
      </Link>
      <Link href="/quotes/new" className="mac-link">
        New quote
      </Link>
      <Link href="/quotes" className="mac-link">
        Quotes
      </Link>
      <Link href="/customers" className="mac-link">
        Customers
      </Link>
      {role === "admin" || role === "account_manager" ? (
        <Link href="/admin/material-prices" className="mac-link">
          Material prices
        </Link>
      ) : null}
      {role === "admin" ? <AdminMenu /> : null}
    </nav>
  );
}

export function AdminNav() {
  return (
    <nav className="toolbar-nav" aria-label="Admin navigation">
      <Link href="/dashboard" className="mac-link">
        Dashboard
      </Link>
      <Link href="/quotes" className="mac-link">
        Quotes
      </Link>
      <AdminMenu />
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
        New quote
      </Link>
      <Link href="/quotes" className="mac-link">
        Quotes
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
            { href: "/admin/plants", label: "Materials" },
            { href: "/admin/suppliers", label: "Suppliers" },
            { href: "/admin/yards", label: "Yards" },
            { href: "/admin/vehicle-types", label: "Vehicles" },
          ]}
        />
        <NavGroup
          title="Pricing"
          links={[
            { href: "/admin/pricing", label: "Pricing config" },
            { href: "/admin/tax-rates", label: "Tax rates" },
            { href: "/admin/material-prices", label: "Material prices" },
          ]}
        />
        <NavGroup
          title="Workspace"
          links={[
            { href: "/admin/feature-flags", label: "Features" },
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
