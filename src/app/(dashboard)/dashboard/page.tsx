import Link from "next/link";
import { redirect } from "next/navigation";
import {
  ArrowRight,
  Banknote,
  Flame,
  Gauge,
  ListTodo,
  MessageSquare,
  Plus,
  Sparkles,
  TrendingDown,
  Trophy,
  Search,
  type LucideIcon,
} from "lucide-react";
import type { ReactNode } from "react";

import { getCurrentUser } from "@/lib/auth/current-user";
import {
  normalizeSearchQuery,
  searchWorkspace,
  type GlobalSearchResult,
} from "@/lib/global-search";
import {
  getQuoteList,
  type DashboardQuoteInsight,
} from "@/lib/quotes/quotes";

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/login");
  }

  const query = await searchParams;
  const searchQuery = normalizeSearchQuery(query.q ?? "");
  const [quoteList, searchResults] = await Promise.all([
    getQuoteList(user),
    searchQuery ? searchWorkspace({ user, query: searchQuery }) : null,
  ]);
  const kpis = quoteList.moneyKpis;
  const kpiCards = [
    {
      label: "Quoted",
      value: formatCurrency(kpis.quotedValue),
      sub: `${quoteList.counts.total} active quotes`,
      icon: Banknote,
    },
    {
      label: "Open",
      value: formatCurrency(kpis.openValue),
      sub: `${quoteList.counts.sent + quoteList.counts.followUp} in market`,
      icon: MessageSquare,
    },
    {
      label: "Won",
      value: formatCurrency(kpis.wonValue),
      sub: `${quoteList.counts.won} closed won`,
      icon: Trophy,
    },
    {
      label: "Lost",
      value: formatCurrency(kpis.lostValue),
      sub: `${quoteList.counts.lost} closed lost`,
      icon: TrendingDown,
    },
    {
      label: "Win rate",
      value: `${kpis.winRate.toFixed(0)}%`,
      sub: "Won / decided",
      icon: Gauge,
    },
    {
      label: "Follow-ups due",
      value: kpis.followUpsDue.toString(),
      sub: "Quotes in follow-up",
      icon: ListTodo,
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
            Pipeline dashboard
          </h1>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-muted-foreground">
            Money, engagement, and follow-up signals for{" "}
            {user.organization?.name ?? "this organization"}.
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <Link href="/quotes" className="mac-link h-11 rounded-full">
            Pipeline
            <ArrowRight className="size-4" />
          </Link>
          <Link href="/quotes/new" className="mac-button-primary h-11 rounded-full">
            <Plus className="size-4" />
            New Quote
          </Link>
        </div>
      </div>

      {searchQuery && searchResults ? (
        <section className="mb-6 glass-panel p-5 sm:p-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div className="flex items-center gap-3">
              <div className="icon-well text-primary">
                <Search className="size-5" />
              </div>
              <div>
                <p className="text-sm font-medium text-muted-foreground">
                  Workspace search
                </p>
                <h2 className="text-2xl font-semibold tracking-normal">
                  Results for &quot;{searchQuery}&quot;
                </h2>
              </div>
            </div>
            <Link href="/dashboard" className="mac-link h-10 rounded-full">
              Clear search
            </Link>
          </div>
          <div className="mt-5 grid gap-4 xl:grid-cols-2">
            <SearchResultGroup
              title="Quotes"
              results={searchResults.quote}
              emptyText="No matching quotes."
            />
            <SearchResultGroup
              title="Customers"
              results={searchResults.customer}
              emptyText="No matching customers."
            />
            <SearchResultGroup
              title="Job sites"
              results={searchResults.job_site}
              emptyText="No matching job sites."
            />
            <SearchResultGroup
              title="Audit events"
              results={searchResults.audit}
              emptyText="No matching audit events."
            />
          </div>
        </section>
      ) : null}

      <section className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        {kpiCards.map((card) => {
          const Icon = card.icon;

          return (
            <div key={card.label} className="glass-tile min-h-32 p-4">
              <div className="flex items-start justify-between gap-3">
                <p className="text-xs font-medium uppercase text-muted-foreground">
                  {card.label}
                </p>
                <Icon className="size-4 text-primary" />
              </div>
              <p className="mt-4 break-words font-mono text-2xl font-semibold">
                {card.value}
              </p>
              <p className="mt-2 text-xs text-muted-foreground">{card.sub}</p>
            </div>
          );
        })}
      </section>

      <section className="mt-6 grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <DashboardPanel
          icon={Flame}
          kicker="Engagement"
          title="Hot Quotes"
          actionHref="/quotes"
          actionLabel="Open pipeline"
        >
          <QuoteInsightList
            quotes={quoteList.hotQuotes}
            emptyText="No customer engagement events yet."
            metricLabel="Heat"
            metric={(quote) => quote.heatScore.toString()}
            detail={(quote) =>
              `${quote.eventCount} event${quote.eventCount === 1 ? "" : "s"}${
                quote.lastEventAt ? ` · ${formatDate(quote.lastEventAt)}` : ""
              }`
            }
          />
        </DashboardPanel>

        <DashboardPanel
          icon={Banknote}
          kicker="Pipeline value"
          title="Big Quotes"
          actionHref="/quotes"
          actionLabel="View board"
        >
          <QuoteInsightList
            quotes={quoteList.bigQuotes}
            emptyText="No open quotes are waiting in the pipeline."
            metricLabel="Total"
            metric={(quote) => formatCurrency(quote.total)}
            detail={(quote) => formatStatus(quote.status)}
          />
        </DashboardPanel>
      </section>

      <section className="mt-6">
        <div className="glass-panel p-5 sm:p-6">
          <div className="flex items-center gap-3">
            <div className="icon-well text-primary">
              <Sparkles className="size-5" />
            </div>
            <div>
              <p className="text-sm font-medium text-muted-foreground">
                Focus
              </p>
              <h2 className="text-xl font-semibold">Today&apos;s motion</h2>
            </div>
          </div>
          <div className="mt-5 grid gap-3 sm:grid-cols-3">
            <FocusLink
              href="/quotes"
              label="Work follow-ups"
              value={kpis.followUpsDue.toString()}
            />
            <FocusLink
              href="/quotes"
              label="Open money"
              value={formatCurrency(kpis.openValue)}
            />
            <FocusLink
              href="/admin/reports"
              label="Review trend"
              value={`${kpis.winRate.toFixed(0)}%`}
            />
          </div>
        </div>
      </section>
    </>
  );
}

