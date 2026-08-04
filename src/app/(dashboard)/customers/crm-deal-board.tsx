"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  BadgeCheck,
  CircleDollarSign,
  FileText,
  Flame,
  Pencil,
  Save,
  Trophy,
  X,
  XCircle,
} from "lucide-react";

import {
  updateCrmDealDetails,
  type CrmEditFormState,
} from "@/app/(dashboard)/customers/actions";
import { Button } from "@/components/ui/button";
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
  const [selectedDeal, setSelectedDeal] = useState<CrmDeal | null>(null);
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

  return (
    <div>
      <div className="grid gap-4 xl:grid-cols-5">
        {columns.map((column) => {
          const Icon = column.icon;

          return (
            <section
              key={column.key}
              className="min-h-[430px] rounded-lg border border-border bg-background p-3"
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
                      onEdit={() => setSelectedDeal(deal)}
                    />
                  ))
                ) : (
                  <div className="rounded-md border border-dashed border-border px-3 py-8 text-center text-sm text-muted-foreground">
                    No deals in this stage
                  </div>
                )}
              </div>
            </section>
          );
        })}
      </div>
      <CrmDealEditPanel
        deal={selectedDeal}
        onClose={() => setSelectedDeal(null)}
      />
    </div>
  );
}

function DealCard({
  deal,
  onEdit,
}: {
  deal: CrmDeal;
  onEdit: () => void;
}) {
  return (
    <article
      role="button"
      tabIndex={0}
      onClick={onEdit}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onEdit();
        }
      }}
      className="cursor-pointer rounded-md border border-border bg-card p-3 shadow-sm transition hover:border-input hover:bg-secondary/70"
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

      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          onEdit();
        }}
        className="mt-3 inline-flex h-8 items-center gap-1.5 rounded-md border border-border px-2.5 text-xs font-semibold text-muted-foreground transition hover:border-input hover:text-foreground"
      >
        <Pencil className="size-3.5" />
        Edit
      </button>
    </article>
  );
}

