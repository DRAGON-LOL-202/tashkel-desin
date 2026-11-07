import { Router } from "express";
import bcrypt from "bcryptjs";
import type { InventoryAccess, Role, User } from "../generated/prisma/client.ts";
import { prisma } from "../db.js";
import { requireAuth, requireStaff } from "../middleware/auth.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { badRequest, conflict, forbidden, HttpError, notFound } from "../utils/httpError.js";
import { publicUser } from "../utils/serialize.js";
import { isRestrictedRole, isSalesRole } from "../utils/inventoryAccess.js";
import { deleteUnreferencedObjects } from "../utils/attachments.js";
import { notify, staffIds } from "../utils/notify.js";
import { keysOf } from "../utils/attachmentKeys.ts";
import { createUserSchema, statusSchema, updateProfileSchema, updateUserSchema } from "../validators/users.js";

export const usersRouter = Router();
usersRouter.use(requireAuth);

type UserPatch = Partial<Pick<User, "name" | "username" | "email" | "role" | "jobTitle" | "passwordHash" | "inventoryAccess" | "showTaskCard" | "showProductionCard">>;

const ROLE_LABEL: Record<Role, string> = {
  ADMIN: "مدير النظام",
  MANAGER: "مدير",
  DESIGNER: "مصمم",
  PACKER: "تعبئة",
  OPERATOR: "مشغل",
  SALES_FLAGGER: "مراجع مرتجعات",
  SALES_EDITOR: "منفّذ أوردرات",
  SALES_SUPERVISOR: "مشرف مبيعات",
};
// المسمى الوظيفي الافتراضي لدوري تعبئة/مشغل وأدوار المبيعات (المصمم يأخذ افتراضي الـ schema)
const DEFAULT_TITLE: Partial<Record<Role, string>> = {
  PACKER: "تعبئة",
  OPERATOR: "مشغل",
  DESIGNER: "مصمم",
  SALES_FLAGGER: "مراجع مرتجعات",
  SALES_EDITOR: "منفّذ أوردرات",
  SALES_SUPERVISOR: "مشرف مبيعات",
};

/** مستوى وصول المخزون المخزَّن: تعبئة/مشغل = سحب فقط، الإدارة = كامل، أدوار المبيعات = تحكّم خاص بالدور، والمصمم حسب اختيار المدير (الافتراضي بلا وصول). */
function storedAccess(role: Role, requested: InventoryAccess | undefined, fallback: InventoryAccess): InventoryAccess {
  if (role === "ADMIN" || role === "MANAGER") return "FULL";
  if (role === "PACKER" || role === "OPERATOR") return "WITHDRAW";
  if (isSalesRole({ role })) return "NONE";
  return requested ?? fallback;
}

/** يتحقق أن كل المجموعات الرئيسية موجودة ويزيل التكرار. */
async function validGroupIds(ids: string[]): Promise<string[]> {
  const unique = [...new Set(ids)];
  if (unique.length === 0) return [];
  const found = await prisma().inventoryGroup.count({ where: { id: { in: unique } } });
  if (found !== unique.length) throw badRequest("إحدى مجموعات المخزون غير موجودة");
  return unique;
}

/** يحمّل المجموعات المسموحة لعدة مستخدمين دفعة واحدة. */
async function groupsByUser(userIds: string[]): Promise<Map<string, string[]>> {
  const rows = await prisma().userInventoryGroup.findMany({ where: { userId: { in: userIds } }, select: { userId: true, groupId: true } });
  const map = new Map<string, string[]>();
  for (const r of rows) map.set(r.userId, [...(map.get(r.userId) ?? []), r.groupId]);
  return map;
}

async function presentUsers(users: User[]) {
  const map = await groupsByUser(users.filter(isRestrictedRole).map((u) => u.id));
  return users.map((u) => publicUser(u, map.get(u.id) ?? []));
}
async function presentUser(u: User) {
  return (await presentUsers([u]))[0];
}
const isUniqueViolation = (e: unknown) => (e as { code?: string })?.code === "P2002";
const idOf = (v: unknown) => (typeof v === "string" && v.length > 0 && v.length <= 64 ? v : "");

