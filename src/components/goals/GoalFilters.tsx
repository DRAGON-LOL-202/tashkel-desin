import { CalendarDays, ChevronLeft, ChevronRight, Search } from "lucide-react";
import { Tabs } from "../ui/Tabs";
import { Button } from "../ui/Button";
import { addDaysISO, formatArabicDate } from "../../lib/date";
import type { GoalStatus } from "../../types";

export type GoalFilterValue = "all" | GoalStatus;

interface GoalFiltersProps {
  filter: GoalFilterValue;
  onFilterChange: (value: GoalFilterValue) => void;
  search: string;
  onSearchChange: (value: string) => void;
  date: string;
  onDateChange: (value: string) => void;
}

const options = [
  { value: "all", label: "الكل" },
  { value: "not_started", label: "لم تبدأ" },
  { value: "in_progress", label: "قيد التنفيذ" },
  { value: "paused", label: "متوقفة" },
  { value: "completed", label: "مكتملة" },
];

export function GoalFilters({
  filter,
  onFilterChange,
  search,
  onSearchChange,
  date,
  onDateChange,
}: GoalFiltersProps) {
  return (
    <div className="flex flex-col xl:flex-row xl:items-center gap-3 justify-between">
      <div className="relative w-full sm:w-72">
        <Search size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted" />
        <input
          value={search}
          onChange={(event) => onSearchChange(event.target.value)}
          placeholder="ابحث عن هدف..."
          className="w-full rounded-control border border-border bg-surface pr-9 pl-3 py-2 text-sm placeholder:text-muted shadow-soft focus:outline-none focus:ring-2 focus:ring-primary/40"
        />
      </div>

      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        <Tabs options={options} value={filter} onChange={(value) => onFilterChange(value as GoalFilterValue)} />
        <div className="flex items-center gap-2">
          <Button variant="secondary" size="sm" aria-label="اليوم السابق" onClick={() => onDateChange(addDaysISO(date, -1))}>
            <ChevronRight size={16} />
          </Button>
          <div className="h-10 min-w-[190px] rounded-control border border-border bg-surface px-3 flex items-center justify-center gap-2 text-sm font-medium text-text shadow-soft">
            <CalendarDays size={16} className="text-muted" />
            {formatArabicDate(date, "EEEE، d MMMM yyyy")}
          </div>
          <Button variant="secondary" size="sm" aria-label="اليوم التالي" onClick={() => onDateChange(addDaysISO(date, 1))}>
            <ChevronLeft size={16} />
          </Button>
        </div>
      </div>
    </div>
  );
}
