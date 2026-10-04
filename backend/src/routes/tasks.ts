import { Router } from "express";
import type { User } from "../generated/prisma/client.ts";
import { prisma } from "../db.js";
import { isStaff, requireAuth, requireStaff } from "../middleware/auth.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { badRequest, conflict, forbidden, notFound } from "../utils/httpError.js";
import { serializeTask, taskInclude } from "../utils/taskSerialize.js";
import { assertAttachmentsAllowed, deleteStoredObjects } from "../utils/attachments.js";
import { keysOf, removedKeys } from "../utils/attachmentKeys.ts";
import {
  commentSchema,
  createTaskSchema,
  listQuerySchema,
  moveSchema,
  moveUnfinishedSchema,
  progressSchema,
  reorderSchema,
  stopSchema,
  updateTaskSchema,
} from "../validators/tasks.js";

export const tasksRouter = Router();
tasksRouter.use(requireAuth);

const idOf = (v: unknown) => (typeof v === "string" && v.length > 0 && v.length <= 64 ? v : "");

function addDaysISO(iso: string, n: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

async function loadTask(id: string) {
  return prisma().task.findUnique({ where: { id }, include: taskInclude });
}

// المصمم يصل إلى مهامه هو فقط؛ ADMIN/MANAGER إلى الكل.
async function getTaskFor(user: User, rawId: unknown) {
  const task = await loadTask(idOf(rawId));
  if (!task) throw notFound("المهمة غير موجودة");
  if (!isStaff(user) && task.assignedToId !== user.id) throw forbidden("هذه المهمة ليست لك");
  return task;
}

async function respondTask(res: { json: (b: unknown) => unknown }, id: string) {
  const fresh = await loadTask(id);
  if (!fresh) throw notFound("المهمة غير موجودة");
  res.json({ task: serializeTask(fresh) });
}

// المهمة + كل أحفادها (المهام الفرعية)
async function treeIds(rootId: string): Promise<string[]> {
  const db = prisma();
  const all = [rootId];
  let frontier = [rootId];
  while (frontier.length > 0) {
    const kids = await db.task.findMany({ where: { parentId: { in: frontier } }, select: { id: true } });
    frontier = kids.map((k) => k.id).filter((id) => !all.includes(id));
    all.push(...frontier);
  }
  return all;
}

// أسفل ترتيب بين نفس المسؤول/اليوم/الأب (المكتمل يُنقل لأسفل)
async function bottomOrder(t: { id: string; assignedToId: string; date: string; parentId: string | null; sortOrder: number }) {
  const agg = await prisma().task.aggregate({
    _max: { sortOrder: true },
    where: { assignedToId: t.assignedToId, date: t.date, parentId: t.parentId },
  });
  return Math.max(t.sortOrder, agg._max.sortOrder ?? t.sortOrder) + 1;
}

// ---------- قائمة المهام ----------
tasksRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const q = listQuerySchema.parse(req.query);
    const me = req.user!;
    const range = q.date ? q.date : q.from || q.to ? { ...(q.from ? { gte: q.from } : {}), ...(q.to ? { lte: q.to } : {}) } : undefined;
    const rows = await prisma().task.findMany({
      where: {
        ...(range ? { date: range } : {}),
        // المصمم: مهامه فقط مهما كانت الفلاتر
        ...(isStaff(me) ? (q.assigneeId ? { assignedToId: q.assigneeId } : {}) : { assignedToId: me.id }),
      },
      include: taskInclude,
      orderBy: [{ date: "asc" }, { sortOrder: "asc" }, { createdAt: "asc" }],
      take: 5000,
    });
    res.json({ tasks: rows.map(serializeTask) });
  })
);

