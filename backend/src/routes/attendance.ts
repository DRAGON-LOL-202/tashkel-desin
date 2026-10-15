import { Router } from "express";
import { prisma } from "../db.js";
import { isStaff, requireAuth, requireRole, requireStaff } from "../middleware/auth.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { conflict, notFound } from "../utils/httpError.js";
import { serializeSession, workDateOf } from "../utils/attendance.js";
import { monthQuerySchema } from "../validators/attendance.js";

// كل مستخدم يسجّل حضوره وانصرافه بنفسه فقط (الـ userId دائماً من التوكن). الإدارة ترى الجميع.
export const attendanceRouter = Router();
attendanceRouter.use(requireAuth);

const orderBy = [{ startTime: "asc" as const }, { id: "asc" as const }];

// حالة اليوم: جلسات اليوم الحالي + أي جلسة ما زالت مفتوحة (مثلاً بدأت أمس وعبرت منتصف الليل).
// المصمم يرى جلساته فقط؛ الإدارة الكل.
attendanceRouter.get(
  "/today",
  asyncHandler(async (req, res) => {
    const me = req.user!;
    const today = workDateOf(new Date());
    const sessions = await prisma().attendanceSession.findMany({
      where: {
        ...(isStaff(me) ? {} : { userId: me.id }),
        OR: [{ workDate: today }, { endTime: null }],
      },
      orderBy,
    });
    res.json({ today, sessions: sessions.map(serializeSession) });
  })
);

// حضور (أول جلسة في اليوم) أو عودة (جلسة جديدة منفصلة بعد انصراف) — نفس العملية على الخادم.
// قفل صف المستخدم يمنع جلستين مفتوحتين عند ضغطتين متزامنتين.
attendanceRouter.post(
  "/check-in",
  asyncHandler(async (req, res) => {
    const me = req.user!;
    const created = await prisma().$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${me.id} FOR UPDATE`;
      const open = await tx.attendanceSession.findFirst({ where: { userId: me.id, endTime: null } });
      if (open) throw conflict("لديك جلسة حضور مفتوحة بالفعل");
      const now = new Date();
      return tx.attendanceSession.create({ data: { userId: me.id, workDate: workDateOf(now), startTime: now } });
    });
    res.status(201).json({ session: serializeSession(created) });
  })
);

attendanceRouter.post(
  "/check-out",
  asyncHandler(async (req, res) => {
    const me = req.user!;
    const closed = await prisma().$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${me.id} FOR UPDATE`;
      const open = await tx.attendanceSession.findFirst({ where: { userId: me.id, endTime: null }, orderBy: { startTime: "desc" } });
      if (!open) throw conflict("لا توجد جلسة حضور مفتوحة لتسجيل الانصراف");
      return tx.attendanceSession.update({ where: { id: open.id }, data: { endTime: new Date() } });
    });
    res.json({ session: serializeSession(closed) });
  })
);

// كل جلسات شهر (حسب يوم البداية) لجميع المستخدمين — لجدول الحضور الشهري في لوحة الفريق (إدارة فقط)
attendanceRouter.get(
  "/month",
  requireStaff,
  asyncHandler(async (req, res) => {
    const { month } = monthQuerySchema.parse(req.query);
    const sessions = await prisma().attendanceSession.findMany({
      where: { workDate: { gte: `${month}-01`, lte: `${month}-31` } },
      orderBy: [{ workDate: "asc" as const }, ...orderBy],
    });
    res.json({ month, today: workDateOf(new Date()), sessions: sessions.map(serializeSession) });
  })
);

// حذف جلسة (أي مستخدم، مفتوحة أو مغلقة) — لمدير النظام ADMIN فقط، لتصحيح الأخطاء ونسيان الانصراف
attendanceRouter.delete(
  "/:id",
  requireRole("ADMIN"),
  asyncHandler(async (req, res) => {
    const id = typeof req.params.id === "string" && req.params.id.length <= 64 ? req.params.id : "";
    const deleted = await prisma().attendanceSession.deleteMany({ where: { id } });
    if (deleted.count === 0) throw notFound("جلسة الحضور غير موجودة");
    res.json({ ok: true });
  })
);
