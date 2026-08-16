"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { CircleDollarSign, Clock3, FileText, Send, Trophy, XCircle } from "lucide-react";

import { moveQuotePipelineStatus } from "@/app/(dashboard)/quotes/actions";
import type { CustomerType } from "@/lib/admin/customer-types";
import type { QuoteAccountType } from "@/lib/quotes/create-draft";
import type { QuoteProjectStatusOption } from "@/lib/quotes/pricing";
import type { QuoteListItem, QuoteStatus } from "@/lib/quotes/quotes";
import {
  SemanticIcon,
  semanticToneClasses,
  type SemanticTone,
} from "@/components/ui/semantic-accent";

type PipelineStatus = "draft" | "sent" | "follow_up" | "won" | "lost";

type PipelineColumn = {
  key: PipelineStatus;
  title: string;
  subtitle: string;
  statuses: QuoteStatus[];
  icon: typeof FileText;
  tone: SemanticTone;
};

type CategoryView = {
  key: string;
  label: string;
  accountType: QuoteAccountType;
  projectStatus: string;
};

const PIPELINE_COLUMNS: PipelineColumn[] = [
  {
    key: "draft",
    title: "Draft",
    subtitle: "Intake and approval",
    statuses: ["draft", "pending_approval", "changes_requested", "approved", "rejected"],
    icon: FileText,
    tone: "blue",
  },
  {
    key: "sent",
    title: "Sent",
    subtitle: "With customer",
    statuses: ["sent", "viewed"],
    icon: Send,
    tone: "cyan",
  },
  {
    key: "follow_up",
    title: "Follow-up",
    subtitle: "Needs touch",
    statuses: ["follow_up"],
    icon: Clock3,
    tone: "amber",
  },
  {
    key: "won",
    title: "Won",
    subtitle: "Closed revenue",
    statuses: ["won", "accepted"],
    icon: Trophy,
    tone: "emerald",
  },
  {
    key: "lost",
    title: "Lost",
    subtitle: "Closed loss",
    statuses: ["lost", "declined"],
    icon: XCircle,
    tone: "rose",
  },
];

