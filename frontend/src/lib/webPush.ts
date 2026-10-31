// اشتراك هذا الجهاز/المتصفح في Web Push (تنبيهات تصل والموقع مغلق).
// الحقيقة الأساسية في الخادم (جدول PushSubscription)؛ هنا فقط: طلب الإذن، الاشتراك في المتصفح، وإرسال بياناته للخادم.
import { pushService, type SerializedSubscription } from "../services/pushService";
import { isIOSDevice } from "./pwa";

export type PushBlocker = "unsupported" | "ios-install" | "dev-build";

/** سبب عدم إمكان التفعيل على هذا الجهاز، أو null إن كان ممكناً */
export function pushBlocker(installed: boolean): PushBlocker | null {
  if (typeof window === "undefined" || !("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
    // iPhone/iPad: Safari العادي لا يعرض PushManager أصلاً؛ الحل تثبيت الموقع على الشاشة الرئيسية
    return isIOSDevice() && !installed ? "ios-install" : "unsupported";
  }
  if (isIOSDevice() && !installed) return "ios-install";
  // الـ Service Worker يُسجَّل في الإنتاج فقط (انظر pwa.ts)
  if (!import.meta.env.PROD) return "dev-build";
  return null;
}

export function notificationPermission(): NotificationPermission | "unsupported" {
  return typeof Notification === "undefined" ? "unsupported" : Notification.permission;
}

const wantedKey = (userId: string) => `tashkeel_push_on:${userId}`;

/** هل فعّل هذا المستخدم التنبيهات على هذا الجهاز؟ (لكل مستخدم على حدة حتى لا يُشترك أحد تلقائياً على جهاز غيره) */
export function isPushWanted(userId: string): boolean {
  try {
    return localStorage.getItem(wantedKey(userId)) === "1";
  } catch {
    return false;
  }
}

function setPushWanted(userId: string, wanted: boolean): void {
  try {
    if (wanted) localStorage.setItem(wantedKey(userId), "1");
    else localStorage.removeItem(wantedKey(userId));
  } catch {
    // التخزين غير متاح: لن نعيد الاشتراك تلقائياً بعد تسجيل الدخول التالي
  }
}

async function registration(): Promise<ServiceWorkerRegistration | null> {
  // الـ Service Worker لا يُسجَّل في التطوير المحلي، وready عندها لا ينتهي أبداً (فنتجنب انتظاره)
  if (!import.meta.env.PROD || !("serviceWorker" in navigator)) return null;
  // ready لا ينتهي أبداً إن لم يُسجَّل Service Worker؛ نحدّ الانتظار
  const timeout = new Promise<null>((resolve) => setTimeout(() => resolve(null), 6000));
  return Promise.race([navigator.serviceWorker.ready, timeout]);
}

// المفتاح العام (base64url) ← bytes. ننشئ ArrayBuffer صريحاً ليقبله النوع BufferSource
function keyToBytes(base64Url: string): Uint8Array<ArrayBuffer> {
  const padded = base64Url + "=".repeat((4 - (base64Url.length % 4)) % 4);
  const raw = atob(padded.replace(/-/g, "+").replace(/_/g, "/"));
  const bytes = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

function sameKey(a: ArrayBuffer | null, b: Uint8Array): boolean {
  if (!a) return false;
  const x = new Uint8Array(a);
  return x.length === b.length && x.every((v, i) => v === b[i]);
}

function serialize(sub: PushSubscription): SerializedSubscription | null {
  const json = sub.toJSON();
  if (!json.endpoint || !json.keys?.p256dh || !json.keys.auth) return null;
  return { endpoint: json.endpoint, keys: { p256dh: json.keys.p256dh, auth: json.keys.auth } };
}

/** اشتراك المتصفح الحالي (ينشئه إن لزم) ثم تسجيله في الخادم. الإذن يجب أن يكون ممنوحاً مسبقاً. */
async function ensureSubscribed(publicKey: string): Promise<{ ok: true; devices: number } | { ok: false; message: string }> {
  const reg = await registration();
  if (!reg) return { ok: false, message: "تعذّر تشغيل خدمة التنبيهات على هذا المتصفح. أعد تحميل الصفحة وحاول مرة أخرى." };
  const key = keyToBytes(publicKey);

  let sub = await reg.pushManager.getSubscription();
  // اشتراك قديم بمفتاح خادم مختلف (بعد تغيير مفاتيح VAPID) لا يعمل؛ نلغيه وننشئ جديداً
  if (sub && !sameKey(sub.options.applicationServerKey, key)) {
    await sub.unsubscribe().catch(() => undefined);
    sub = null;
  }
  sub ??= await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key });

  const body = serialize(sub);
  if (!body) return { ok: false, message: "المتصفح لم يعطِ بيانات اشتراك صالحة" };
  return { ok: true, devices: await pushService.subscribe(body) };
}