// ---- الملف الشخصي (متاح لكل مستخدم مسجّل، يجب تعريفه قبل /:id) ----
usersRouter.patch(
  "/me",
  asyncHandler(async (req, res) => {
    const body = updateProfileSchema.parse(req.body);
    const me = req.user!;
    const data: UserPatch = {};
    if (body.name !== undefined) data.name = body.name;
    if (body.jobTitle !== undefined) data.jobTitle = body.jobTitle;
    if (body.email !== undefined) data.email = body.email;
    if (body.newPassword) {
      const ok = await bcrypt.compare(body.currentPassword!, me.passwordHash);
      if (!ok) throw new HttpError(400, "كلمة المرور الحالية غير صحيحة", "BAD_PASSWORD");
      data.passwordHash = await bcrypt.hash(body.newPassword, 12);
    }
    try {
      const updated = await prisma().user.update({ where: { id: me.id }, data });
      res.json({ user: publicUser(updated) });
    } catch (e) {
      if (isUniqueViolation(e)) throw conflict("البريد الإلكتروني مستخدم بالفعل");
      throw e;
    }
  })
);

// ---- إدارة المستخدمين: ADMIN و MANAGER فقط (DESIGNER ← 403) ----
usersRouter.use(requireStaff);

usersRouter.get(
  "/",
  asyncHandler(async (_req, res) => {
    const users = await prisma().user.findMany({ orderBy: [{ isSystemUser: "desc" }, { createdAt: "asc" }] });
    res.json({ users: await presentUsers(users) });
  })
);

usersRouter.post(
  "/",
  asyncHandler(async (req, res) => {
    const body = createUserSchema.parse(req.body);
    // إسناد دور ADMIN يقتصر على ADMIN
    if (body.role === "ADMIN" && req.user!.role !== "ADMIN") throw forbidden("إسناد دور المدير العام يقتصر على المدير العام");
    const db = prisma();
    const dup = await db.user.findFirst({
      where: { OR: [{ username: body.username }, { email: body.email }] },
      select: { username: true },
    });
    if (dup) throw conflict("اسم المستخدم أو البريد الإلكتروني مستخدم بالفعل");
    const groupIds = isRestrictedRole(body) ? await validGroupIds(body.allowedGroupIds ?? []) : [];
    try {
      const jobTitle = body.jobTitle ?? DEFAULT_TITLE[body.role];
      const user = await db.user.create({
        data: {
          name: body.name,
          username: body.username,
          email: body.email,
          passwordHash: await bcrypt.hash(body.password, 12),
          role: body.role,
          inventoryAccess: storedAccess(body.role, body.inventoryAccess, "NONE"),
          // الافتراضي: كرت المهام لغير تعبئة/مشغل/مبيعات (حتى لا تتكاثر الكروت)؛ والمدير يغيّره صراحة
          showTaskCard: body.showTaskCard ?? (!isRestrictedRole(body) && !isSalesRole(body)),
          showProductionCard: body.showProductionCard ?? false,
          ...(jobTitle ? { jobTitle } : {}),
          isSystemUser: false,
          ...(groupIds.length > 0 ? { inventoryGroups: { create: groupIds.map((groupId) => ({ groupId })) } } : {}),
        },
      });
      await notify({
        recipients: await staffIds(),
        actor: req.user!,
        type: "USER_CREATED",
        title: "موظف جديد",
        message: `أضاف ${req.user!.name} الحساب «${user.name}»`,
      });
      res.status(201).json({ user: await presentUser(user) });
    } catch (e) {
      if (isUniqueViolation(e)) throw conflict("اسم المستخدم أو البريد الإلكتروني مستخدم بالفعل");
      throw e;
    }
  })
);

usersRouter.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const user = await prisma().user.findUnique({ where: { id: idOf(req.params.id) } });
    if (!user) throw notFound("المستخدم غير موجود");
    res.json({ user: await presentUser(user) });
  })
);

usersRouter.patch(
  "/:id/status",
  asyncHandler(async (req, res) => {
    const { isActive } = statusSchema.parse(req.body);
    const actor = req.user!;
    const target = await prisma().user.findUnique({ where: { id: idOf(req.params.id) } });
    if (!target) throw notFound("المستخدم غير موجود");
    if (target.role === "ADMIN" && actor.role !== "ADMIN") throw forbidden("لا يمكنك تعديل حساب المدير العام");
    if (!isActive) {
      if (target.id === actor.id) throw badRequest("لا يمكنك تعطيل حسابك بنفسك");
      if (target.isSystemUser) throw new HttpError(403, "لا يمكن تعطيل مستخدم نظام", "SYSTEM_USER");
    }
    const updated = await prisma().user.update({ where: { id: target.id }, data: { isActive } });
    res.json({ user: await presentUser(updated) });
  })
);

