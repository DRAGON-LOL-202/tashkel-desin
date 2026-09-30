import { eachDayOfInterval, endOfMonth, endOfWeek, format, isSameDay, isWithinInterval, startOfMonth, startOfWeek } from "date-fns";
import { ar } from "date-fns/locale";
import type { Season } from "../../types";
import { YearEvent } from "./YearEvent";

interface YearMonthProps {
  month: Date;
  seasons: Season[];
  onSelectEvents: (seasons: Season[]) => void;
}

const weekDays = ["س", "ح", "ن", "ث", "ر", "خ", "ج"];

function seasonDates(season: Season) {
  return {
    start: new Date(`${season.startDate}T12:00:00`),
    end: new Date(`${season.endDate}T12:00:00`),
  };
}

function seasonsForDay(day: Date, seasons: Season[]) {
  return seasons.filter((season) => {
    const { start, end } = seasonDates(season);
    return isWithinInterval(day, { start, end }) || isSameDay(day, start) || isSameDay(day, end);
  });
}

export function YearMonth({ month, seasons, onSelectEvents }: YearMonthProps) {
  const days = eachDayOfInterval({
    start: startOfWeek(startOfMonth(month), { weekStartsOn: 6 }),
    end: endOfWeek(endOfMonth(month), { weekStartsOn: 6 }),
  });
  const monthIndex = format(month, "MM");

  return (
    <section className="rounded-card border border-border bg-surface/75 p-3 shadow-soft min-w-0">
      <div className="mb-3 flex items-center justify-between border-b border-border/70 pb-2">
        <h4 className="text-sm font-bold text-text">{format(month, "MMMM", { locale: ar })}</h4>
        <span className="text-xs font-semibold text-muted">{monthIndex}</span>
      </div>

      <div className="grid grid-cols-7 gap-1 text-center text-[11px] font-medium text-muted">
        {weekDays.map((day) => (
          <span key={day}>{day}</span>
        ))}
      </div>

      <div className="mt-1 grid grid-cols-7 gap-1">
        {days.map((day) => {
          const dayItems = seasonsForDay(day, seasons);
          const inCurrentMonth = day.getMonth() === month.getMonth();
          const isToday = isSameDay(day, new Date());

          return (
            <div
              key={day.toISOString()}
              className={`min-h-[62px] rounded-lg border p-1.5 transition ${
                isToday
                  ? "border-[#8B6FEF] bg-[#8B6FEF]/18 ring-1 ring-[#8B6FEF]"
                  : "border-border/60 bg-background/45"
              } ${inCurrentMonth ? "" : "opacity-35"}`}
            >
              <div className={`mb-1 text-[11px] font-semibold ${isToday ? "text-[#8B6FEF]" : "text-muted"}`}>
                {format(day, "d")}
              </div>

              <div className="flex flex-col gap-1">
                {dayItems.slice(0, 2).map((season) => (
                  <YearEvent key={`${season.id}-${day.toISOString()}`} season={season} onClick={() => onSelectEvents([season])} />
                ))}
                {dayItems.length > 2 && (
                  <button
                    type="button"
                    onClick={() => onSelectEvents(dayItems)}
                    className="h-5 rounded-md bg-primary/15 px-1.5 text-[10px] font-semibold text-primary-deep transition hover:bg-primary/25"
                  >
                    +{dayItems.length - 2} أحداث
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