export type EnableResult = { ok: true; devices: number } | { ok: false; reason: "denied" | "dismissed" | "server-disabled" | "error"; message: string };

/** تفعيل التنبيهات: يجب استدعاؤه من نقرة المستخدم (طلب الإذن لا يُعرض بغير ذلك، وiOS يشترطه). */
export async function enablePush(userId: string): Promise<EnableResult> {
  try {
    const config = await pushService.config();
    if (!config.enabled || !config.publicKey) {
      return { ok: false, reason: "server-disabled", message: "تنبيهات الهاتف غير مفعّلة على الخادم بعد. تواصل مع مدير النظام." };
    }
    const permission = Notification.permission === "default" ? await Notification.requestPermission() : Notification.permission;
    if (permission === "denied") return { ok: false, reason: "denied", message: "الإذن مرفوض لهذا الموقع. فعّله من إعدادات المتصفح ثم حاول مرة أخرى." };
    if (permission !== "granted") return { ok: false, reason: "dismissed", message: "لم يتم منح الإذن" };

    const result = await ensureSubscribed(config.publicKey);
    if (!result.ok) return { ok: false, reason: "error", message: result.message };
    setPushWanted(userId, true);
    return { ok: true, devices: result.devices };
  } catch (error) {
    return { ok: false, reason: "error", message: error instanceof Error && error.message ? error.message : "تعذّر تفعيل التنبيهات" };
  }
}

/** إيقاف التنبيهات على هذا الجهاز: يحذفه من الخادم ويلغي اشتراك المتصفح. */
export async function disablePush(userId: string): Promise<void> {
  setPushWanted(userId, false);
  await releaseThisDevice();
}

/** يفصل هذا الجهاز عن الحساب الحالي (الخروج/الإيقاف) دون تغيير رغبة المستخدم. أفضل جهد ولا يرمي. */
export async function releaseThisDevice(): Promise<void> {
  try {
    const reg = await registration();
    const sub = await reg?.pushManager.getSubscription();
    if (!sub) return;
    await pushService.unsubscribe(sub.endpoint).catch(() => undefined);
    await sub.unsubscribe().catch(() => undefined);
  } catch {
    // لا نعطّل الخروج بسبب فشل هنا
  }
}

/** مزامنة صامتة بعد الدخول/فتح التطبيق: يعيد تسجيل الجهاز (المفاتيح قد تتغير) إن كان المستخدم فعّله سابقاً. */
export async function syncPush(userId: string): Promise<void> {
  if (!isPushWanted(userId) || notificationPermission() !== "granted") return;
  try {
    const config = await pushService.config();
    if (config.enabled && config.publicKey) await ensureSubscribed(config.publicKey);
  } catch {
    // فشل صامت: تُعاد المحاولة عند الفتح التالي
  }
}

/** هل لهذا المتصفح اشتراك فعّال حالياً؟ (لعرض الحالة) */
export async function hasLocalSubscription(): Promise<boolean> {
  try {
    const reg = await registration();
    return !!(await reg?.pushManager.getSubscription());
  } catch {
    return false;
  }
}