// ---------- إنشاء ----------
tasksRouter.post(
  "/",
  asyncHandler(async (req, res) => {
    const body = createTaskSchema.parse(req.body);
    const me = req.user!;
    const db = prisma();

    let assigneeId: string;
    if (isStaff(me)) {
      assigneeId = body.assigneeId ?? me.id;
    } else {
      if (body.assigneeId && body.assigneeId !== me.id) throw forbidden("لا يمكنك تعيين مهام لغيرك");
      assigneeId = me.id;
    }

    if (body.parentId) {
      const parent = await db.task.findUnique({ where: { id: body.parentId } });
      if (!parent) throw badRequest("المهمة الأم غير موجودة");
      if (!isStaff(me) && parent.assignedToId !== me.id) throw forbidden("هذه المهمة ليست لك");
      if (body.assigneeId && body.assigneeId !== parent.assignedToId) {
        throw badRequest("المهمة الفرعية تتبع مسؤول المهمة الأم");
      }
      assigneeId = parent.assignedToId;
    }

    const assignee = await db.user.findUnique({ where: { id: assigneeId } });
    if (!assignee || !assignee.isActive) throw badRequest("المسؤول غير موجود أو غير مفعّل");

    await assertAttachmentsAllowed(me.id, "tasks", body.attachments ?? [], []);

    const target = body.target;
    const current = Math.min(body.current, target);
    const done = target > 0 && current >= target;
    const top = await db.task.aggregate({
      _min: { sortOrder: true },
      where: { assignedToId: assigneeId, date: body.date, parentId: body.parentId ?? null },
    });

    const created = await db.task.create({
      data: {
        title: body.title,
        description: body.description || null,
        attachments: body.attachments ?? [],
        target,
        current,
        priority: body.priority,
        status: done ? "COMPLETED" : "NOT_STARTED",
        endTime: done ? new Date() : null,
        date: body.date,
        sortOrder: Math.min(0, top._min.sortOrder ?? 0) - 1,
        createdById: me.id,
        assignedToId: assigneeId,
        parentId: body.parentId ?? null,
      },
    });
    const fresh = await loadTask(created.id);
    res.status(201).json({ task: serializeTask(fresh!) });
  })
);

// ---------- مسارات إدارية ثابتة (قبل /:id) ----------
tasksRouter.post(
  "/reorder",
  asyncHandler(async (req, res) => {
    const { orderedIds } = reorderSchema.parse(req.body);
    const me = req.user!;
    const db = prisma();
    // المصمم يعيد ترتيب مهامه فقط (الفلتر بالمسؤول يتجاهل مهام غيره)
    await db.$transaction(
      orderedIds.map((id, index) =>
        db.task.updateMany({
          where: isStaff(me) ? { id } : { id, assignedToId: me.id },
          data: { sortOrder: index },
        })
      )
    );
    res.json({ ok: true });
  })
);

/**
 * ينقل مهام رئيسية من يوم إلى يوم آخر. الفرعيات المنتهية تبقى في اليوم الأصلي (تحت نسخة هيكلية من الأب)،
 * وغير المنتهية تنتقل مع الأب. إن كانت المهمة المحددة منتهية بالكامل (نقل يدوي) تنتقل كلها كما هي.
 */
