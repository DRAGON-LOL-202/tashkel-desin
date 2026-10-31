import { useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthProvider";
import { useToast } from "../ui/ToastProvider";
import { claimOnce, playAlarm, unlockAudio } from "../../lib/alarmSound";
import { syncPush } from "../../lib/webPush";
import { notificationsService } from "../../services/notificationsService";

interface PushPayload {
  title?: string;
  body?: string;
  type?: string;
  tag?: string;
  timer?: boolean;
}
type WorkerMessage = { type: "push-received"; payload?: PushPayload } | { type: "notification-click"; url?: string };

const NID_RE = /^[\w-]{1,64}$/;

/**
 * يربط الصفحة بالـ Service Worker (لا يعرض شيئاً):
 *  1) رسالة Push وصلت والموقع مفتوح ← صوت إنذار + تنبيه داخل الصفحة لتنبيهات المؤقت.
 *  2) نقر على إشعار الهاتف والموقع مفتوح ← انتقال داخل الموقع دون إعادة تحميل.
 *  3) رابط فيه nid (فتح من إشعار الهاتف) ← تحديد الإشعار كمقروء ثم إزالة nid من الرابط.
 *  4) بعد الدخول/الفتح ← مزامنة صامتة لاشتراك هذا الجهاز مع الخادم.
 */
export function PushBridge() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const { show } = useToast();
  const userId = user?.id;

  // المتصفح يمنع الصوت قبل أي تفاعل؛ أول نقرة/لمسة تفتح الصوت لبقية الجلسة
  useEffect(() => {
    const events = ["pointerdown", "keydown", "touchend"] as const;
    const unlock = () => {
      unlockAudio();
      events.forEach((name) => window.removeEventListener(name, unlock));
    };
    events.forEach((name) => window.addEventListener(name, unlock, { passive: true }));
    return () => events.forEach((name) => window.removeEventListener(name, unlock));
  }, []);

  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    const onMessage = (event: MessageEvent<WorkerMessage>) => {
      const message = event.data;
      if (!message || typeof message !== "object") return;

      if (message.type === "push-received" && message.payload) {
        const p = message.payload;
        const key = p.tag ?? p.type ?? "push";
        if (p.type === "TIMER_EXPIRED") {
          if (claimOnce(`expired:${key}`)) {
            playAlarm("expired");
            show(`${p.title ?? "انتهى الوقت"}: ${p.body ?? ""}`, "warning");
          }
        } else if (p.timer) {
          if (claimOnce(`${p.type}:${key}`)) {
            playAlarm("warning");
            show(`${p.title ?? "تنبيه"}: ${p.body ?? ""}`, "warning");
          }
        } else if (p.type === "PUSH_TEST") {
          playAlarm("chime");
          show("وصل التنبيه التجريبي ✅", "success");
        }
        // بقية الإشعارات: عدّاد القائمة يتحدّث وحده بالمزامنة اللحظية، فلا نزعج المستخدم بصوت
        return;
      }

      if (message.type === "notification-click" && typeof message.url === "string") {
        try {
          const target = new URL(message.url, window.location.origin);
          if (target.origin === window.location.origin && target.hash.startsWith("#/")) navigate(target.hash.slice(1));
        } catch {
          // رابط غير صالح: نتجاهله
        }
      }
    };
    navigator.serviceWorker.addEventListener("message", onMessage);
    return () => navigator.serviceWorker.removeEventListener("message", onMessage);
  }, [navigate, show]);

  useEffect(() => {
    if (!userId) return;
    const params = new URLSearchParams(location.search);
    const nid = params.get("nid");
    if (nid === null) return;
    params.delete("nid");
    const search = params.toString();
    navigate({ pathname: location.pathname, search: search ? `?${search}` : "" }, { replace: true });
    if (NID_RE.test(nid)) void notificationsService.setRead(nid, true).catch(() => undefined);
  }, [userId, location.pathname, location.search, navigate]);

  useEffect(() => {
    if (userId) void syncPush(userId);
  }, [userId]);

  return null;
}
