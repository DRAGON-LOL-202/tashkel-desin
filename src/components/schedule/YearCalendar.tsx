import { useMemo, useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import type { Season } from "../../types";
import { Card } from "../ui/Card";
import { IconButton } from "../ui/IconButton";
import { YearMonth } from "./YearMonth";

interface YearCalendarProps {
  seasons: Season[];
  onSelectEvents: (seasons: Season[]) => void;
}

export function YearCalendar({ seasons, onSelectEvents }: YearCalendarProps) {
  const currentYear = new Date().getFullYear();
  const [year, setYear] = useState(currentYear);

  const months = useMemo(() => Array.from({ length: 12 }, (_, index) => new Date(year, index, 1)), [year]);

  const yearSeasons = useMemo(
    () =>
      seasons.filter((season) => {
        const startYear = new Date(`${season.startDate}T12:00:00`).getFullYear();
        const endYear = new Date(`${season.endDate}T12:00:00`).getFullYear();
        return startYear <= year && endYear >= year;
      }),
    [seasons, year]
  );

  return (
    <Card className="p-4 md:p-5">
      <div className="mb-5 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <CalendarDays size={20} className="text-primary-deep" />
            <h3 className="text-lg font-bold text-text">التقويم السنوي</h3>
          </div>
          <p className="mt-1 text-sm text-muted">نظرة واحدة على كل المواسم والفعاليات خلال السنة.</p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2 rounded-control border border-border bg-surface p-1">
            <IconButton onClick={() => setYear((value) => value - 1)} aria-label="السنة السابقة">
              <ChevronRight size={16} />
            </IconButton>
            <button
              type="button"
              onClick={() => setYear(currentYear)}
              className="h-9 rounded-control border border-border/80 px-3 text-xs font-semibold text-muted transition hover:bg-border/40 hover:text-text"
            >
              اليوم
            </button>
            <span className="min-w-16 text-center text-lg font-bold text-text">{year}</span>
            <IconButton onClick={() => setYear((value) => value + 1)} aria-label="السنة التالية">
              <ChevronLeft size={16} />
            </IconButton>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 2xl:grid-cols-4">
        {months.map((month) => (
          <YearMonth key={month.toISOString()} month={month} seasons={yearSeasons} onSelectEvents={onSelectEvents} />
        ))}
      </div>
    </Card>
  );
}
