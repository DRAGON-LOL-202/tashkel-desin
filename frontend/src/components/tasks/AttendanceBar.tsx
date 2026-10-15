import { Clock, LogIn, LogOut, RotateCcw } from "lucide-react";
import { useEffect, useState } from "react";
import type { AttendanceSession } from "../../types";
import { formatArabicDate, formatArabicTime, formatDuration } from "../../lib/date";
import { sessionMs, summarizeDay } from "../../lib/attendance";
import { Button } from "../ui/Button";

interface AttendanceBarProps {
  /** جلسات هذا العضو: جلسات اليوم + أي جلسة ما زالت مفتوحة */
  sessions: AttendanceSession[];
  /** اليوم الحالي بتوقيت الخادم */
  today: string;
  /** الأزرار لصاحب الكرت فقط؛ غيره (الإدارة) يرى الحالة بدون أزرار */
  canPunch: boolean;
  busy: boolean;
  onCheckIn: () => void;
  /** يطلب الانصراف؛ التأكيد (هل أنت متأكد) تعرضه الصفحة */
  onCheckOut: () => void;
}

/** حضور وانصراف العضو في أعلى كرته: حضور ← انصراف (بتأكيد) ← عودة (جلسة منفصلة). */
export function AttendanceBar({ sessions, today, canPunch, busy, onCheckIn, onCheckOut }: AttendanceBarProps) {
  const open = sessions.find((session) => session.endTime === null);
  // يتحدث كل ثانية فقط أثناء وجود جلسة مفتوحة
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!open) return undefined;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [open]);

  const todays = sessions.filter((session) => session.workDate === today || session.endTime === null);
  const hadSessionToday = sessions.some((session) => session.workDate === today);
  const summary = summarizeDay(todays, now);
  const openFromEarlier = !!open && open.workDate !== today;
  const sorted = summary?.sessions ?? [];

  return (
    <div className="rounded-control border border-border bg-surface p-3">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${open ? "bg-primary-deep animate-pulse" : "bg-border"}`} aria-hidden />
          <div className="min-w-0">
            <p className="text-sm font-semibold text-text">
              {open ? "حاضر الآن" : hadSessionToday ? "انصرف" : "لم يسجّل حضوراً"}
            </p>
            {open && (
              <p className="text-xs text-muted">
                منذ {formatArabicTime(open.startTime)}
                {openFromEarlier && ` (${formatArabicDate(open.workDate)})`}
              </p>
            )}
          </div>
        </div>
        {summary && (
          <div className="text-left shrink-0">
            <p className="text-[11px] text-muted">إجمالي اليوم</p>
            <p className="font-mono text-sm font-bold text-text">{formatDuration(summary.totalMs)}</p>
          </div>
        )}
      </div>

      {sorted.length > 0 && (
        <ul className="mt-3 divide-y divide-border border-t border-border">
          {sorted.map((session, index) => (
            <li key={session.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 py-2 text-sm text-muted">
              <span>
                {index === 0 && session.workDate === today ? "حضور" : "عودة"}:{" "}
                <span className="font-semibold text-text">{formatArabicTime(session.startTime)}</span>
              </span>
              <span className="h-5 w-px bg-border" aria-hidden />
              <span>
                انصراف:{" "}
                <span className="font-semibold text-text">
                  {session.endTime === null ? "جارٍ" : formatArabicTime(session.endTime)}
                </span>
              </span>
              <span className="h-5 w-px bg-border" aria-hidden />
              <span className="flex items-center gap-1.5">
                <Clock size={15} className="text-primary-deep" />
                الساعات: <span className="font-mono font-bold text-text">{formatDuration(sessionMs(session, now))}</span>
              </span>
            </li>
          ))}
        </ul>
      )}

      {canPunch && (
        <div className="mt-3">
          {open ? (
            <Button variant="danger" size="sm" icon={<LogOut size={16} />} onClick={onCheckOut} disabled={busy} className="w-full">
              انصراف
            </Button>
          ) : hadSessionToday ? (
            <Button variant="secondary" size="sm" icon={<RotateCcw size={16} />} onClick={onCheckIn} disabled={busy} className="w-full">
              عودة
            </Button>
          ) : (
            <Button size="sm" icon={<LogIn size={16} />} onClick={onCheckIn} disabled={busy} className="w-full">
              حضور
            </Button>
          )}
        </div>
      )}
      {!canPunch && !summary && (
        <p className="mt-2 flex items-center gap-1 text-xs text-muted">
          <Clock size={12} /> لا يوجد تسجيل اليوم
        </p>
      )}
    </div>
  );
}
