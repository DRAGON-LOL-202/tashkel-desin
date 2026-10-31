// تنبيه «انتهى الوقت»: صوت متكرر + نافذة لا تُغلق إلا بموافقة المستخدم.
// هذا مخزن صغير خارج React حتى يعمل من أي مكان (العدّاد المحلي أو رسالة Push) ويبقى حياً
// لو انتقل المستخدم لصفحة أخرى والإنذار يرنّ.
import { claimOnce, isAlarmMuted, playAlarm, stopAlarm, unlockAudio } from "./alarmSound";

export interface TimerAlert {
  /** مثل `timer-<taskId>`: نفس tag إشعار الهاتف، فنغلقه عند الموافقة ولا يتكرر التنبيه */
  id: string;
  title: string;
  body: string;
}

let alerts: readonly TimerAlert[] = [];
const listeners = new Set<() => void>();
let retryArmed = false;

const emit = () => listeners.forEach((listener) => listener());

export const subscribeTimerAlerts = (listener: () => void): (() => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

export const getTimerAlerts = (): readonly TimerAlert[] => alerts;

function closeSystemNotifications(ids: string[]): void {
  if (!("serviceWorker" in navigator) || ids.length === 0) return;
  void navigator.serviceWorker
    .getRegistration()
    .then(async (registration) => {
      if (!registration) return;
      for (const id of ids) for (const notification of await registration.getNotifications({ tag: id })) notification.close();
    })
    .catch(() => undefined);
}

function ring(): void {
  if (alerts.length === 0 || isAlarmMuted()) return;
  if (playAlarm("expired", { loop: true })) return;
  // الصوت ما زال مقفلاً (لا تفاعل سابق في هذه الجلسة): النافذة ظاهرة، ونبدأ الصوت عند أول لمسة
  if (retryArmed) return;
  retryArmed = true;
  const events = ["pointerdown", "keydown", "touchend"] as const;
  const retry = () => {
    events.forEach((name) => window.removeEventListener(name, retry));
    retryArmed = false;
    void unlockAudio().then(ring);
  };
  events.forEach((name) => window.addEventListener(name, retry, { passive: true }));
}

/** انتهى وقت مهمة: تظهر النافذة ويبدأ الصوت المتكرر. مصدران لنفس الحدث لا يكرّران التنبيه. */
export function raiseTimerAlert(alert: TimerAlert): void {
  if (!claimOnce(`expired:${alert.id}`)) return;
  alerts = [...alerts.filter((a) => a.id !== alert.id), alert];
  emit();
  ring();
}

/** موافقة المستخدم: يتوقف الصوت وتُغلق النافذة ويُزال إشعار الهاتف المعلّق (إن وُجد). */
export function acknowledgeTimerAlerts(): void {
  if (alerts.length === 0) return;
  const ids = alerts.map((a) => a.id);
  alerts = [];
  stopAlarm();
  emit();
  closeSystemNotifications(ids);
}