async function moveRootsToDate(date: string, target: string, onlyRootId?: string): Promise<number> {
  const db = prisma();
  const day = await db.task.findMany({ where: { date } });
  const byId = new Map(day.map((t) => [t.id, t]));
  const kids = new Map<string, string[]>();
  for (const t of day) {
    if (t.parentId) kids.set(t.parentId, [...(kids.get(t.parentId) ?? []), t.id]);
  }
  const isDone = (id: string): boolean => {
    const ks = kids.get(id) ?? [];
    return ks.length > 0 ? ks.every(isDone) : byId.get(id)!.status === "COMPLETED";
  };
  const doneKids = (id: string) => (kids.get(id) ?? []).filter(isDone);
  const openKids = (id: string) => (kids.get(id) ?? []).filter((k) => !isDone(k));
  const collect = (id: string): string[] => [id, ...(kids.get(id) ?? []).flatMap(collect)];
  // المهمة المنقولة التي تركت خلفها فرعيات منتهية تحتاج نسخة هيكلية (أب) تبقى في اليوم الحالي لتحتضنها
  const needsStub = (id: string): boolean => doneKids(id).length > 0 || openKids(id).some(needsStub);

  const roots = day
    .filter((t) => !t.parentId && (onlyRootId ? t.id === onlyRootId : !isDone(t.id)))
    .sort((a, b) => a.sortOrder - b.sortOrder);

  const existing = await db.task.findMany({
    where: { date: target, parentId: null },
    select: { assignedToId: true, sortOrder: true },
  });
  const lastOrder = new Map<string, number>();
  for (const t of existing) lastOrder.set(t.assignedToId, Math.max(lastOrder.get(t.assignedToId) ?? -1, t.sortOrder));

  await db.$transaction(async (tx) => {
    for (const root of roots) {
      const moveIds: string[] = [];
      if (isDone(root.id)) {
        moveIds.push(...collect(root.id));
      } else {
        const stubOf = new Map<string, string>();
        const walk = async (id: string): Promise<void> => {
          const node = byId.get(id)!;
          if (needsStub(id)) {
            const stub = await tx.task.create({
              data: {
                title: node.title,
                description: node.description,
                target: node.target,
                current: node.target,
                priority: node.priority,
                status: "COMPLETED",
                endTime: new Date(),
                date,
                sortOrder: node.sortOrder,
                createdById: node.createdById,
                assignedToId: node.assignedToId,
                parentId: node.parentId ? (stubOf.get(node.parentId) ?? null) : null,
              },
            });
            stubOf.set(id, stub.id);
            // الفرعيات المنتهية تبقى اليوم تحت النسخة الهيكلية
            await tx.task.updateMany({ where: { id: { in: doneKids(id) } }, data: { parentId: stub.id } });
          }
          moveIds.push(id);
          for (const kid of openKids(id)) await walk(kid);
        };
        await walk(root.id);
      }

      const order = (lastOrder.get(root.assignedToId) ?? -1) + 1;
      lastOrder.set(root.assignedToId, order);
      await tx.task.updateMany({ where: { id: { in: moveIds } }, data: { date: target } });
      await tx.task.updateMany({ where: { id: root.id }, data: { sortOrder: order } });
    }
  });
  return roots.length;
}

tasksRouter.post(
  "/move-unfinished",
  requireStaff,
  asyncHandler(async (req, res) => {
    const { date } = moveUnfinishedSchema.parse(req.body);
    const next = addDaysISO(date, 1);
    const moved = await moveRootsToDate(date, next);
    res.json({ moved, toDate: next });
  })
);

// نقل مهمة رئيسية (أوردر) إلى يوم يحدده المدير
tasksRouter.post(
  "/:id/move-date",
  requireStaff,
  asyncHandler(async (req, res) => {
    const { date } = moveUnfinishedSchema.parse(req.body);
    const task = await prisma().task.findUnique({ where: { id: req.params.id } });
    if (!task) throw notFound("المهمة غير موجودة");
    if (task.parentId) throw badRequest("يمكن نقل المهمة الرئيسية فقط");
    if (task.date === date) throw badRequest("المهمة موجودة في هذا اليوم بالفعل");
    await moveRootsToDate(task.date, date, task.id);
    await respondTask(res, task.id);
  })
);

// ---------- قراءة/تعديل/حذف ----------
tasksRouter.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const task = await getTaskFor(req.user!, req.params.id);
    res.json({ task: serializeTask(task) });
  })
);

// تعديل المحتوى: ADMIN/MANAGER فقط (المصمم لا يعدّل)
tasksRouter.patch(
  "/:id",
  requireStaff,
  asyncHandler(async (req, res) => {
    const body = updateTaskSchema.parse(req.body);
    const db = prisma();
    const task = await getTaskFor(req.user!, req.params.id);
    if (body.attachments !== undefined) await assertAttachmentsAllowed(req.user!.id, "tasks", body.attachments, task.attachments);

    const target = body.target ?? task.target;
    const current = Math.min(body.current ?? task.current, target);
    const done = target > 0 && current >= target;
    const becomesDone = done && task.status !== "COMPLETED";
    const leavesDone = !done && task.status === "COMPLETED";
    const now = new Date();

    const ops = [];
    if (becomesDone) {
      ops.push(db.taskTimeLog.updateMany({ where: { taskId: task.id, stopTime: null }, data: { stopTime: now } }));
    }
    ops.push(
      db.task.update({
        where: { id: task.id },
        data: {
          ...(body.title !== undefined ? { title: body.title } : {}),
          ...(body.description !== undefined ? { description: body.description || null } : {}),
          ...(body.attachments !== undefined ? { attachments: body.attachments } : {}),
          ...(body.priority !== undefined ? { priority: body.priority } : {}),
          target,
          current,
          ...(becomesDone
            ? { status: "COMPLETED" as const, endTime: now, sortOrder: await bottomOrder(task) }
            : leavesDone
              ? { status: "NOT_STARTED" as const, endTime: null }
              : {}),
        },
      })
    );
    await db.$transaction(ops);
    // المرفقات التي أُزيلت من المهمة تُحذف من R2 بعد نجاح الحفظ (أفضل جهد)
    if (body.attachments !== undefined) await deleteStoredObjects(removedKeys(task.attachments, body.attachments));
    await respondTask(res, task.id);
  })
);

