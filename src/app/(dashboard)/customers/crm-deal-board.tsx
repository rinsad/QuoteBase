"use client";

import { useMemo, useState, useTransition } from "react";
import {
  BadgeCheck,
  CircleDollarSign,
  FileText,
  Flame,
  Trophy,
  XCircle,
} from "lucide-react";

import { moveCrmDealStage } from "@/app/(dashboard)/customers/actions";
import type { CrmDeal } from "@/lib/customers/crm";

type DealStage = CrmDeal["stage"];

type DealColumn = {
  key: DealStage;
  title: string;
  subtitle: string;
  icon: typeof FileText;
};

const DEAL_COLUMNS: DealColumn[] = [
  {
    key: "new",
    title: "New Lead",
    subtitle: "Fresh inbound",
    icon: Flame,
  },
  {
    key: "qualified",
    title: "Qualified",
    subtitle: "Real opportunity",
    icon: BadgeCheck,
  },
  {
    key: "quoted",
    title: "Quoted",
    subtitle: "Price in market",
    icon: FileText,
  },
  {
    key: "won",
    title: "Won",
    subtitle: "Closed revenue",
    icon: Trophy,
  },
  {
    key: "lost",
    title: "Lost",
    subtitle: "Closed loss",
    icon: XCircle,
  },
];

export function CrmDealBoard({ deals }: { deals: CrmDeal[] }) {
  const [pendingDealId, setPendingDealId] = useState<string | null>(null);
  const [dragOverColumn, setDragOverColumn] = useState<DealStage | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const columns = useMemo(
    () =>
      DEAL_COLUMNS.map((column) => {
        const columnDeals = deals.filter((deal) => deal.stage === column.key);

        return {
          ...column,
          deals: columnDeals,
          total: columnDeals.reduce((sum, deal) => sum + deal.value, 0),
        };
      }),
    [deals],
  );

  function handleDrop(toStage: DealStage, dealId: string): void {
    setDragOverColumn(null);
    setMessage(null);
    setPendingDealId(dealId);

    startTransition(async () => {
      const result = await moveCrmDealStage({ dealId, toStage });

      if (!result.ok) {
        setMessage(result.message);
      }

      setPendingDealId(null);
    });
  }

  return (
    <div>
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
                const dealId = event.dataTransfer.getData("text/plain");

                if (dealId) {
                  handleDrop(column.key, dealId);
                }
              }}
              className={`min-h-[430px] rounded-lg border bg-background p-3 transition ${
                isDragOver ? "border-primary ring-2 ring-primary/20" : "border-border"
              }`}
            >
              <div className="border-b border-border pb-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <div className="icon-well text-primary">
                      <Icon className="size-4" />
                    </div>
                    <div className="min-w-0">
                      <h3 className="truncate text-sm font-semibold">
                        {column.title}
                      </h3>
                      <p className="mt-1 truncate text-xs text-muted-foreground">
                        {column.subtitle}
                      </p>
                    </div>
                  </div>
                  <span className="rounded-full bg-secondary px-2 py-1 text-xs font-semibold text-secondary-foreground">
                    {column.deals.length}
                  </span>
                </div>
                <p className="mt-3 flex items-center gap-1.5 font-mono text-sm font-semibold">
                  <CircleDollarSign className="size-3.5 text-primary" />
                  {formatCurrency(column.total)}
                </p>
              </div>

              <div className="mt-3 space-y-3">
                {column.deals.length ? (
                  column.deals.map((deal) => (
                    <DealCard
                      key={deal.id}
                      deal={deal}
                      disabled={isPending}
                      pending={pendingDealId === deal.id}
                    />
                  ))
                ) : (
                  <div className="rounded-md border border-dashed border-border px-3 py-8 text-center text-sm text-muted-foreground">
                    Drop deals here
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

function DealCard({
  deal,
  disabled,
  pending,
}: {
  deal: CrmDeal;
  disabled: boolean;
  pending: boolean;
}) {
  return (
    <article
      draggable={!disabled}
      onDragStart={(event) => {
        event.dataTransfer.setData("text/plain", deal.id);
        event.dataTransfer.effectAllowed = "move";
      }}
      className={`cursor-grab rounded-md border border-border bg-card p-3 shadow-sm transition hover:border-input hover:bg-secondary/70 active:cursor-grabbing ${
        pending ? "opacity-60" : ""
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">{deal.title}</p>
          <p className="mt-1 truncate text-xs text-muted-foreground">
            {deal.company_name ?? "Company pending"}
          </p>
        </div>
        <span className="soft-chip shrink-0 bg-secondary text-secondary-foreground ring-border">
          {formatStage(deal.stage)}
        </span>
      </div>

      <div className="mt-3 flex items-center justify-between gap-3 text-xs">
        <span className="min-w-0 truncate text-muted-foreground">
          {deal.contact_name ?? deal.contact_email ?? "Contact pending"}
        </span>
        <span className="inline-flex shrink-0 items-center gap-1 font-semibold">
          <CircleDollarSign className="size-3.5 text-primary" />
          {formatCurrency(deal.value)}
        </span>
      </div>

      <div className="mt-2 flex items-center justify-between gap-3 text-xs text-muted-foreground">
        <span className="truncate">{formatSource(deal.source)}</span>
        <span className="shrink-0">
          {deal.expected_close_date
            ? formatDate(deal.expected_close_date)
            : "No close date"}
        </span>
      </div>
    </article>
  );
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
}

function formatStage(stage: string): string {
  return stage
    .split("_")
    .map((part) => part[0]?.toUpperCase() + part.slice(1))
    .join(" ");
}

function formatSource(source: string): string {
  return source === "csv_import"
    ? "CSV import"
    : source === "web_form"
      ? "Web form"
      : "Manual";
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
  }).format(new Date(value));
}