function CrmDealEditPanel({
  deal,
  onClose,
}: {
  deal: CrmDeal | null;
  onClose: () => void;
}) {
  const router = useRouter();
  const [state, formAction, isPending] = useActionState(
    updateCrmDealDetails,
    initialCrmEditState,
  );

  useEffect(() => {
    if (state.status === "success") {
      router.refresh();
      onClose();
    }
  }, [onClose, router, state.status]);

  if (!deal) {
    return null;
  }

  return (
    <aside className="customer-slide-over" aria-label="Edit CRM deal">
      <button
        type="button"
        className="customer-slide-backdrop"
        aria-label="Close CRM deal editor"
        onClick={onClose}
      />
      <div className="customer-slide-panel">
        <div className="slide-panel-header">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-medium text-muted-foreground">
                CRM deal
              </p>
              <h2 className="mt-1 truncate text-2xl font-semibold">
                {deal.title}
              </h2>
              <p className="mt-1 truncate text-sm text-muted-foreground">
                {deal.company_name ?? "Company pending"}
              </p>
            </div>
            <button
              type="button"
              className="mac-link size-9 shrink-0 px-0"
              aria-label="Close CRM deal editor"
              onClick={onClose}
            >
              <X className="size-4" />
            </button>
          </div>
        </div>

        <form action={formAction} className="grid gap-5 p-4" noValidate>
          <input type="hidden" name="deal_id" value={deal.id} />
          <Fieldset title="Company">
            <CrmField
              label="Company name"
              name="company_name"
              defaultValue={deal.company_name ?? ""}
              error={state.fieldErrors.company_name}
              required
            />
            <CrmField
              label="Domain"
              name="company_domain"
              defaultValue={deal.company_domain ?? ""}
            />
            <CrmField
              label="Company email"
              name="company_email"
              type="email"
              defaultValue={deal.company_email ?? ""}
              error={state.fieldErrors.company_email}
            />
            <CrmField
              label="Company phone"
              name="company_phone"
              defaultValue={deal.company_phone ?? ""}
            />
          </Fieldset>

          <Fieldset title="Contact">
            <CrmField
              label="Contact name"
              name="contact_name"
              defaultValue={deal.contact_name ?? ""}
            />
            <CrmField
              label="Title"
              name="contact_title"
              defaultValue={deal.contact_title ?? ""}
            />
            <CrmField
              label="Contact email"
              name="contact_email"
              type="email"
              defaultValue={deal.contact_email ?? ""}
              error={state.fieldErrors.contact_email}
            />
            <CrmField
              label="Contact phone"
              name="contact_phone"
              defaultValue={deal.contact_phone ?? ""}
            />
          </Fieldset>

          <Fieldset title="Deal">
            <CrmField
              label="Deal title"
              name="deal_title"
              defaultValue={deal.title}
              error={state.fieldErrors.deal_title}
              required
            />
            <ReadOnlyCrmField label="Stage" value={formatStage(deal.stage)} />
            <CrmField
              label="Deal value"
              name="value"
              type="number"
              defaultValue={String(deal.value)}
              error={state.fieldErrors.value}
            />
            <CrmField
              label="Expected close"
              name="expected_close_date"
              type="date"
              defaultValue={deal.expected_close_date ?? ""}
            />
            <label className="flex items-center gap-3 rounded-md border border-border bg-background px-4 py-3">
              <input
                name="is_active"
                type="checkbox"
                defaultChecked={deal.is_active}
                className="size-4 accent-[#3d6652]"
              />
              <span>
                <span className="block text-sm font-semibold">Active deal</span>
                <span className="block text-xs text-muted-foreground">
                  Inactive deals stay in history but leave the active board.
                </span>
              </span>
            </label>
          </Fieldset>

          {state.message ? (
            <p
              className={`rounded-md border px-3 py-2 text-sm font-medium ${
                state.status === "error"
                  ? "border-destructive/30 bg-destructive/10 text-destructive"
                  : "border-emerald-200 bg-emerald-50 text-emerald-800"
              }`}
            >
              {state.message}
            </p>
          ) : null}

          <Button type="submit" disabled={isPending} className="h-11 rounded-md">
            <Save className="size-4" />
            {isPending ? "Saving..." : "Save CRM deal"}
          </Button>
        </form>
      </div>
    </aside>
  );
}

const initialCrmEditState: CrmEditFormState = {
  message: "",
  status: "idle",
  fieldErrors: {},
};

function Fieldset({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <h3 className="mb-3 text-xs font-semibold uppercase text-muted-foreground">
        {title}
      </h3>
      <div className="grid gap-4 sm:grid-cols-2">{children}</div>
    </section>
  );
}

function CrmField({
  label,
  name,
  type = "text",
  defaultValue,
  error,
  required = false,
}: {
  label: string;
  name: string;
  type?: "date" | "email" | "number" | "text";
  defaultValue: string;
  error?: string;
  required?: boolean;
}) {
  return (
    <label className="block">
      <span className="text-sm font-medium text-muted-foreground">
        {label}
      </span>
      <input
        name={name}
        type={type}
        defaultValue={defaultValue}
        required={required}
        step={type === "number" ? "0.01" : undefined}
        className="soft-control mt-2 w-full"
        aria-invalid={Boolean(error)}
      />
      {error ? (
        <span className="mt-1 block text-xs font-medium text-destructive">
          {error}
        </span>
      ) : null}
    </label>
  );
}

function ReadOnlyCrmField({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div>
      <span className="text-sm font-medium text-muted-foreground">{label}</span>
      <div className="mt-2 rounded-md border border-border bg-secondary/50 px-4 py-3 text-sm font-semibold text-foreground">
        {value}
      </div>
      <p className="mt-1 text-xs leading-5 text-muted-foreground">
        Stage changes come from quote/customer lifecycle events.
      </p>
    </div>
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
