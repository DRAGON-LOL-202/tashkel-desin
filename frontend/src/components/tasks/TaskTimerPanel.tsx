import { useEffect, useRef, useState } from "react";
import { AlarmClock, Pause, Play, Plus, X } from "lucide-react";
import type { Task, TimerAction } from "../../types";
import { useCountdown } from "../../hooks/useTaskTimer";
import { formatDuration, formatDurationShort } from "../../lib/date";
import { Button } from "../ui/Button";
import { raiseTimerAlert } from "../../lib/timerAlerts";

interface TaskTimerPanelProps {
  task: Task;
  onAction: (id: string, action: TimerAction) => void;
}

const PRESETS = [15, 30, 45, 60];
const EXTENSIONS = [5, 10, 15];

/** مؤقت تنازلي بمدة مخصصة لكل مهمة: تحديد المدة، بدء، إيقاف، استكمال، تمديد، إلغاء. */
export function TaskTimerPanel({ task, onAction }: TaskTimerPanelProps) {
  const countdown = useCountdown(task.timer);
  const [picking, setPicking] = useState(false);
  const [custom, setCustom] = useState("");

  // انتهاء الوقت والصفحة مفتوحة: نافذة «انتهى الوقت» + صوت متكرر حتى يوافق المستخدم (دون انتظار Push).
  // نكتفي بالانتقال running ← expired أمام المستخدم؛ مؤقت منتهٍ أصلاً عند فتح الصفحة لا يُصدر صوتاً.
  // المعرّف نفسه (timer-<id>) تستخدمه PushBridge فلا يتكرر التنبيه حين تصل رسالة Push لنفس المهمة.
  const liveStatus = countdown?.status;
  const previousStatus = useRef(liveStatus);
  useEffect(() => {
    if (previousStatus.current === "running" && liveStatus === "expired") {
      raiseTimerAlert({ id: `timer-${task.id}`, title: "انتهى الوقت", body: `انتهى وقت المهمة «${task.title}»` });
    }
    previousStatus.current = liveStatus;
  }, [liveStatus, task.id, task.title]);

  if (task.status === "completed") return null;

  const start = (minutes?: number) => {
    onAction(task.id, { type: "start", minutes });
    setPicking(false);
    setCustom("");
  };

  // لا مؤقت: زر صغير يفتح اختيار المدة
  if (!countdown) {
    if (!picking) {
      return (
        <div className="mt-3">
          <Button size="sm" variant="ghost" icon={<AlarmClock size={14} />} onClick={() => setPicking(true)}>مؤقت تنازلي</Button>
        </div>
      );
    }
    const customMinutes = Number(custom);
    const customValid = Number.isInteger(customMinutes) && customMinutes >= 1 && customMinutes <= 1440;
    return (
      <div className="mt-3 rounded-control border border-border bg-surface p-3" role="group" aria-label="اختيار مدة المؤقت">
        <p className="mb-2 text-xs font-semibold text-muted">اختر المدة (بدء المؤقت يبدأ المهمة)</p>
        <div className="flex flex-wrap items-center gap-2">
          {PRESETS.map((m) => (
            <Button key={m} size="sm" variant="secondary" onClick={() => start(m)}>{m} دقيقة</Button>
          ))}
          <input
            type="number"
            min={1}
            max={1440}
            step={1}
            inputMode="numeric"
            value={custom}
            onChange={(event) => setCustom(event.target.value)}
            placeholder="دقائق"
            aria-label="مدة مخصصة بالدقائق"
            className="w-24 rounded-control border border-border bg-background px-2 py-1.5 text-sm"
            dir="ltr"
          />
          <Button size="sm" variant="primary" disabled={!customValid} onClick={() => start(customMinutes)}>ابدأ</Button>
          <Button size="sm" variant="ghost" onClick={() => { setPicking(false); setCustom(""); }}>إلغاء</Button>
        </div>
        {custom !== "" && !customValid && <p className="mt-1 text-xs text-problem" role="alert">المدة رقم صحيح بين 1 و1440 دقيقة</p>}
      </div>
    );
  }

  const { remainingMs, status } = countdown;
  const minute = 60_000;
  const urgency = status === "expired" ? "expired" : status === "running" && remainingMs <= minute ? "critical" : status === "running" && remainingMs <= 10 * minute ? "warning" : "normal";
  const tone = urgency === "expired" || urgency === "critical" ? "border-problem/50 bg-problem/10 text-problem" : urgency === "warning" ? "border-operational/50 bg-operational/10 text-operational" : "border-border bg-surface text-text";
  const label = { pending: "المدة المحددة", running: "المتبقي", paused: "متوقف مؤقتاً", expired: "انتهى الوقت" }[status];

  return (
    <div className={`mt-3 rounded-control border p-3 ${tone}`} role="timer" aria-live="off" data-timer-status={status}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="flex items-center gap-1.5 text-xs font-semibold"><AlarmClock size={15} aria-hidden />{label}</span>
        <span className="font-mono text-xl font-bold tabular-nums" dir="ltr">{formatDuration(remainingMs)}</span>
      </div>
      <p className="mt-0.5 text-[11px] opacity-80">المدة الكلية: {formatDurationShort(task.timer!.plannedMs)}</p>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        {status === "running" && <Button size="sm" variant="secondary" icon={<Pause size={14} />} onClick={() => onAction(task.id, { type: "pause" })}>إيقاف المؤقت</Button>}
        {status === "paused" && <Button size="sm" variant="secondary" icon={<Play size={14} />} onClick={() => onAction(task.id, { type: "resume" })}>استكمال</Button>}
        {status === "pending" && <Button size="sm" variant="secondary" icon={<Play size={14} />} onClick={() => start()}>بدء المؤقت</Button>}
        {EXTENSIONS.map((m) => (
          <Button key={m} size="sm" variant="ghost" icon={<Plus size={13} />} onClick={() => onAction(task.id, { type: "extend", minutes: m })}>{m} د</Button>
        ))}
        <Button size="sm" variant="danger" icon={<X size={14} />} onClick={() => onAction(task.id, { type: "cancel" })}>إلغاء المؤقت</Button>
      </div>
    </div>
  );
}