export function QuotePipelineBoard({
  quotes,
  customerTypes,
  projectStatusOptions,
}: {
  quotes: QuoteListItem[];
  customerTypes: CustomerType[];
  projectStatusOptions: QuoteProjectStatusOption[];
}) {
  const [pendingQuoteId, setPendingQuoteId] = useState<string | null>(null);
  const [dragOverColumn, setDragOverColumn] = useState<PipelineStatus | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const categoryViews = useMemo(() => {
    const customerTypeLabels = new Map(
      customerTypes.map((customerType) => [customerType.code, customerType.name]),
    );
    const projectStatusLabels = new Map(
      projectStatusOptions.map((status) => [status.value, status.label]),
    );
    const configuredCategories = customerTypes.flatMap((customerType) =>
      projectStatusOptions.map((projectStatus) =>
        categoryView(
          customerType.code,
          projectStatus.value,
          customerType.name,
          projectStatus.label,
        ),
      ),
    );
    const categories = new Map(
      configuredCategories.map((category) => [category.key, category]),
    );

    for (const quote of quotes) {
      const category = categoryView(
        quote.account_type,
        quote.project_status,
        customerTypeLabels.get(quote.account_type),
        projectStatusLabels.get(quote.project_status),
      );
      categories.set(category.key, category);
    }

    return Array.from(categories.values());
  }, [customerTypes, projectStatusOptions, quotes]);
  const [selectedCategoryKey, setSelectedCategoryKey] = useState(
    categoryViews[0]?.key ?? "",
  );
  const selectedCategory =
    categoryViews.find(
      (category) => category.key === selectedCategoryKey,
    ) ??
    categoryViews[0];
  const categoryQuotes = useMemo(
    () =>
      quotes.filter(
        (quote) =>
          quote.account_type === selectedCategory.accountType &&
          quote.project_status === selectedCategory.projectStatus,
      ),
    [quotes, selectedCategory.accountType, selectedCategory.projectStatus],
  );
  const columns = useMemo(
    () =>
      PIPELINE_COLUMNS.map((column) => ({
        ...column,
        quotes: categoryQuotes.filter((quote) =>
          column.statuses.includes(quote.status),
        ),
      })),
    [categoryQuotes],
  );

  function handleDrop(toStatus: PipelineStatus, quoteId: string) {
    setDragOverColumn(null);
    setMessage(null);
    setPendingQuoteId(quoteId);

    startTransition(async () => {
      const result = await moveQuotePipelineStatus({ quoteId, toStatus });

      if (!result.ok) {
        setMessage(result.message);
      }

      setPendingQuoteId(null);
    });
  }

  return (
    <div>
      <div className="mb-5 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-sm font-medium text-muted-foreground">
            Category board
          </p>
          <h3 className="text-xl font-semibold">{selectedCategory.label}</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Showing one quote category at a time so follow-up and pipeline work
            stay focused.
          </p>
        </div>
        <div className="w-full lg:max-w-sm">
          <label
            htmlFor="quote-category-board"
            className="text-sm font-medium text-muted-foreground"
          >
            Board
          </label>
          <select
            id="quote-category-board"
            value={selectedCategory.key}
            onChange={(event) => setSelectedCategoryKey(event.target.value)}
            className="soft-control mt-2 h-12 w-full rounded-full bg-card px-4 font-semibold text-foreground"
          >
            {categoryViews.map((category) => (
              <option key={category.key} value={category.key}>
                {category.label}
              </option>
            ))}
          </select>
        </div>
      </div>
      {message ? (
        <div className="mb-4 rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm font-medium text-destructive">
          {message}
        </div>
      ) : null}
      <div className="grid gap-4 xl:grid-cols-5">
        {columns.map((column) => {
          const Icon = column.icon;
          const isDragOver = dragOverColumn === column.key;

          return (
            <section
              key={column.key}
              onDragOver={(event) => {
                event.preventDefault();
                setDragOverColumn(column.key);
              }}
              onDragLeave={() => setDragOverColumn(null)}
              onDrop={(event) => {
                event.preventDefault();
                const quoteId = event.dataTransfer.getData("text/plain");

                if (quoteId) {
                  handleDrop(column.key, quoteId);
                }
              }}
              className={`min-h-[420px] rounded-lg border border-l-[3px] bg-background p-3 transition ${semanticToneClasses[column.tone].accent} ${
                isDragOver ? "border-primary ring-2 ring-primary/20" : "border-border"
              }`}
            >
              <div className="flex items-start justify-between gap-3 border-b border-border pb-3">
                <div className="flex items-center gap-3">
                  <SemanticIcon icon={Icon} tone={column.tone} size="sm" />
                  <div>
                    <h3 className="text-sm font-semibold">{column.title}</h3>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {column.subtitle}
                    </p>
                  </div>
                </div>
                <span className="rounded-full bg-secondary px-2 py-1 text-xs font-semibold text-secondary-foreground">
                  {column.quotes.length}
                </span>
              </div>
              <div className="mt-3 space-y-3">
                {column.quotes.length ? (
                  column.quotes.map((quote) => (
                    <PipelineCard
                      key={quote.id}
                      quote={quote}
                      disabled={isPending}
                      pending={pendingQuoteId === quote.id}
                    />
                  ))
                ) : (
                  <div className="rounded-md border border-dashed border-border px-3 py-8 text-center text-sm text-muted-foreground">
                    No quotes in this category stage
                  </div>
                )}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}

function PipelineCard({
  quote,
  disabled,
  pending,
}: {
  quote: QuoteListItem;
  disabled: boolean;
  pending: boolean;
}) {
  return (
    <Link
      href={`/quotes/${quote.id}`}
      draggable={!disabled}
      onDragStart={(event) => {
        event.dataTransfer.setData("text/plain", quote.id);
        event.dataTransfer.effectAllowed = "move";
      }}
      className={`block rounded-md border border-border bg-card p-3 shadow-sm transition hover:border-input hover:bg-secondary/70 ${
        pending ? "opacity-60" : ""
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">{quote.quote_number}</p>
          <p className="mt-1 truncate text-xs text-muted-foreground">
            {quote.customer_name}
          </p>
        </div>
        <span className="soft-chip shrink-0 bg-secondary text-secondary-foreground ring-border">
          {formatStatus(quote.status)}
        </span>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <span className="soft-chip bg-card text-muted-foreground ring-border">
          {formatAccountType(quote.account_type)}
        </span>
        <span className="soft-chip bg-card text-muted-foreground ring-border">
          {formatProjectStatus(quote.project_status)}
        </span>
      </div>
      <div className="mt-3 flex items-center justify-between gap-3 text-xs">
        <span className="min-w-0 truncate text-muted-foreground">
          {quote.job_site_city || quote.job_site_name}
        </span>
        <span className="inline-flex shrink-0 items-center gap-1 font-semibold">
          <CircleDollarSign className="size-3.5 text-primary" />
          {formatCurrency(quote.total)}
        </span>
      </div>
      <p className="mt-2 truncate text-xs text-muted-foreground">
        {quote.requested_by_name} · {formatDate(quote.created_at)}
      </p>
    </Link>
  );
}

function formatStatus(status: string) {
  return status
    .split("_")
    .map((part) => part[0]?.toUpperCase() + part.slice(1))
    .join(" ");
}

function formatAccountType(value: QuoteAccountType) {
  return value
    .split("_")
    .map((part) => part[0]?.toUpperCase() + part.slice(1))
    .join(" ");
}

function formatProjectStatus(value: QuoteListItem["project_status"]) {
  return formatStatus(value);
}

function categoryView(
  accountType: QuoteAccountType,
  projectStatus: string,
  accountTypeLabel = formatAccountType(accountType),
  projectStatusLabel = formatProjectStatus(projectStatus),
): CategoryView {
  return {
    key: `${accountType}::${projectStatus}`,
    label: `${accountTypeLabel} + ${projectStatusLabel}`,
    accountType,
    projectStatus,
  };
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
  }).format(new Date(value));
}
