import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import {
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  isSameMonth,
  isWithinInterval,
  setMonth,
  setYear,
  startOfMonth,
  startOfWeek,
  subMonths,
} from "date-fns";
import { ar } from "date-fns/locale";
import type { Season } from "../../types";
import { Card } from "../ui/Card";
import { IconButton } from "../ui/IconButton";

interface ScheduleCalendarProps {
  seasons: Season[];
}

const weekDays = ["س", "ح", "ن", "ث", "ر", "خ", "ج"];
const monthOptions = Array.from({ length: 12 }, (_, index) => ({
  value: index,
  label: format(new Date(2026, index, 1), "MMMM", { locale: ar }),
}));

const optionStyle = {
  backgroundColor: "var(--surface)",
  color: "var(--text)",
};

export function ScheduleCalendar({ seasons }: ScheduleCalendarProps) {
  const [cursor, setCursor] = useState(new Date());

  const days = useMemo(() => {
    const start = startOfWeek(startOfMonth(cursor), { weekStartsOn: 6 });
    const end = endOfWeek(endOfMonth(cursor), { weekStartsOn: 6 });
    return eachDayOfInterval({ start, end });
  }, [cursor]);

  const years = useMemo(() => {
    const currentYear = new Date().getFullYear();
    const seasonYears = seasons.flatMap((season) => [
      new Date(`${season.startDate}T12:00:00`).getFullYear(),
      new Date(`${season.endDate}T12:00:00`).getFullYear(),
    ]);
    const min = Math.min(currentYear - 2, ...seasonYears);
    const max = Math.max(currentYear + 2, ...seasonYears);
    return Array.from({ length: max - min + 1 }, (_, index) => min + index);
  }, [seasons]);

  const seasonsForDay = (day: Date) =>
    seasons.filter((season) => {
      const start = new Date(`${season.startDate}T12:00:00`);
      const end = new Date(`${season.endDate}T12:00:00`);
      return isWithinInterval(day, { start, end }) || isSameDay(day, start) || isSameDay(day, end);
    });

  return (
    <Card className="p-4 md:p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-4">
        <h3 className="font-semibold text-text">{format(cursor, "MMMM yyyy", { locale: ar })}</h3>
        <div className="flex flex-wrap items-center gap-2">
          <IconButton onClick={() => setCursor((date) => subMonths(date, 1))} aria-label="الشهر السابق">
            <ChevronRight size={16} />
          </IconButton>
          <button
            onClick={() => setCursor(new Date())}
            className="h-9 rounded-control border border-border bg-surface px-3 text-xs font-medium text-muted hover:bg-border/50 hover:text-text transition-colors"
          >
            اليوم
          </button>
          <IconButton onClick={() => setCursor((date) => addMonths(date, 1))} aria-label="الشهر القادم">
            <ChevronLeft size={16} />
          </IconButton>

          <div className="h-9 rounded-control border border-border bg-surface px-2 flex items-center gap-2">
            <select
              value={cursor.getMonth()}
              onChange={(event) => setCursor((date) => setMonth(date, Number(event.target.value)))}
              className="rounded-control bg-surface text-sm font-medium text-text focus:outline-none"
              aria-label="اختيار الشهر"
            >
              {monthOptions.map((month) => (
                <option key={month.value} value={month.value} style={optionStyle}>
                  {month.label}
                </option>
              ))}
            </select>
            <select
              value={cursor.getFullYear()}
              onChange={(event) => setCursor((date) => setYear(date, Number(event.target.value)))}
              className="rounded-control bg-surface text-sm font-medium text-text focus:outline-none"
              aria-label="اختيار السنة"
            >
              {years.map((year) => (
                <option key={year} value={year} style={optionStyle}>
                  {year}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-7 gap-1 text-center text-xs text-muted mb-2">
        {weekDays.map((day) => (
          <div key={day}>{day}</div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {days.map((day) => {
          const dayItems = seasonsForDay(day);
          const inMonth = isSameMonth(day, cursor);
          const isToday = isSameDay(day, new Date());
          return (
            <div
              key={day.toISOString()}
              className={`min-h-[64px] rounded-control p-1.5 border ${
                isToday ? "border-[#8B6FEF] bg-[#8B6FEF] text-white shadow-soft" : "border-border/60"
              } ${inMonth ? "" : "opacity-40"}`}
            >
              <span className={`text-[11px] ${isToday ? "font-bold text-white" : "text-muted"}`}>
                {format(day, "d")}
              </span>
              <div className="flex flex-col gap-0.5 mt-1">
                {dayItems.slice(0, 2).map((season) => (
                  <span
                    key={season.id}
                    className="text-[10px] truncate rounded px-1 py-0.5 text-white font-medium"
                    style={{ backgroundColor: season.color }}
                    title={season.title}
                  >
                    {season.title}
                  </span>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}
