"use client";

import { useEffect, useId, useRef, useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";

type DatePickerProps = {
  name: string;
  value?: string;
  defaultValue?: string;
  onChange?: (value: string) => void;
  className?: string;
  required?: boolean;
  disabled?: boolean;
  "aria-invalid"?: boolean;
  "aria-label"?: string;
};

const WEEKDAYS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

export function DatePicker({
  name,
  value,
  defaultValue = "",
  onChange,
  className = "",
  required,
  disabled,
  "aria-invalid": ariaInvalid,
  "aria-label": ariaLabel,
}: DatePickerProps) {
  const id = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const controlled = value !== undefined;
  const [internalValue, setInternalValue] = useState(defaultValue);
  const selectedValue = controlled ? value : internalValue;
  const selectedDate = parseDate(selectedValue);
  const [visibleMonth, setVisibleMonth] = useState(() => startOfMonth(selectedDate ?? new Date()));
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const nextSelectedDate = parseDate(selectedValue);
    if (nextSelectedDate) setVisibleMonth(startOfMonth(nextSelectedDate));
  }, [selectedValue]);

  useEffect(() => {
    function closeOnOutsideClick(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", closeOnOutsideClick);
    return () => document.removeEventListener("mousedown", closeOnOutsideClick);
  }, []);

  function selectDate(date: Date) {
    const nextValue = toDateValue(date);
    if (!controlled) setInternalValue(nextValue);
    onChange?.(nextValue);
    setOpen(false);
  }

  const days = calendarDays(visibleMonth);

  return (
    <div ref={rootRef} className="relative">
      <input name={name} type="hidden" value={selectedValue} required={required} readOnly />
      <button
        id={id}
        type="button"
        className={`${className} flex items-center justify-between text-left`}
        aria-label={ariaLabel}
        aria-haspopup="dialog"
        aria-expanded={open}
        data-invalid={ariaInvalid || undefined}
        disabled={disabled}
        onClick={() => setOpen((current) => !current)}
      >
        <span className={selectedValue ? "" : "text-muted-foreground"}>
          {selectedDate ? formatDisplayDate(selectedDate) : "mm/dd/yyyy"}
        </span>
        <CalendarDays className="size-4 shrink-0" />
      </button>
      {open ? (
        <div role="dialog" aria-label="Choose date" className="absolute left-0 z-50 mt-2 w-[19rem] rounded-xl border border-border bg-popover p-3 text-popover-foreground shadow-xl">
          <div className="mb-3 flex items-center justify-between">
            <button type="button" className="grid size-9 place-items-center rounded-md hover:bg-secondary" aria-label="Previous month" onClick={() => setVisibleMonth(addMonths(visibleMonth, -1))}>
              <ChevronLeft className="size-5" />
            </button>
            <strong className="text-sm">{visibleMonth.toLocaleDateString("en-US", { month: "long", year: "numeric" })}</strong>
            <button type="button" className="grid size-9 place-items-center rounded-md hover:bg-secondary" aria-label="Next month" onClick={() => setVisibleMonth(addMonths(visibleMonth, 1))}>
              <ChevronRight className="size-5" />
            </button>
          </div>
          <div className="grid grid-cols-7 text-center text-xs font-medium text-muted-foreground">
            {WEEKDAYS.map((day) => <span key={day} className="py-1">{day}</span>)}
          </div>
          <div className="grid grid-cols-7 gap-0.5">
            {days.map((date) => {
              const dateValue = toDateValue(date);
              const selected = dateValue === selectedValue;
              const currentMonth = date.getMonth() === visibleMonth.getMonth();
              return <button key={dateValue} type="button" onClick={() => selectDate(date)} className={`grid size-10 place-items-center rounded-md text-sm transition hover:bg-secondary ${selected ? "bg-primary font-semibold text-primary-foreground hover:bg-primary" : ""} ${currentMonth ? "" : "text-muted-foreground/50"}`} aria-pressed={selected}>{date.getDate()}</button>;
            })}
          </div>
          <div className="mt-2 flex justify-between border-t border-border pt-2">
            <button type="button" className="px-2 py-1 text-sm text-primary hover:underline" onClick={() => { if (!controlled) setInternalValue(""); onChange?.(""); setOpen(false); }}>Clear</button>
            <button type="button" className="px-2 py-1 text-sm text-primary hover:underline" onClick={() => selectDate(new Date())}>Today</button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function parseDate(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return Number.isNaN(date.getTime()) ? null : date;
}

function toDateValue(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function formatDisplayDate(date: Date): string {
  return new Intl.DateTimeFormat("en-US", { month: "2-digit", day: "2-digit", year: "numeric" }).format(date);
}

function startOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function addMonths(date: Date, amount: number): Date {
  return new Date(date.getFullYear(), date.getMonth() + amount, 1);
}

function calendarDays(month: Date): Date[] {
  const first = new Date(month.getFullYear(), month.getMonth(), 1);
  const start = new Date(first.getFullYear(), first.getMonth(), 1 - first.getDay());
  return Array.from({ length: 42 }, (_, index) => new Date(start.getFullYear(), start.getMonth(), start.getDate() + index));
}
