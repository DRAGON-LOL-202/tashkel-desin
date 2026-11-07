// Web Push: إرسال إشعار إلى أجهزة المستخدم حتى لو كان الموقع/التطبيق مغلقاً.
//  - يعمل فقط إذا ضُبطت مفاتيح VAPID؛ بدونها كل الدوال هنا لا تفعل شيئاً (لا خطأ).
//  - الإرسال "أفضل جهد": أي فشل يُسجَّل ولا يُفشل العملية الأصلية (إنشاء مهمة، تعليق، مراقب المؤقتات...).
//  - اشتراك أنهى المتصفح صلاحيته (404/410) يُحذف تلقائياً.
import webpush from "web-push";
import { prisma } from "../db.js";
import { env } from "./env.js";

export interface PushPayload {
  title: string;
  body: string;
  /** مسار نسبي لنطاق الواجهة (HashRouter): مثل /#/daily-tasks?date=2026-11-01 */
  url: string;
  /** نفس الـ tag يستبدل الإشعار السابق على الجهاز بدل تكديسه */
  tag: string;
  type: string;
  notificationId?: string;
  /** إشعارات المؤقت: صوت واهتزاز وبقاء الإشعار حتى يتفاعل المستخدم */
  timer?: boolean;
}

export interface PushTarget {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}
export interface PushSendOptions {
  TTL: number;
  urgency: "very-low" | "low" | "normal" | "high";
}
export type PushSender = (target: PushTarget, body: string, options: PushSendOptions) => Promise<unknown>;

export const MAX_BODY_CHARS = 220;

export function pushConfigured(): boolean {
  const e = env();
  return !!(e.VAPID_PUBLIC_KEY && e.VAPID_PRIVATE_KEY && e.VAPID_SUBJECT);
}

export function vapidPublicKey(): string | null {
  return env().VAPID_PUBLIC_KEY ?? null;
}

let vapidApplied = false;
const realSender: PushSender = (target, body, options) => {
  if (!vapidApplied) {
    const e = env();
    webpush.setVapidDetails(e.VAPID_SUBJECT!, e.VAPID_PUBLIC_KEY!, e.VAPID_PRIVATE_KEY!);
    vapidApplied = true;
  }
  return webpush.sendNotification(target, body, { TTL: options.TTL, urgency: options.urgency, timeout: 10_000 });
};

// للاختبارات فقط: استبدال الإرسال الفعلي (حتى لا يخرج أي طلب شبكة ولا تلزم مفاتيح حقيقية)
let sender: PushSender | null = null;
export function setPushSender(fn: PushSender | null): void {
  sender = fn;
}

/** مدة بقاء الرسالة عند مزوّد الدفع إن كان الجهاز مطفأ: تنبيه «دقيقة» عمره ساعة بلا فائدة، فنقصّر الحياة */
export function ttlFor(type: string): number {
  switch (type) {
    case "TIMER_WARNING_1":
      return 120;
    case "TIMER_WARNING_10":
      return 600;
    case "TIMER_EXPIRED":
      return 3600;
    default:
      return 86_400;
  }
}

const isTimerType = (type: string) => type.startsWith("TIMER_");

function pushUrl(input: { taskId?: string | null; taskDate?: string | null; taskBoard?: string | null; notificationId?: string }): string {
  const nid = input.notificationId ? `nid=${encodeURIComponent(input.notificationId)}` : "";
  const page = input.taskBoard === "PRODUCTION" ? "production-tasks" : "daily-tasks";
  if (input.taskId && input.taskDate) return `/#/${page}?date=${input.taskDate}${nid ? `&${nid}` : ""}`;
  return `/#/notifications${nid ? `?${nid}` : ""}`;
}

export function buildPayload(input: { type: string; title: string; message: string; taskId?: string | null; taskDate?: string | null; taskBoard?: string | null; notificationId?: string }): PushPayload {
  const body = input.message.length > MAX_BODY_CHARS ? `${input.message.slice(0, MAX_BODY_CHARS - 1)}…` : input.message;
  return {
    title: input.title,
    body,
    // nid: تعرف الواجهة منه أي إشعار فُتح فتحدّده كمقروء (الـ Service Worker لا يملك توكن الدخول)
    url: pushUrl(input),
    // المهمة الواحدة تحتفظ بإشعار مؤقت واحد على الشاشة (الأحدث يحلّ محل الأقدم)
    tag: isTimerType(input.type) && input.taskId ? `timer-${input.taskId}` : input.notificationId ? `n-${input.notificationId}` : `t-${input.type}`,
    type: input.type,
    notificationId: input.notificationId,
    timer: isTimerType(input.type),
  };
}

export interface PushResult {
  devices: number;
  sent: number;
  failed: number;
  removed: number;
}

/** يرسل لكل أجهزة المستخدمين المحددين. لا يرمي أبداً. */
export async function sendPushToUsers(userIds: string[], payload: PushPayload): Promise<PushResult> {
  const result: PushResult = { devices: 0, sent: 0, failed: 0, removed: 0 };
  try {
    const send = sender ?? (pushConfigured() ? realSender : null);
    if (!send || userIds.length === 0) return result;
    const db = prisma();
    const subs = await db.pushSubscription.findMany({ where: { userId: { in: [...new Set(userIds)] } } });
    result.devices = subs.length;
    if (subs.length === 0) return result;

    const body = JSON.stringify(payload);
    const options: PushSendOptions = { TTL: ttlFor(payload.type), urgency: payload.timer ? "high" : "normal" };
    const gone: string[] = [];
    const ok: string[] = [];

    await Promise.all(
      subs.map(async (s) => {
        try {
          await send({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, body, options);
          ok.push(s.id);
          result.sent++;
        } catch (e) {
          const status = (e as { statusCode?: number }).statusCode;
          if (status === 404 || status === 410) gone.push(s.id);
          else console.error("push failed", status ?? (e instanceof Error ? e.message : e));
          result.failed++;
        }
      })
    );

    if (gone.length > 0) {
      await db.pushSubscription.deleteMany({ where: { id: { in: gone } } });
      result.removed = gone.length;
    }
    if (ok.length > 0) await db.pushSubscription.updateMany({ where: { id: { in: ok } }, data: { lastPushAt: new Date() } });
  } catch (e) {
    console.error("push dispatch failed", e instanceof Error ? e.message : e);
  }
  return result;
}

// الإرسال من داخل طلبات HTTP لا ينتظره المستخدم؛ لكن المراقب (وطلب /tick) ينتظره عبر flushPushes()
// حتى لا تنتهي الدورة (وقد تنام الخدمة المجانية) قبل خروج الرسائل.
const pending = new Set<Promise<unknown>>();
export function dispatchPush(userIds: string[], payload: PushPayload): void {
  const p = sendPushToUsers(userIds, payload).finally(() => pending.delete(p));
  pending.add(p);
}
export async function flushPushes(): Promise<void> {
  while (pending.size > 0) await Promise.allSettled([...pending]);
}