usersRouter.patch(
  "/:id",
  asyncHandler(async (req, res) => {
    const body = updateUserSchema.parse(req.body);
    const actor = req.user!;
    const db = prisma();
    const target = await db.user.findUnique({ where: { id: idOf(req.params.id) } });
    if (!target) throw notFound("المستخدم غير موجود");

    // MANAGER لا يعدّل حساب ADMIN (وإلا يستطيع إعادة تعيين كلمة مروره) ولا يمنح دور ADMIN
    if (actor.role !== "ADMIN") {
      if (target.role === "ADMIN") throw forbidden("لا يمكنك تعديل حساب المدير العام");
      if (body.role === "ADMIN") throw forbidden("إسناد دور المدير العام يقتصر على المدير العام");
    }
    if (body.role !== undefined && body.role !== target.role) {
      if (target.isSystemUser) throw new HttpError(403, "لا يمكن تغيير دور مستخدم نظام", "SYSTEM_USER");
      if (target.id === actor.id) throw badRequest("لا يمكنك تغيير دورك بنفسك");
    }

    const data: UserPatch = {};
    if (body.name !== undefined) data.name = body.name;
    if (body.username !== undefined) data.username = body.username;
    if (body.email !== undefined) data.email = body.email;
    if (body.showTaskCard !== undefined) data.showTaskCard = body.showTaskCard;
    if (body.showProductionCard !== undefined) data.showProductionCard = body.showProductionCard;
    const finalRole = body.role ?? target.role;
    const roleChanged = finalRole !== target.role;
    if (body.role !== undefined) data.role = body.role;
    // تغيير الدور مع بقاء المسمى الافتراضي للدور القديم ← ينتقل للمسمى الافتراضي للدور الجديد
    if (body.jobTitle !== undefined) data.jobTitle = body.jobTitle;
    else if (roleChanged && DEFAULT_TITLE[finalRole] && target.jobTitle === DEFAULT_TITLE[target.role]) data.jobTitle = DEFAULT_TITLE[finalRole]!;
    // المصمم الذي لم يُحدَّد له وصول عند التحويل إليه يبدأ بلا وصول؛ ومن بقي مصمماً يحتفظ بوصوله
    const designerFallback: InventoryAccess = target.role === "DESIGNER" ? target.inventoryAccess : "NONE";
    const newAccess = storedAccess(finalRole, body.inventoryAccess, designerFallback);
    if (newAccess !== target.inventoryAccess) data.inventoryAccess = newAccess;
    const restricted = isRestrictedRole({ role: finalRole });
    const newGroupIds = restricted && body.allowedGroupIds !== undefined ? await validGroupIds(body.allowedGroupIds) : undefined;
    if (body.password !== undefined) data.passwordHash = await bcrypt.hash(body.password, 12);

    if (body.username !== undefined || body.email !== undefined) {
      const dup = await db.user.findFirst({
        where: {
          id: { not: target.id },
          OR: [
            ...(body.username !== undefined ? [{ username: body.username }] : []),
            ...(body.email !== undefined ? [{ email: body.email }] : []),
          ],
        },
        select: { id: true },
      });
      if (dup) throw conflict("اسم المستخدم أو البريد الإلكتروني مستخدم بالفعل");
    }
    try {
      const updated = await db.$transaction(async (tx) => {
        const u = await tx.user.update({ where: { id: target.id }, data });
        if (!restricted) {
          // دور غير مقيَّد ← لا مجموعات (تُمسح عند التحويل من تعبئة/مشغل)
          await tx.userInventoryGroup.deleteMany({ where: { userId: target.id } });
        } else if (newGroupIds !== undefined) {
          await tx.userInventoryGroup.deleteMany({ where: { userId: target.id } });
          if (newGroupIds.length > 0) await tx.userInventoryGroup.createMany({ data: newGroupIds.map((groupId) => ({ userId: target.id, groupId })) });
        }
        return u;
      });
      if (body.role !== undefined && body.role !== target.role) {
        await notify({
          recipients: [target.id],
          actor,
          type: "ROLE_CHANGED",
          title: "تغيير الصلاحيات",
          message: `غيّر ${actor.name} صلاحيات حسابك إلى «${ROLE_LABEL[body.role]}»`,
        });
      }
      res.json({ user: await presentUser(updated) });
    } catch (e) {
      if (isUniqueViolation(e)) throw conflict("اسم المستخدم أو البريد الإلكتروني مستخدم بالفعل");
      throw e;
    }
  })
);

