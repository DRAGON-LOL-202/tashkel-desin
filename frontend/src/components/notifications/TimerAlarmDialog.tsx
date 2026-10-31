import { useEffect, useSyncExternalStore } from "react";
import { AlarmClock, BellOff } from "lucide-react";
import { Button } from "../ui/Button";
import { acknowledgeTimerAlerts, getTimerAlerts, subscribeTimerAlerts } from "../../lib/timerAlerts";
import { isAlarmMuted } from "../../lib/alarmSound";

/**
 * نافذة «انتهى الوقت». لا تُغلق بالنقر خارجها ولا بـ Esc: الموافقة الصريحة وحدها توقف الصوت.
 * مركّبة مرة واحدة في App فتظهر فوق أي صفحة يكون المستخدم فيها.
 */
export function TimerAlarmDialog() {
  const alerts = useSyncExternalStore(subscribeTimerAlerts, getTimerAlerts);
  const open = alerts.length > 0;

  // عنوان التبويب يلفت النظر إن كان المستخدم في تبويب آخر
  useEffect(() => {
    if (!open) return;
    const original = document.title;
    document.title = "⏰ انتهى الوقت!";
    return () => {
      document.title = original;
    };
  }, [open]);

  if (!open) return null;
  const muted = isAlarmMuted();

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 animate-fade-in" role="alertdialog" aria-modal="true" aria-labelledby="timer-alarm-title" aria-describedby="timer-alarm-body">
      <div className="absolute inset-0 bg-[#0d1512]/70 backdrop-blur-[2px]" />
      <div className="relative w-full max-w-sm rounded-card border border-problem/50 bg-surface p-6 text-center shadow-pop animate-scale-in">
        <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-problem/10 text-problem">
          <AlarmClock size={30} aria-hidden />
        </div>
        <h2 id="timer-alarm-title" className="text-lg font-semibold text-text">انتهى الوقت</h2>
        <ul id="timer-alarm-body" className="mt-2 space-y-1 text-sm text-muted">
          {alerts.map((alert) => (
            <li key={alert.id}>{alert.body}</li>
          ))}
        </ul>
        {muted && (
          <p className="mt-3 flex items-center justify-center gap-1.5 text-xs text-muted">
            <BellOff size={13} aria-hidden />
            الصوت مكتوم من إعدادات الإشعارات
          </p>
        )}
        <Button className="mt-5 w-full" size="lg" autoFocus onClick={acknowledgeTimerAlerts}>
          موافق، إيقاف الصوت والمتابعة
        </Button>
      </div>
    </div>
  );
}
