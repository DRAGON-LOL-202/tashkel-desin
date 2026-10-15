import { useCallback, useEffect, useMemo, useState } from "react";
import { CalendarCheck, Download, RefreshCw } from "lucide-react";
import { Button } from "../ui/Button";
import { Card } from "../ui/Card";
import { IconButton } from "../ui/IconButton";
import { ErrorState, LoadingState } from "../ui/StatusViews";
import { attendanceService } from "../../services/attendanceService";
import { useResource } from "../../hooks/useResource";
import { formatArabicDate, formatArabicTime } from "../../lib/date";
import { buildAttendanceMatrix, cellKey } from "../../lib/attendance";
import { downloadAttendance } from "../../lib/exportAttendance";
import { formatHoursMinutes } from "../../lib/timeStats";
import type { AttendanceMonth, TeamMember } from "../../types";

const EMPTY: AttendanceMonth = { month: "", today: "", sessions: [] };

/** جدول الحضور والانصراف لشهر كامل: كل الأيام × كل المستخدمين (أوقات الحضور والانصراف + إجمالي اليوم). */
export function AttendanceMonthPanel({ month, members }: { month: string; members: Pick<TeamMember, "id" | "name">[] }) {
  const load = useCallback(() => attendanceService.month(month), [month]);
  const { data, loading, error, reload, retry } = useResource<AttendanceMonth>(load, EMPTY);
  // الجلسة المفتوحة اليوم تتحدث مدتها كل دقيقة
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);

  const matrix = useMemo(
    () => buildAttendanceMatrix(data.sessions, members, month, now, data.today),
    [data.sessions, data.today, members, month, now]
  );
  const hasData = data.sessions.length > 0;
  // الأحدث أولاً كما في جدول وقت العمل، ولا تظهر الأيام المستقبلية
  const days = useMemo(() => [...matrix.days].filter((day) => !data.today || day <= data.today).reverse(), [matrix.days, data.today]);

  return (
    <Card className="p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2 text-sm font-semibold text-text">
          <CalendarCheck size={18} className="text-primary-deep" />
          الحضور والانصراف — {formatArabicDate(`${month}-01`, "MMMM yyyy")}
        </div>
        <div className="flex items-center gap-2">
          <IconButton onClick={() => void reload()} aria-label="تحديث" title="تحديث" className="h-10 w-10">
            <RefreshCw size={16} />
          </IconButton>
          <Button
            variant="secondary"
            size="sm"
            icon={<Download size={16} />}
            disabled={loading || !!error || !hasData}
            onClick={() => downloadAttendance(matrix, data.today)}
          >
            تصدير Excel
          </Button>
        </div>
      </div>

      {loading ? (
        <LoadingState label="جارٍ تحميل الحضور..." />
      ) : error ? (
        <ErrorState message={error} onRetry={() => void retry()} />
      ) : !hasData ? (
        <p className="py-6 text-center text-sm text-muted">لا يوجد حضور مسجّل في هذا الشهر</p>
      ) : (
        <div className="mt-3 max-h-[32rem] overflow-auto rounded-control border border-border">
          <table className="w-full min-w-max border-collapse text-sm">
            <thead className="sticky top-0 z-10 bg-surface">
              <tr className="border-b border-border text-xs text-muted">
                <th className="px-3 py-2 text-right font-semibold">اليوم</th>
                {members.map((member) => (
                  <th key={member.id} className="px-3 py-2 text-right font-semibold">{member.name}</th>
                ))}
              </tr>
              <tr className="border-b border-border bg-background/60 font-bold text-text">
                <td className="px-3 py-2">الإجمالي</td>
                {members.map((member) => (
                  <td key={member.id} className="px-3 py-2">
                    <span className="font-mono">{formatHoursMinutes(matrix.memberTotals[member.id])}</span>
                    <span className="mr-1 text-[11px] font-normal text-muted">({matrix.memberDays[member.id]} يوم)</span>
                    {matrix.memberUnclosed[member.id] > 0 && (
                      <span className="mr-1 text-[11px] font-normal text-problem">{matrix.memberUnclosed[member.id]} بلا انصراف</span>
                    )}
                  </td>
                ))}
              </tr>
            </thead>
            <tbody>
              {days.map((day) => (
                <tr key={day} className={`border-b border-border/60 last:border-0 align-top hover:bg-primary/5 ${day === data.today ? "bg-primary/10" : ""}`}>
                  <td className="whitespace-nowrap px-3 py-1.5 text-text">
                    <span className="font-mono">{day}</span>
                    <span className="mr-1 text-[11px] text-muted">{formatArabicDate(day, "EEEE")}</span>
                  </td>
                  {members.map((member) => {
                    const cell = matrix.cells[cellKey(day, member.id)];
                    if (!cell) {
                      return <td key={member.id} className="px-3 py-1.5"><span className="text-muted/50">—</span></td>;
                    }
                    return (
                      <td key={member.id} className="px-3 py-1.5">
                        <div className="space-y-0.5">
                          {cell.sessions.map((session) => (
                            <p key={session.id} className="whitespace-nowrap font-mono text-xs text-text">
                              {formatArabicTime(session.startTime)} ←{" "}
                              {session.endTime !== null ? (
                                formatArabicTime(session.endTime)
                              ) : day === data.today ? (
                                <span className="text-primary-deep">الآن</span>
                              ) : (
                                <span className="text-problem">بلا انصراف</span>
                              )}
                            </p>
                          ))}
                        </div>
                        <p className="mt-0.5 font-mono text-[11px] font-semibold text-muted">
                          {formatHoursMinutes(cell.totalMs)}
                          {cell.sessions.length > 1 && ` · ${cell.sessions.length} جلسات`}
                        </p>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="mt-3 text-xs text-muted">
        تُنسب الجلسة ليوم بدايتها حتى لو انتهت بعد منتصف الليل، وكل عودة بعد انصراف تُحسب جلسة منفصلة. الإجمالي بصيغة ساعات:دقائق.
      </p>
    </Card>
  );
}