usersRouter.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    const actor = req.user!;
    const db = prisma();
    const purge = req.query.purge === "true";
    const target = await db.user.findUnique({ where: { id: idOf(req.params.id) } });
    if (!target) throw notFound("المستخدم غير موجود");
    if (target.isSystemUser) throw new HttpError(403, "مستخدمو النظام لا يُحذفون", "SYSTEM_USER");
    if (target.id === actor.id) throw badRequest("لا يمكنك حذف حسابك بنفسك");
    if (target.role === "ADMIN" && actor.role !== "ADMIN") throw forbidden("لا يمكنك حذف حساب المدير العام");

    if (!purge) {
      // بيانات تاريخية مرتبطة ← التعطيل بدل الحذف (الواجهة تعرض خيار حذف الكل أو التعطيل)
      const [tasks, logs, comments, feedback, goals, events, attendance, products, stockMoves, salesOrders] = await Promise.all([
        db.task.count({ where: { OR: [{ createdById: target.id }, { assignedToId: target.id }] } }),
        db.taskTimeLog.count({ where: { userId: target.id } }),
        db.taskComment.count({ where: { userId: target.id } }),
        db.feedback.count({ where: { createdById: target.id } }),
        db.goal.count({ where: { createdById: target.id } }),
        db.calendarEvent.count({ where: { createdById: target.id } }),
        db.attendanceSession.count({ where: { userId: target.id } }),
        db.product.count({ where: { createdById: target.id } }),
        db.inventoryMovement.count({ where: { createdById: target.id } }),
        db.salesOrder.count({ where: { createdById: target.id } }),
      ]);
      if (tasks + logs + comments + feedback + goals + events + attendance + products + stockMoves + salesOrders > 0) {
        throw new HttpError(409, "لهذا المستخدم بيانات مرتبطة (مهام/ملاحظات/...). عطّل الحساب بدلاً من حذفه", "HAS_DATA");
      }
      await db.user.delete({ where: { id: target.id } });
      res.json({ ok: true });
      return;
    }

    // ---- حذف الحساب مع كل بياناته ----
    // مرفقات المهام (وكل أحفادها بالـ cascade) والملاحظات تُجمع قبل الحذف لتنظيف R2 بعده.
    const rootTasks = await db.task.findMany({
      where: { OR: [{ createdById: target.id }, { assignedToId: target.id }] },
      select: { id: true, attachments: true },
    });
    const keys = rootTasks.flatMap((t) => keysOf(t.attachments));
    let frontier = rootTasks.map((t) => t.id);
    const seen = new Set(frontier);
    while (frontier.length > 0) {
      const kids = await db.task.findMany({
        where: { parentId: { in: frontier }, id: { notIn: [...seen] } },
        select: { id: true, attachments: true },
      });
      kids.forEach((k) => seen.add(k.id));
      keys.push(...kids.flatMap((k) => keysOf(k.attachments)));
      frontier = kids.map((k) => k.id);
    }
    const feedbackRows = await db.feedback.findMany({ where: { createdById: target.id }, select: { attachments: true } });
    keys.push(...feedbackRows.flatMap((r) => keysOf(r.attachments)));

    await db.$transaction([
      // مهام المستخدم (أنشأها أو مُسندة إليه): الفرعية والسجلات والتعليقات تُحذف بالـ cascade
      db.task.deleteMany({ where: { OR: [{ createdById: target.id }, { assignedToId: target.id }] } }),
      // سجلاته وتعليقاته على مهام الآخرين
      db.taskTimeLog.deleteMany({ where: { userId: target.id } }),
      db.taskComment.deleteMany({ where: { userId: target.id } }),
      db.feedback.deleteMany({ where: { createdById: target.id } }),
      db.goal.deleteMany({ where: { createdById: target.id } }),
      db.calendarEvent.deleteMany({ where: { createdById: target.id } }),
      db.attendanceSession.deleteMany({ where: { userId: target.id } }),
      // المنتجات كتالوج مشترك: لا تُحذف، تُنقل نسبتها لمن يجري الحذف
      db.product.updateMany({ where: { createdById: target.id }, data: { createdById: actor.id } }),
      // حركات المخزون سجل تدقيق مشترك: لا تُحذف، تُنقل نسبتها لمن يجري الحذف
      db.inventoryMovement.updateMany({ where: { createdById: target.id }, data: { createdById: actor.id } }),
      // أوردرات المبيعات سجل مشترك: لا تُحذف، تُنقل نسبتها لمن يجري الحذف
      db.salesOrder.updateMany({ where: { createdById: target.id }, data: { createdById: actor.id } }),
      db.user.delete({ where: { id: target.id } }),
    ]);
    await deleteUnreferencedObjects(keys);
    res.json({ ok: true });
  })
);