tasksRouter.delete(
  "/:id",
  requireStaff,
  asyncHandler(async (req, res) => {
    const task = await getTaskFor(req.user!, req.params.id);
    // مرفقات المهمة وكل أحفادها تُجمع قبل الحذف لأن الـ cascade يزيل الصفوف
    const ids = await treeIds(task.id);
    const rows = await prisma().task.findMany({ where: { id: { in: ids } }, select: { attachments: true } });
    const keys = rows.flatMap((r) => keysOf(r.attachments));
    await prisma().task.delete({ where: { id: task.id } }); // المهام الفرعية والسجلات والتعليقات تُحذف بالـ cascade
    await deleteStoredObjects(keys);
    res.json({ ok: true });
  })
);

// ---------- التقدّم (المصمم لمهمته + الإدارة) ----------
tasksRouter.patch(
  "/:id/progress",
  asyncHandler(async (req, res) => {
    const { current: raw } = progressSchema.parse(req.body);
    const db = prisma();
    const task = await getTaskFor(req.user!, req.params.id);
    const current = Math.min(raw, task.target);
    const done = task.target > 0 && current >= task.target;
    const now = new Date();

    if (done && task.status !== "COMPLETED") {
      await db.$transaction([
        db.taskTimeLog.updateMany({ where: { taskId: task.id, stopTime: null }, data: { stopTime: now } }),
        db.task.update({
          where: { id: task.id },
          data: { current, status: "COMPLETED", endTime: now, sortOrder: await bottomOrder(task) },
        }),
      ]);
    } else if (!done && task.status === "COMPLETED") {
      await db.task.update({ where: { id: task.id }, data: { current, status: "NOT_STARTED", endTime: null } });
    } else {
      await db.task.update({ where: { id: task.id }, data: { current } });
    }
    await respondTask(res, task.id);
  })
);

// ---------- Start / Stop / End ----------
tasksRouter.post(
  "/:id/start",
  asyncHandler(async (req, res) => {
    const me = req.user!;
    const db = prisma();
    const task = await getTaskFor(me, req.params.id);
    if (task.status === "RUNNING") throw conflict("المهمة تعمل بالفعل");
    if (task.status === "COMPLETED") throw conflict("المهمة مكتملة");
    const now = new Date();
    await db.$transaction([
      db.taskTimeLog.create({ data: { taskId: task.id, userId: me.id, startTime: now } }),
      db.task.update({
        where: { id: task.id },
        data: { status: "RUNNING", startedAt: task.startedAt ?? now, endTime: null },
      }),
    ]);
    await respondTask(res, task.id);
  })
);

tasksRouter.post(
  "/:id/stop",
  asyncHandler(async (req, res) => {
    const { note } = stopSchema.parse(req.body ?? {});
    const db = prisma();
    const task = await getTaskFor(req.user!, req.params.id);
    if (task.status !== "RUNNING") throw conflict("المهمة ليست قيد التشغيل");
    const now = new Date();
    await db.$transaction([
      db.taskTimeLog.updateMany({
        where: { taskId: task.id, stopTime: null },
        data: { stopTime: now, stopReason: note || "بدون ملاحظة" },
      }),
      db.task.update({ where: { id: task.id }, data: { status: "PAUSED" } }),
    ]);
    await respondTask(res, task.id);
  })
);

