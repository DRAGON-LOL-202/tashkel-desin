import { useEffect, useMemo, useState } from "react";
import { Download, RefreshCw, Timer } from "lucide-react";
import { Button } from "../ui/Button";
import { Card } from "../ui/Card";
import { FieldWrap, Input, Select } from "../ui/Field";
import { IconButton } from "../ui/IconButton";
import { ErrorState, LoadingState } from "../ui/StatusViews";
import { tasksService } from "../../services/tasksService";
import { errorMessage } from "../../lib/api";
import { todayISO } from "../../lib/date";
import { downloadTimeStats } from "../../lib/exportTimeStats";
import { MAX_STATS_DAYS, buildTimeMatrix, cellKey, countDays, formatHoursMinutes, rangeLastMonths } from "../../lib/timeStats";
import type { DailyTimeStat, TeamMember } from "../../types";

type Preset = "3" | "6" | "12" | "custom";

/** وقت العمل في كل يوم لكل موظف على فترة طويلة (3 أشهر / 6 / سنة / فترة مخصصة). يُجمَّع على الخادم عند الطلب. */
export function LongTermTimePanel({ members }: { members: Pick<TeamMember, "id" | "name">[] }) {
  const [preset, setPreset] = useState<Preset>("6");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [rows, setRows] = useState<DailyTimeStat[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const { from, to } = useMemo(
    () => (preset === "custom" ? { from: customFrom, to: customTo } : rangeLastMonths(Number(preset), todayISO())),
    [preset, customFrom, customTo]
  );

  const rangeError = useMemo(() => {
    if (!from || !to) return "اختر تاريخ البداية والنهاية";
    if (to < from) return "تاريخ النهاية قبل تاريخ البداية";
    if (countDays(from, to) > MAX_STATS_DAYS) return `الفترة لا يمكن أن تتجاوز ${MAX_STATS_DAYS} يوماً`;
    return null;
  }, [from, to]);

  useEffect(() => {
    if (rangeError) return undefined;
    let cancelled = false;
    setLoading(true);
    setError(null);
    tasksService
      .dailyTime(from, to)
      .then((result) => {
        if (!cancelled) setRows(result);
      })
      .catch((err) => {
        if (!cancelled) setError(errorMessage(err));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [from, to, rangeError, reloadKey]);

  const matrix = useMemo(() => buildTimeMatrix(rows, members, from, to), [rows, members, from, to]);
  // الأحدث أولاً في الجدول (ملف Excel يبقى مرتباً زمنياً)
  const daysNewestFirst = useMemo(() => [...matrix.days].reverse(), [matrix.days]);

  return (
    <Card className="p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="flex items-center gap-2 text-sm font-semibold text-text sm:mb-4">
          <Timer size={18} className="text-primary-deep" />
          وقت العمل اليومي — فترات طويلة
        </div>
        <div className="grid flex-1 grid-cols-1 gap-3 sm:grid-cols-3">
          <FieldWrap label="الفترة">
            <Select value={preset} onChange={(event) => setPreset(event.target.value as Preset)}>
              <option value="3">آخر 3 أشهر</option>
              <option value="6">آخر 6 أشهر</option>
              <option value="12">آخر سنة</option>
              <option value="custom">فترة مخصصة</option>
            </Select>
          </FieldWrap>
          {preset === "custom" && (
            <>
              <FieldWrap label="من تاريخ">
                <Input type="date" value={customFrom} max={customTo || undefined} onChange={(event) => setCustomFrom(event.target.value)} />
              </FieldWrap>
              <FieldWrap label="إلى تاريخ">
                <Input type="date" value={customTo} min={customFrom || undefined} onChange={(event) => setCustomTo(event.target.value)} />
              </FieldWrap>
            </>
          )}
        </div>
        <div className="flex items-center gap-2 sm:mb-4">
          <IconButton onClick={() => setReloadKey((value) => value + 1)} aria-label="تحديث" title="تحديث" className="h-10 w-10">
            <RefreshCw size={16} />
          </IconButton>
          <Button variant="secondary" size="sm" icon={<Download size={16} />} disabled={loading || !!error || !!rangeError || matrix.days.length === 0} onClick={() => downloadTimeStats(matrix)}>
            تصدير Excel
          </Button>
        </div>
      </div>

      {rangeError ? (
        <p className="py-6 text-center text-sm text-muted">{rangeError}</p>
      ) : loading ? (
        <LoadingState label="جارٍ حساب وقت العمل..." />
      ) : error ? (
        <ErrorState message={error} onRetry={() => setReloadKey((value) => value + 1)} />
      ) : matrix.days.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted">لا يوجد وقت عمل مسجّل في هذه الفترة</p>
      ) : (
        <div className="max-h-[32rem] overflow-auto rounded-control border border-border">
          <table className="w-full min-w-max border-collapse text-sm">
            <thead className="sticky top-0 z-10 bg-surface">
              <tr className="border-b border-border text-xs text-muted">
                <th className="px-3 py-2 text-right font-semibold">التاريخ</th>
                {members.map((member) => (
                  <th key={member.id} className="px-3 py-2 text-right font-semibold">{member.name}</th>
                ))}
                <th className="px-3 py-2 text-right font-semibold">الإجمالي</th>
              </tr>
              <tr className="border-b border-border bg-background/60 font-bold text-text">
                <td className="px-3 py-2">الإجمالي ({matrix.days.length} يوم)</td>
                {members.map((member) => (
                  <td key={member.id} className="px-3 py-2 font-mono">
                    {formatHoursMinutes(matrix.memberTotals[member.id])}
                    <span className="mr-1 text-[11px] font-normal text-muted">({matrix.memberDays[member.id]} يوم)</span>
                  </td>
                ))}
                <td className="px-3 py-2 font-mono">{formatHoursMinutes(matrix.grandTotal)}</td>
              </tr>
            </thead>
            <tbody>
              {daysNewestFirst.map((day) => (
                <tr key={day} className="border-b border-border/60 last:border-0 hover:bg-primary/5">
                  <td className="px-3 py-1.5 font-mono text-text">{day}</td>
                  {members.map((member) => {
                    const ms = matrix.cells[cellKey(day, member.id)];
                    return (
                      <td key={member.id} className="px-3 py-1.5 font-mono text-text">
                        {ms ? formatHoursMinutes(ms) : <span className="text-muted/50">—</span>}
                      </td>
                    );
                  })}
                  <td className="px-3 py-1.5 font-mono font-semibold text-text">{formatHoursMinutes(matrix.dayTotals[day] ?? 0)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="mt-3 text-xs text-muted">
        يُنسب الوقت ليوم المهمة وللمسؤول عنها، وتدخل المهام الفرعية. الأيام التي لا وقت فيها لا تظهر. الصيغة: ساعات:دقائق.
      </p>
    </Card>
  );
}
