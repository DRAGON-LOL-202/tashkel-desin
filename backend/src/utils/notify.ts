// إنشاء الإشعارات. القواعد:
//  - تُنشأ من الـ backend فقط (لا يوجد endpoint ينشئ إشعاراً من المتصفح).
//  - لا يُرسَل إشعار لمن تسبب بالحدث، ولا لمستخدم معطّل، ولا يتكرر المستلم في نفس الحدث.
//  - أي فشل هنا لا يُفشل العملية الأصلية (أفضل جهد).
import { prisma } from "../db.js";
import { bumpDataVersion } from "./syncVersion.js";

export const NOTIFICATION_CATEGORIES = ["tasks", "reminders", "comments", "admin"] as const;
export type NotificationCategory = (typeof NOTIFICATION_CATEGORIES)[number];

export const NOTIFICATION_TYPES = {
  TASK_ASSIGNED: "tasks",
  TASK_REASSIGNED: "tasks",
  TASK_DATE_CHANGED: "tasks",
  TASK_STATUS_CHANGED: "tasks",
  TASK_COMPLETED: "tasks",
  TASK_REOPENED: "tasks",
  SUBTASK_ADDED: "tasks",
  SUBTASK_COMPLETED: "tasks",
  TASK_DUE_SOON: "reminders",
  TASK_OVERDUE: "reminders",
  TIMER_WARNING_10: "reminders",
  TIMER_WARNING_1: "reminders",
  TIMER_EXPIRED: "reminders",
  COMMENT_ADDED: "comments",
  MENTION: "comments",
  COMMENT_REPLY: "comments",
  ATTACHMENT_ADDED: "comments",
  USER_CREATED: "admin",
  ROLE_CHANGED: "admin",
  ANNOUNCEMENT: "admin",
  ADMIN_TASK_ASSIGNED: "admin",
} as const satisfies Record<string, NotificationCategory>;
export type NotificationType = keyof typeof NOTIFICATION_TYPES;

export interface NotifyInput {
  recipients: Array<string | null | undefined>;
  actor?: { id: string; name: string } | null;
  type: NotificationType;
  title: string;
  message: string;
  taskId?: string | null;
  subtaskId?: string | null;
}

/** يعيد معرّفات المستلمين الذين أُنشئ لهم إشعار فعلاً (للاستخدام لاحقاً في Web Push). */
export async function notify(input: NotifyInput): Promise<string[]> {
  try {
    const actorId = input.actor?.id ?? null;
    const wanted = [...new Set(input.recipients.filter((r): r is string => !!r && r !== actorId))];
    if (wanted.length === 0) return [];
    const db = prisma();
    const users = await db.user.findMany({ where: { id: { in: wanted }, isActive: true }, select: { id: true } });
    const ids = users.map((u) => u.id);
    if (ids.length === 0) return [];
    await db.notification.createMany({
      data: ids.map((recipientId) => ({
        recipientId,
        actorId,
        type: input.type,
        category: NOTIFICATION_TYPES[input.type],
        title: input.title,
        message: input.message,
        relatedTaskId: input.taskId ?? null,
        relatedSubtaskId: input.subtaskId ?? null,
      })),
    });
    return ids;
  } catch (e) {
    console.error("notify failed", e instanceof Error ? e.message : e);
    return [];
  }
}

/** للمهام الخلفية (خارج طلبات HTTP): يرفع رقم النسخة ليتحدّث عداد الواجهات فوراً. */
export const announceNotificationsChanged = bumpDataVersion;

/** المديرون والمشرفون النشطون (للإشعارات الإدارية). */
export async function staffIds(): Promise<string[]> {
  const rows = await prisma().user.findMany({ where: { isActive: true, role: { in: ["ADMIN", "MANAGER"] } }, select: { id: true } });
  return rows.map((r) => r.id);
}

/** @username داخل نص → معرّفات المستخدمين النشطين المذكورين. */
export async function mentionedUserIds(text: string): Promise<string[]> {
  const names = [...new Set([...text.matchAll(/@([\p{L}\p{N}._-]{2,40})/gu)].map((m) => m[1].toLowerCase()))];
  if (names.length === 0) return [];
  const rows = await prisma().user.findMany({ where: { isActive: true, username: { in: names } }, select: { id: true } });
  return rows.map((r) => r.id);
}
