import { useEffect, useState } from "react";
import { BellRing, Share, Smartphone, Volume2, VolumeX } from "lucide-react";
import { Button } from "../ui/Button";
import { Card } from "../ui/Card";
import { useToast } from "../ui/ToastProvider";
import { useAuth } from "../auth/AuthProvider";
import { useSafeAction } from "../../hooks/useSafeAction";
import { isAlarmMuted, playAlarm, setAlarmMuted, unlockAudio } from "../../lib/alarmSound";
import { useInstallApp } from "../../lib/pwa";
import { disablePush, enablePush, hasLocalSubscription, notificationPermission, pushBlocker } from "../../lib/webPush";
import { pushService, type PushConfig } from "../../services/pushService";

/** تفعيل تنبيهات الهاتف (Web Push) وصوت الإنذار داخل الموقع. يظهر أعلى صفحة الإشعارات. */
export function PushSettingsCard() {
  const { user } = useAuth();
  const { installed } = useInstallApp();
  const { show } = useToast();
  const safe = useSafeAction();
  const blocker = pushBlocker(installed);

  const [permission, setPermission] = useState(notificationPermission);
  const [subscribed, setSubscribed] = useState(false);
  const [config, setConfig] = useState<PushConfig | null>(null);
  const [busy, setBusy] = useState(false);
  const [muted, setMuted] = useState(isAlarmMuted);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    if (blocker) return;
    let cancelled = false;
    void (async () => {
      const [local, cfg] = await Promise.all([hasLocalSubscription(), pushService.config().catch(() => null)]);
      if (cancelled) return;
      setSubscribed(local);
      setConfig(cfg);
    })();
    return () => {
      cancelled = true;
    };
  }, [blocker, version]);

  if (!user) return null;
  const refresh = () => setVersion((v) => v + 1);

  const enable = async () => {
    setBusy(true);
    try {
      unlockAudio();
      const result = await enablePush(user.id);
      setPermission(notificationPermission());
      if (result.ok) show("تم تفعيل التنبيهات على هذا الجهاز");
      else show(result.message, result.reason === "dismissed" ? "info" : "error");
      refresh();
    } finally {
      setBusy(false);
    }
  };

  const disable = async () => {
    setBusy(true);
    try {
      await disablePush(user.id);
      show("تم إيقاف التنبيهات على هذا الجهاز", "info");
      refresh();
    } finally {
      setBusy(false);
    }
  };

  const sendTest = async () => {
    setBusy(true);
    try {
      const result = await safe(() => pushService.test());
      if (!result.ok) return;
      if (result.value.sent > 0) show("أُرسل تنبيه تجريبي، يجب أن يظهر على هاتفك خلال ثوانٍ", "info");
      else show("لا يوجد جهاز مسجّل لحسابك. فعّل التنبيهات أولاً.", "warning");
      refresh();
    } finally {
      setBusy(false);
    }
  };

  const toggleSound = () => {
    unlockAudio();
    const next = !muted;
    setAlarmMuted(next);
    setMuted(next);
  };

  const status = (() => {
    if (blocker === "ios-install") {
      return (
        <div className="flex gap-3 rounded-control border border-operational/40 bg-operational/10 p-3 text-sm text-text">
          <Share size={18} className="mt-0.5 shrink-0 text-operational" aria-hidden />
          <div>
            <p className="font-semibold">على iPhone/iPad لا بدّ من تثبيت الموقع أولاً</p>
            <p className="mt-1 text-muted">
              افتح الموقع في Safari ← زر المشاركة ← «إضافة إلى الشاشة الرئيسية» ← افتح التطبيق من الأيقونة ثم فعّل التنبيهات من هنا. يتطلب iOS 16.4 أو أحدث.
            </p>
          </div>
        </div>
      );
    }
    if (blocker === "unsupported") return <p className="text-sm text-muted">هذا المتصفح لا يدعم تنبيهات الهاتف. جرّب Chrome أو Edge أو Firefox، أو Safari بعد تثبيت الموقع على iPhone.</p>;
    if (blocker === "dev-build") return <p className="text-sm text-muted">تنبيهات الهاتف تعمل في النسخة المنشورة فقط (خدمة التنبيهات لا تُشغَّل في وضع التطوير).</p>;
    if (config && !config.enabled) return <p className="text-sm text-muted">تنبيهات الهاتف غير مفعّلة على الخادم بعد (مفاتيح VAPID). تواصل مع مدير النظام.</p>;
    if (permission === "denied") {
      return <p className="text-sm text-problem">الإذن مرفوض لهذا الموقع. افتح إعدادات المتصفح ← إعدادات الموقع ← الإشعارات ← اسمح، ثم عُد وحدّث الصفحة.</p>;
    }
    if (subscribed && permission === "granted") {
      return (
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full bg-idea/15 px-3 py-1 text-xs font-semibold text-idea">مفعّلة على هذا الجهاز</span>
          {config && <span className="text-xs text-muted">عدد أجهزتك المسجّلة: {config.devices}</span>}
          <Button size="sm" variant="secondary" disabled={busy} onClick={() => void sendTest()}>إرسال تنبيه تجريبي</Button>
          <Button size="sm" variant="ghost" disabled={busy} onClick={() => void disable()}>إيقاف على هذا الجهاز</Button>
        </div>
      );
    }
    return (
      <div className="flex flex-wrap items-center gap-3">
        <Button disabled={busy || !config} icon={<Smartphone size={16} />} onClick={() => void enable()}>
          {busy ? "جارٍ التفعيل..." : "تفعيل تنبيهات الهاتف"}
        </Button>
        <p className="text-xs text-muted">ستصلك تنبيهات المهام وانتهاء المؤقت حتى لو كان الموقع مغلقاً.</p>
      </div>
    );
  })();

  return (
    <Card className="flex flex-col gap-4 p-4" data-testid="push-settings">
      <div className="flex items-center gap-2">
        <BellRing size={18} className="text-primary-deep" aria-hidden />
        <h3 className="text-sm font-bold text-text">تنبيهات الهاتف والصوت</h3>
      </div>
      {status}
      <div className="flex flex-wrap items-center gap-2 border-t border-border pt-3">
        <Button size="sm" variant="secondary" icon={muted ? <VolumeX size={15} /> : <Volume2 size={15} />} onClick={toggleSound} aria-pressed={!muted}>
          {muted ? "صوت الإنذار: مكتوم" : "صوت الإنذار: يعمل"}
        </Button>
        <Button size="sm" variant="ghost" disabled={muted} onClick={() => { unlockAudio(); playAlarm("expired"); }}>تجربة الصوت</Button>
        <p className="text-xs text-muted">يعمل عندما يكون الموقع مفتوحاً: عند انتهاء وقت المؤقت.</p>
      </div>
    </Card>
  );
}
