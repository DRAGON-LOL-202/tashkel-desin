import { useEffect, useRef, useState } from "react";
import { AlarmClock, Pause, Play, Plus, X } from "lucide-react";
import type { Task, TimerAction } from "../../types";
import { useCountdown } from "../../hooks/useTaskTimer";
import { formatDuration, formatDurationShort } from "../../lib/date";
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
        <button type="button" className="tm-add" onClick={() => setPicking(true)}>
          <AlarmClock size={13} aria-hidden />مؤقت تنازلي
        </button>
      );
    }
    const customMinutes = Number(custom);
    const customValid = Number.isInteger(customMinutes) && customMinutes >= 1 && customMinutes <= 1440;
    return (
      <div className="tm-panel tm-panel--pick" role="group" aria-label="اختيار مدة المؤقت">
        <span className="tm-hint">المدة (بدء المؤقت يبدأ المهمة):</span>
        {PRESETS.map((m) => (
          <button key={m} type="button" className="tm-btn" onClick={() => start(m)}>{m} د</button>
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
          className="tm-input"
          dir="ltr"
        />
        <button type="button" className="tm-btn tm-btn--go" disabled={!customValid} onClick={() => start(customMinutes)}>ابدأ</button>
        <button type="button" className="tm-btn tm-btn--quiet" onClick={() => { setPicking(false); setCustom(""); }}>إلغاء</button>
        {custom !== "" && !customValid && <p className="tm-error" role="alert">المدة رقم صحيح بين 1 و1440 دقيقة</p>}
      </div>
    );
  }

  const { remainingMs, status } = countdown;
  const minute = 60_000;
  const urgency = status === "expired" ? "expired" : status === "running" && remainingMs <= minute ? "critical" : status === "running" && remainingMs <= 10 * minute ? "warning" : "normal";
  const label = { pending: "المدة المحددة", running: "المتبقي", paused: "متوقف مؤقتاً", expired: "انتهى الوقت" }[status];

  return (
    <div className={`tm-panel tm-panel--${urgency}`} role="timer" aria-live="off" data-timer-status={status}>
      <span className="tm-label"><AlarmClock size={14} aria-hidden />{label}</span>
      <span className="tm-time" dir="ltr">{formatDuration(remainingMs)}</span>
      <span className="tm-total">من {formatDurationShort(task.timer!.plannedMs)}</span>
      <span className="tm-spacer" aria-hidden />
      {status === "running" && <button type="button" className="tm-btn" onClick={() => onAction(task.id, { type: "pause" })}><Pause size={13} aria-hidden />إيقاف</button>}
      {status === "paused" && <button type="button" className="tm-btn" onClick={() => onAction(task.id, { type: "resume" })}><Play size={13} aria-hidden />استكمال</button>}
      {status === "pending" && <button type="button" className="tm-btn" onClick={() => start()}><Play size={13} aria-hidden />بدء</button>}
      {EXTENSIONS.map((m) => (
        <button key={m} type="button" className="tm-btn tm-btn--quiet" title={`تمديد ${m} دقيقة`} aria-label={`تمديد ${m} دقيقة`} onClick={() => onAction(task.id, { type: "extend", minutes: m })}><Plus size={11} aria-hidden />{m}</button>
      ))}
      <button type="button" className="tm-btn tm-btn--danger tm-btn--icon" title="إلغاء المؤقت" aria-label="إلغاء المؤقت" onClick={() => onAction(task.id, { type: "cancel" })}><X size={14} aria-hidden /></button>
    </div>
  );
}
