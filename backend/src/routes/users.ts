import { Router } from "express";
import bcrypt from "bcryptjs";
import type { User } from "../generated/prisma/client.ts";
import { prisma } from "../db.js";
import { requireAuth, requireStaff } from "../middleware/auth.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { badRequest, conflict, forbidden, HttpError, notFound } from "../utils/httpError.js";
import { publicUser } from "../utils/serialize.js";
import { createUserSchema, statusSchema, updateProfileSchema, updateUserSchema } from "../validators/users.js";

export const usersRouter = Router();
usersRouter.use(requireAuth);

type UserPatch = Partial<Pick<User, "name" | "username" | "email" | "role" | "jobTitle" | "passwordHash">>;
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
    res.json({ users: users.map(publicUser) });
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
    try {
      const user = await db.user.create({
        data: {
          name: body.name,
          username: body.username,
          email: body.email,
          passwordHash: await bcrypt.hash(body.password, 12),
          role: body.role,
          ...(body.jobTitle ? { jobTitle: body.jobTitle } : {}),
          isSystemUser: false,
        },
      });
      res.status(201).json({ user: publicUser(user) });
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
    res.json({ user: publicUser(user) });
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
    res.json({ user: publicUser(updated) });
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
    if (body.role !== undefined) data.role = body.role;
    if (body.jobTitle !== undefined) data.jobTitle = body.jobTitle;
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
      const updated = await db.user.update({ where: { id: target.id }, data });
      res.json({ user: publicUser(updated) });
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
    const target = await db.user.findUnique({ where: { id: idOf(req.params.id) } });
    if (!target) throw notFound("المستخدم غير موجود");
    if (target.isSystemUser) throw new HttpError(403, "مستخدمو النظام لا يُحذفون", "SYSTEM_USER");
    if (target.id === actor.id) throw badRequest("لا يمكنك حذف حسابك بنفسك");
    if (target.role === "ADMIN" && actor.role !== "ADMIN") throw forbidden("لا يمكنك حذف حساب المدير العام");

    // بيانات تاريخية مرتبطة ← التعطيل بدل الحذف
    const [tasks, logs, comments, feedback, goals, events] = await Promise.all([
      db.task.count({ where: { OR: [{ createdById: target.id }, { assignedToId: target.id }] } }),
      db.taskTimeLog.count({ where: { userId: target.id } }),
      db.taskComment.count({ where: { userId: target.id } }),
      db.feedback.count({ where: { createdById: target.id } }),
      db.goal.count({ where: { createdById: target.id } }),
      db.calendarEvent.count({ where: { createdById: target.id } }),
    ]);
    if (tasks + logs + comments + feedback + goals + events > 0) {
      throw conflict("لهذا المستخدم بيانات مرتبطة (مهام/ملاحظات/...). عطّل الحساب بدلاً من حذفه");
    }
    await db.user.delete({ where: { id: target.id } });
    res.json({ ok: true });
  })
);
