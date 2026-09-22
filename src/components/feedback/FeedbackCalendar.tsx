import { useMemo, useState } from "react";
import { ChevronRight, ChevronLeft } from "lucide-react";
import {
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  isSameMonth,
  startOfMonth,
  startOfWeek,
  subMonths,
} from "date-fns";
import { ar } from "date-fns/locale";
import type { Feedback } from "../../types";
import { IconButton } from "../ui/IconButton";
import { Card } from "../ui/Card";

const typeColor: Record<Feedback["type"], string> = {
  problem: "#FF6B6B",
  operational: "#F2B84B",
  idea: "#55C98B",
};

interface FeedbackCalendarProps {
  items: Feedback[];
  onSelectItem: (item: Feedback) => void;
}

export function FeedbackCalendar({ items, onSelectItem }: FeedbackCalendarProps) {
  const [cursor, setCursor] = useState(new Date());

  const days = useMemo(() => {
    const start = startOfWeek(startOfMonth(cursor), { weekStartsOn: 6 });
    const end = endOfWeek(endOfMonth(cursor), { weekStartsOn: 6 });
    return eachDayOfInterval({ start, end });
  }, [cursor]);

  const byDay = (day: Date) => items.filter((i) => isSameDay(new Date(i.date), day));

  const weekDays = ["س", "ح", "ن", "ث", "ر", "خ", "ج"];

  return (
    <Card className="p-4 md:p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold text-text">{format(cursor, "MMMM yyyy", { locale: ar })}</h3>
        <div className="flex items-center gap-1">
          <IconButton onClick={() => setCursor((c) => subMonths(c, 1))} aria-label="الشهر السابق">
            <ChevronRight size={16} />
          </IconButton>
          <IconButton onClick={() => setCursor(new Date())} aria-label="اليوم">
            <span className="text-xs font-medium">اليوم</span>
          </IconButton>
          <IconButton onClick={() => setCursor((c) => addMonths(c, 1))} aria-label="الشهر القادم">
            <ChevronLeft size={16} />
          </IconButton>
        </div>
      </div>
      <div className="grid grid-cols-7 gap-1 text-center text-xs text-muted mb-2">
        {weekDays.map((d) => (
          <div key={d}>{d}</div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {days.map((day) => {
          const dayItems = byDay(day);
          const inMonth = isSameMonth(day, cursor);
          const isToday = isSameDay(day, new Date());
          return (
            <div
              key={day.toISOString()}
              className={`min-h-[68px] rounded-control p-1.5 border ${
                isToday ? "border-primary-deep/40 bg-primary/5" : "border-border/60"
              } ${inMonth ? "" : "opacity-40"}`}
            >
              <span className="text-[11px] text-muted">{format(day, "d")}</span>
              <div className="flex flex-col gap-0.5 mt-1">
                {dayItems.slice(0, 3).map((item) => (
                  <button
                    key={item.id}
                    onClick={() => onSelectItem(item)}
                    className="flex items-center gap-1 text-[10px] truncate text-right hover:bg-border/50 rounded px-1 py-0.5"
                    title={item.title}
                  >
                    <span
                      className="h-1.5 w-1.5 rounded-full shrink-0"
                      style={{ backgroundColor: typeColor[item.type] }}
                    />
                    <span className="truncate">{item.title}</span>
                  </button>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}
