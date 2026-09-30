import { useMemo, useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "../ui/Button";
import { addDaysISO, formatArabicDate, todayISO } from "../../lib/date";

export type CalendarDateState = "completed" | "pending";

interface DateNavigatorProps {
  value: string;
  dateStates?: Record<string, CalendarDateState>;
  onChange: (value: string) => void;
}

const weekDays = ["س", "ح", "ن", "ث", "ر", "خ", "ج"];

function toLocalISO(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getMonthDays(monthDate: Date): Array<{ iso: string; day: number; inMonth: boolean }> {
  const year = monthDate.getFullYear();
  const month = monthDate.getMonth();
  const firstDay = new Date(year, month, 1);
  const saturdayBasedOffset = (firstDay.getDay() + 1) % 7;
  const start = new Date(firstDay);
  start.setDate(firstDay.getDate() - saturdayBasedOffset);

  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(start);
    date.setDate(start.getDate() + index);
    return {
      iso: toLocalISO(date),
      day: date.getDate(),
      inMonth: date.getMonth() === month,
    };
  });
}

function getDayClass({
  dateState,
  inMonth,
  isSelected,
  isToday,
}: {
  dateState?: CalendarDateState;
  inMonth: boolean;
  isSelected: boolean;
  isToday: boolean;
}): string {
  const stateClass =
    dateState === "pending"
      ? "bg-problem text-white font-bold"
    : dateState === "completed"
        ? "bg-primary-dark text-background font-bold"
        : "";

  const selectedRing = isSelected && !isToday ? "ring-2 ring-[#8B6FEF] ring-offset-1 ring-offset-surface" : "";

  if (isToday) return "bg-[#8B6FEF] text-white font-bold shadow-soft";
  if (stateClass) return `${stateClass} ${selectedRing}`;
  if (isSelected) return "bg-[#8B6FEF]/15 text-text font-bold ring-2 ring-[#8B6FEF]";
  return inMonth ? "text-text hover:bg-border/50" : "text-muted/40 hover:bg-border/30";
}

export function DateNavigator({ value, dateStates = {}, onChange }: DateNavigatorProps) {
  const [open, setOpen] = useState(false);
  const [viewDate, setViewDate] = useState(() => new Date(`${value}T12:00:00`));
  const currentDate = todayISO();
  const isTodaySelected = value === currentDate;
  const days = useMemo(() => getMonthDays(viewDate), [viewDate]);

  const moveMonth = (months: number) => {
    setViewDate((current) => {
      const next = new Date(current);
      next.setMonth(next.getMonth() + months);
      return next;
    });
  };

  const selectDate = (date: string) => {
    onChange(date);
    setViewDate(new Date(`${date}T12:00:00`));
    setOpen(false);
  };

  return (
    <div className="relative flex flex-col sm:flex-row sm:items-center gap-3 justify-between rounded-card border border-border bg-surface p-4 shadow-soft">
      <button
        onClick={() => setOpen((state) => !state)}
        className="flex items-center gap-3 rounded-control text-right transition-colors hover:bg-border/35 p-1 -m-1"
      >
        <div className="h-11 w-11 rounded-control bg-primary/20 text-primary-deep flex items-center justify-center">
          <CalendarDays size={20} />
        </div>
        <div>
          <p className="text-sm font-semibold text-text">{formatArabicDate(value, "EEEE")}</p>
          <p className="text-xs text-muted">{formatArabicDate(value, "d MMMM yyyy")}</p>
        </div>
      </button>

      <div className="flex items-center gap-2">
        <Button
          variant="secondary"
          size="sm"
          icon={<ChevronRight size={16} />}
          onClick={() => onChange(addDaysISO(value, -1))}
        >
          اليوم السابق
        </Button>
        <Button variant={isTodaySelected ? "primary" : "secondary"} size="sm" onClick={() => onChange(currentDate)}>
          اليوم
        </Button>
        <Button
          variant="secondary"
          size="sm"
          icon={<ChevronLeft size={16} />}
          onClick={() => onChange(addDaysISO(value, 1))}
        >
          اليوم التالي
        </Button>
      </div>

      {open && (
        <div className="absolute right-4 top-[calc(100%+10px)] z-30 w-[320px] rounded-card border border-border bg-surface p-4 shadow-pop">
          <div className="mb-3 flex items-center justify-between">
            <button
              onClick={() => moveMonth(1)}
              className="h-8 w-8 rounded-control text-muted hover:bg-border/50 hover:text-text flex items-center justify-center"
              aria-label="الشهر التالي"
            >
              <ChevronRight size={16} />
            </button>
            <p className="text-sm font-bold text-text">{formatArabicDate(viewDate.toISOString(), "MMMM yyyy")}</p>
            <button
              onClick={() => moveMonth(-1)}
              className="h-8 w-8 rounded-control text-muted hover:bg-border/50 hover:text-text flex items-center justify-center"
              aria-label="الشهر السابق"
            >
              <ChevronLeft size={16} />
            </button>
          </div>

          <div className="grid grid-cols-7 gap-1 text-center" dir="rtl">
            {weekDays.map((day) => (
              <div key={day} className="py-1 text-[11px] font-semibold text-muted">
                {day}
              </div>
            ))}
            {days.map((day) => (
              <button
                key={day.iso}
                onClick={() => selectDate(day.iso)}
                className={`h-9 rounded-control text-sm transition-colors ${getDayClass({
                  dateState: dateStates[day.iso],
                  inMonth: day.inMonth,
                  isSelected: day.iso === value,
                  isToday: day.iso === currentDate,
                })}`}
              >
                {day.day}
              </button>
            ))}
          </div>

          <div className="mt-3 flex flex-wrap gap-3 text-xs text-muted">
            <span className="flex items-center gap-1.5 text-problem">
              <span className="h-3 w-3 rounded bg-problem" />
              مهام غير منتهية
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-3 w-3 rounded bg-primary-dark" />
              مكتمل
            </span>
            <span className="flex items-center gap-1.5 text-muted">
              <span className="h-3 w-3 rounded bg-[#8B6FEF]" />
              اليوم الحالي
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
