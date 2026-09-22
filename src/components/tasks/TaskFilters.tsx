import { CalendarPlus, Search } from "lucide-react";
import { Tabs } from "../ui/Tabs";

export type TaskFilterValue = "all" | "not_started" | "running" | "paused" | "completed";

interface TaskFiltersProps {
  value: TaskFilterValue;
  onChange: (value: TaskFilterValue) => void;
  search: string;
  onSearchChange: (value: string) => void;
  onMoveUnfinishedToNextDay?: () => void;
  moveDisabled?: boolean;
}

const options = [
  { value: "all", label: "الكل" },
  { value: "not_started", label: "لم تبدأ" },
  { value: "running", label: "قيد التنفيذ" },
  { value: "paused", label: "متوقفة" },
  { value: "completed", label: "مكتملة" },
];

export function TaskFilters({
  value,
  onChange,
  search,
  onSearchChange,
  onMoveUnfinishedToNextDay,
  moveDisabled = false,
}: TaskFiltersProps) {
  return (
    <div className="flex flex-col xl:flex-row xl:items-center gap-3 justify-between">
      <div className="flex flex-wrap items-center gap-2">
        <Tabs options={options} value={value} onChange={(next) => onChange(next as TaskFilterValue)} />
        {onMoveUnfinishedToNextDay && (
          <button
            type="button"
            onClick={onMoveUnfinishedToNextDay}
            disabled={moveDisabled}
            className="inline-flex items-center justify-center gap-2 rounded-control border border-primary/30 bg-primary/15 px-4 py-2 text-sm font-semibold text-primary-deep transition hover:bg-primary/25 disabled:cursor-not-allowed disabled:border-border disabled:bg-muted/10 disabled:text-muted"
          >
            <CalendarPlus size={16} />
            <span>نقل إلى اليوم التالي</span>
          </button>
        )}
      </div>
      <div className="relative w-full sm:w-72">
        <Search size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted" />
        <input
          value={search}
          onChange={(event) => onSearchChange(event.target.value)}
          placeholder="ابحث عن مهمة..."
          className="w-full rounded-control border border-border bg-surface pr-9 pl-3 py-2 text-sm placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-primary/40"
        />
      </div>
    </div>
  );
}
