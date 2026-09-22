import { useMemo, useState } from "react";
import { addMonths, differenceInCalendarDays, format, startOfMonth, startOfYear } from "date-fns";
import { ar } from "date-fns/locale";
import { Pencil, Trash2 } from "lucide-react";
import type { Season } from "../../types";
import { Card } from "../ui/Card";

interface ScheduleTimelineProps {
  seasons: Season[];
  onEdit: (season: Season) => void;
  onDelete: (id: string) => void;
}

const monthGridBackground = {
  backgroundImage:
    "repeating-linear-gradient(to left, transparent 0, transparent calc(8.333333% - 2px), rgba(127, 255, 212, 0.72) calc(8.333333% - 2px), rgba(127, 255, 212, 0.72) 8.333333%)",
};

export function ScheduleTimeline({ seasons, onEdit, onDelete }: ScheduleTimelineProps) {
  const [yearOffset, setYearOffset] = useState(0);
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  const rangeStart = useMemo(() => {
    const base = seasons.length
      ? new Date(Math.min(...seasons.map((season) => new Date(`${season.startDate}T12:00:00`).getTime())))
      : new Date();
    return startOfYear(startOfMonth(base));
  }, [seasons]);

  const timelineStart = addMonths(rangeStart, yearOffset * 12);
  const months = useMemo(
    () => Array.from({ length: 12 }, (_, index) => addMonths(timelineStart, index)),
    [timelineStart]
  );
  const timelineEnd = addMonths(timelineStart, 12);
  const totalDays = differenceInCalendarDays(timelineEnd, timelineStart) || 365;

  return (
    <Card className="p-4 md:p-5 overflow-x-auto">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold text-text">الخط الزمني للمواسم</h3>
        <div className="flex items-center gap-2 text-xs">
          <button
            onClick={() => setYearOffset((offset) => offset - 1)}
            className="px-2 py-1 rounded-control hover:bg-border/50 text-muted"
          >
            السابق
          </button>
          <span className="font-medium text-text">{format(timelineStart, "yyyy")}</span>
          <button
            onClick={() => setYearOffset((offset) => offset + 1)}
            className="px-2 py-1 rounded-control hover:bg-border/50 text-muted"
          >
            التالي
          </button>
        </div>
      </div>

      <div
        className="relative min-w-[720px] rounded-control border border-border/70 bg-surface/40 overflow-hidden"
        style={monthGridBackground}
      >
        <div className="relative z-10 grid grid-cols-12 border-b border-border/70">
          {months.map((month) => (
            <div key={month.toISOString()} className="py-2 text-center text-[11px] font-medium text-muted">
              {format(month, "MMM", { locale: ar })}
            </div>
          ))}
        </div>

        <div className="relative z-10 flex flex-col gap-3 p-3">
          {seasons.length === 0 && <p className="text-sm text-muted text-center py-6">لا توجد مواسم مضافة.</p>}
          {seasons.map((season) => {
            const start = new Date(`${season.startDate}T12:00:00`);
            const end = new Date(`${season.endDate}T12:00:00`);
            const offsetDays = differenceInCalendarDays(start, timelineStart);
            const durationDays = Math.max(differenceInCalendarDays(end, start) + 1, 1);
            const left = Math.max((offsetDays / totalDays) * 100, 0);
            const width = Math.min((durationDays / totalDays) * 100, 100 - left);

            if (offsetDays + durationDays < 0 || offsetDays > totalDays) return null;

            return (
              <div key={season.id} className="relative h-11">
                <div
                  className="absolute top-1 bottom-1 z-10 rounded-control flex items-center px-2.5 gap-2 text-white text-xs font-medium cursor-pointer transition-shadow shadow-sm hover:shadow-md"
                  style={{
                    right: `${left}%`,
                    width: `${Math.max(width, 4)}%`,
                    backgroundColor: season.color,
                  }}
                  onMouseEnter={() => setHoveredId(season.id)}
                  onMouseLeave={() => setHoveredId(null)}
                  onClick={() => onEdit(season)}
                >
                  <span className="truncate">{season.title}</span>
                  {hoveredId === season.id && (
                    <span className="flex items-center gap-1 ms-auto shrink-0">
                      <button
                        onClick={(event) => {
                          event.stopPropagation();
                          onEdit(season);
                        }}
                        className="hover:bg-white/25 rounded p-0.5"
                        aria-label="تعديل"
                      >
                        <Pencil size={12} />
                      </button>
                      <button
                        onClick={(event) => {
                          event.stopPropagation();
                          onDelete(season.id);
                        }}
                        className="hover:bg-white/25 rounded p-0.5"
                        aria-label="حذف"
                      >
                        <Trash2 size={12} />
                      </button>
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </Card>
  );
}