function SearchResultGroup({
  title,
  results,
  emptyText,
}: {
  title: string;
  results: GlobalSearchResult[];
  emptyText: string;
}) {
  return (
    <div className="rounded-md border border-border bg-background p-3">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold">{title}</h3>
        <span className="rounded-full bg-secondary px-2 py-1 text-xs font-semibold text-secondary-foreground">
          {results.length}
        </span>
      </div>
      <div className="mt-3 space-y-2">
        {results.length ? (
          results.map((result) => (
            <Link
              key={`${result.type}-${result.id}`}
              href={result.href}
              className="soft-row block px-3 py-3 transition hover:border-input hover:bg-secondary/70"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">{result.title}</p>
                  <p className="mt-1 truncate text-xs text-muted-foreground">
                    {result.detail}
                  </p>
                </div>
                {result.createdAt ? (
                  <span className="shrink-0 font-mono text-xs text-muted-foreground">
                    {formatDate(result.createdAt)}
                  </span>
                ) : null}
              </div>
            </Link>
          ))
        ) : (
          <div className="soft-row px-3 py-6 text-center text-sm text-muted-foreground">
            {emptyText}
          </div>
        )}
      </div>
    </div>
  );
}

function DashboardPanel({
  icon: Icon,
  kicker,
  title,
  actionHref,
  actionLabel,
  children,
}: {
  icon: LucideIcon;
  kicker: string;
  title: string;
  actionHref: string;
  actionLabel: string;
  children: ReactNode;
}) {
  return (
    <div className="glass-panel overflow-hidden">
      <div className="flex items-center justify-between gap-3 border-b border-border bg-muted/60 px-4 py-3">
        <div className="flex items-center gap-3">
          <div className="icon-well text-primary">
            <Icon className="size-5" />
          </div>
          <div>
            <p className="text-sm font-medium text-muted-foreground">{kicker}</p>
            <h2 className="text-xl font-semibold">{title}</h2>
          </div>
        </div>
        <Link href={actionHref} className="mac-link h-9 rounded-full text-xs">
          {actionLabel}
        </Link>
      </div>
      <div className="p-4">{children}</div>
    </div>
  );
}

function QuoteInsightList({
  quotes,
  emptyText,
  metricLabel,
  metric,
  detail,
}: {
  quotes: DashboardQuoteInsight[];
  emptyText: string;
  metricLabel: string;
  metric: (quote: DashboardQuoteInsight) => string;
  detail: (quote: DashboardQuoteInsight) => string;
}) {
  if (!quotes.length) {
    return (
      <div className="soft-row px-4 py-10 text-center text-sm text-muted-foreground">
        {emptyText}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {quotes.map((quote) => (
        <Link
          key={quote.id}
          href={`/quotes/${quote.id}`}
          className="soft-row grid gap-3 px-4 py-4 transition hover:border-input hover:bg-secondary/70 sm:grid-cols-[1fr_auto] sm:items-center"
        >
          <div className="min-w-0">
            <div className="flex min-w-0 items-center gap-2">
              <p className="truncate text-sm font-semibold">{quote.quote_number}</p>
              <span className="soft-chip shrink-0 bg-secondary text-secondary-foreground ring-border">
                {formatStatus(quote.status)}
              </span>
            </div>
            <p className="mt-1 truncate text-sm text-muted-foreground">
              {quote.customer_name}
            </p>
            <p className="mt-2 truncate text-xs text-muted-foreground">
              {quote.job_site_city || quote.job_site_name} · {detail(quote)}
            </p>
          </div>
          <div className="text-left sm:text-right">
            <p className="text-xs font-medium uppercase text-muted-foreground">
              {metricLabel}
            </p>
            <p className="mt-1 font-mono text-lg font-semibold">{metric(quote)}</p>
          </div>
        </Link>
      ))}
    </div>
  );
}

function FocusLink({
  href,
  label,
  value,
}: {
  href: string;
  label: string;
  value: string;
}) {
  return (
    <Link
      href={href}
      className="soft-row flex min-h-24 flex-col justify-between p-4 transition hover:border-input hover:bg-secondary/70"
    >
      <p className="text-xs font-medium uppercase text-muted-foreground">
        {label}
      </p>
      <p className="break-words font-mono text-xl font-semibold">{value}</p>
    </Link>
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

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
  }).format(new Date(value));
}
