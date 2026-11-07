import { Router } from "express";
import { z } from "zod";
import type { Prisma } from "../generated/prisma/client.ts";
import { prisma } from "../db.js";
import { requireAuth } from "../middleware/auth.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { notFound } from "../utils/httpError.js";
import { NOTIFICATION_CATEGORIES } from "../utils/notify.js";

// كل مستخدم يرى ويعدّل إشعاراته هو فقط: كل استعلام مقيَّد بـ recipientId = المستخدم الحالي.
// لا يوجد POST هنا عمداً: الإشعارات تُنشأ من أحداث الـ backend فقط.
export const notificationsRouter = Router();
notificationsRouter.use(requireAuth);

const isoDay = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const listQuery = z.object({
  filter: z.enum(["all", "unread", "read"]).default("all"),
  category: z.enum(NOTIFICATION_CATEGORIES).optional(),
  q: z.string().trim().max(100).optional(),
  from: isoDay.optional(),
  to: isoDay.optional(),
  limit: z.coerce.number().int().min(1).max(300).default(100),
});
const readBody = z.object({ isRead: z.boolean().default(true) });

const idOf = (v: unknown) => (typeof v === "string" && v.length > 0 && v.length <= 64 ? v : "");

const include = {
  actor: { select: { id: true, name: true } },
  task: { select: { id: true, title: true, date: true, parentId: true, board: true } },
} satisfies Prisma.NotificationInclude;

type Row = Prisma.NotificationGetPayload<{ include: typeof include }>;

function serialize(n: Row) {
  return {
    id: n.id,
    type: n.type,
    category: n.category,
    title: n.title,
    message: n.message,
    isRead: n.isRead,
    readAt: n.readAt?.toISOString() ?? null,
    createdAt: n.createdAt.toISOString(),
    actor: n.actor ? { id: n.actor.id, name: n.actor.name } : null,
    taskId: n.relatedTaskId,
    subtaskId: n.relatedSubtaskId,
    taskTitle: n.task?.title ?? null,
    taskDate: n.task?.date ?? null,
    taskBoard: (n.task?.board ?? "DESIGN").toLowerCase() as "design" | "production",
  };
}

async function counts(userId: string) {
  const db = prisma();
  const [total, unread] = await Promise.all([
    db.notification.count({ where: { recipientId: userId } }),
    db.notification.count({ where: { recipientId: userId, isRead: false } }),
  ]);
  return { total, unread };
}

notificationsRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const q = listQuery.parse(req.query);
    const me = req.user!;
    const where: Prisma.NotificationWhereInput = { recipientId: me.id };
    if (q.filter === "unread") where.isRead = false;
    if (q.filter === "read") where.isRead = true;
    if (q.category) where.category = q.category;
    if (q.q) {
      where.OR = [
        { title: { contains: q.q, mode: "insensitive" } },
        { message: { contains: q.q, mode: "insensitive" } },
        { task: { title: { contains: q.q, mode: "insensitive" } } },
        { actor: { name: { contains: q.q, mode: "insensitive" } } },
      ];
    }
    if (q.from || q.to) {
      where.createdAt = {
        ...(q.from ? { gte: new Date(`${q.from}T00:00:00.000Z`) } : {}),
        ...(q.to ? { lt: new Date(Date.parse(`${q.to}T00:00:00.000Z`) + 86_400_000) } : {}),
      };
    }
    const rows = await prisma().notification.findMany({ where, include, orderBy: { createdAt: "desc" }, take: q.limit });
    res.json({ notifications: rows.map(serialize), ...(await counts(me.id)) });
  })
);

notificationsRouter.get(
  "/unread-count",
  asyncHandler(async (req, res) => {
    res.set("Cache-Control", "no-store");
    res.json(await counts(req.user!.id));
  })
);

// مسارات ثابتة قبل /:id
notificationsRouter.post(
  "/read-all",
  asyncHandler(async (req, res) => {
    const result = await prisma().notification.updateMany({
      where: { recipientId: req.user!.id, isRead: false },
      data: { isRead: true, readAt: new Date() },
    });
    res.json({ ok: true, updated: result.count, ...(await counts(req.user!.id)) });
  })
);

notificationsRouter.delete(
  "/read",
  asyncHandler(async (req, res) => {
    const result = await prisma().notification.deleteMany({ where: { recipientId: req.user!.id, isRead: true } });
    res.json({ ok: true, deleted: result.count, ...(await counts(req.user!.id)) });
  })
);

notificationsRouter.patch(
  "/:id/read",
  asyncHandler(async (req, res) => {
    const { isRead } = readBody.parse(req.body ?? {});
    const db = prisma();
    const existing = await db.notification.findFirst({ where: { id: idOf(req.params.id), recipientId: req.user!.id } });
    if (!existing) throw notFound("الإشعار غير موجود");
    const updated = await db.notification.update({
      where: { id: existing.id },
      data: { isRead, readAt: isRead ? (existing.readAt ?? new Date()) : null },
      include,
    });
    res.json({ notification: serialize(updated), ...(await counts(req.user!.id)) });
  })
);

notificationsRouter.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    const result = await prisma().notification.deleteMany({ where: { id: idOf(req.params.id), recipientId: req.user!.id } });
    if (result.count === 0) throw notFound("الإشعار غير موجود");
    res.json({ ok: true, ...(await counts(req.user!.id)) });
  })
);