tasksRouter.post(
  "/:id/end",
  asyncHandler(async (req, res) => {
    const db = prisma();
    const task = await getTaskFor(req.user!, req.params.id);
    if (task.status === "COMPLETED") throw conflict("المهمة مكتملة بالفعل");
    const now = new Date();
    await db.$transaction([
      db.taskTimeLog.updateMany({ where: { taskId: task.id, stopTime: null }, data: { stopTime: now } }),
      db.task.update({
        where: { id: task.id },
        data: { status: "COMPLETED", current: task.target, endTime: now, sortOrder: await bottomOrder(task) },
      }),
    ]);
    await respondTask(res, task.id);
  })
);

// إعادة فتح مهمة أُنهيت بالخطأ: تعود غير مكتملة (متوقفة إن كانت قد بدأت) ويمكن استكمالها
tasksRouter.post(
  "/:id/reopen",
  asyncHandler(async (req, res) => {
    const db = prisma();
    const task = await getTaskFor(req.user!, req.params.id);
    if (task.status !== "COMPLETED") throw conflict("المهمة ليست مكتملة");
    await db.task.update({
      where: { id: task.id },
      data: {
        status: task.startedAt ? "PAUSED" : "NOT_STARTED",
        endTime: null,
        // الإنهاء يرفع المنجز إلى الهدف؛ نُنزله خطوة حتى لا تُكمَّل المهمة تلقائياً عند أي تعديل لاحق
        current: Math.min(task.current, Math.max(task.target - 1, 0)),
      },
    });
    await respondTask(res, task.id);
  })
);

// ---------- التعليقات ----------
tasksRouter.post(
  "/:id/comments",
  asyncHandler(async (req, res) => {
    const { text } = commentSchema.parse(req.body);
    const task = await getTaskFor(req.user!, req.params.id);
    await prisma().taskComment.create({ data: { taskId: task.id, userId: req.user!.id, text } });
    await respondTask(res, task.id);
  })
);

tasksRouter.delete(
  "/:id/comments/:commentId",
  asyncHandler(async (req, res) => {
    const me = req.user!;
    const db = prisma();
    const task = await getTaskFor(me, req.params.id);
    const comment = await db.taskComment.findUnique({ where: { id: idOf(req.params.commentId) } });
    if (!comment || comment.taskId !== task.id) throw notFound("التعليق غير موجود");
    if (!isStaff(me) && comment.userId !== me.id) throw forbidden("لا يمكنك حذف تعليق غيرك");
    await db.taskComment.delete({ where: { id: comment.id } });
    await respondTask(res, task.id);
  })
);

// ---------- نقل مهمة (وأحفادها) إلى مسؤول آخر ----------
tasksRouter.post(
  "/:id/move",
  requireStaff,
  asyncHandler(async (req, res) => {
    const body = moveSchema.parse(req.body);
    const db = prisma();
    const moving = await db.task.findUnique({ where: { id: idOf(req.params.id) } });
    if (!moving) throw notFound("المهمة غير موجودة");
    const assignee = await db.user.findUnique({ where: { id: body.assigneeId } });
    if (!assignee || !assignee.isActive) throw badRequest("المسؤول غير موجود أو غير مفعّل");

    const ids = await treeIds(moving.id);
    const siblings = await db.task.findMany({
      where: { date: moving.date, assignedToId: assignee.id, parentId: moving.parentId, id: { notIn: ids } },
      orderBy: { sortOrder: "asc" },
      select: { id: true },
    });
    const order = siblings.map((s) => s.id);
    const at = body.beforeTaskId ? order.indexOf(body.beforeTaskId) : -1;
    if (at >= 0) order.splice(at, 0, moving.id);
    else order.push(moving.id);

    await db.$transaction([
      db.task.updateMany({ where: { id: { in: ids.filter((i) => i !== moving.id) } }, data: { assignedToId: assignee.id } }),
      ...order.map((id, index) =>
        db.task.updateMany({
          where: { id },
          data: id === moving.id ? { sortOrder: index, assignedToId: assignee.id } : { sortOrder: index },
        })
      ),
    ]);
    await respondTask(res, moving.id);
  })
);
