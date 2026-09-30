import { Router } from "express";
import type { Prisma } from "../generated/prisma/client.ts";
import { prisma } from "../db.js";
import { requireAuth, requireStaff } from "../middleware/auth.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { badRequest, notFound } from "../utils/httpError.js";
import { calendarEventInclude, serializeCalendarEvent } from "../utils/calendarEventSerialize.js";
import {
  createCalendarEventSchema,
  listCalendarEventsQuerySchema,
  updateCalendarEventSchema,
} from "../validators/calendarEvents.js";

// التقويم السنوي للإدارة فقط (ADMIN/MANAGER)؛ المصمم لا يصل إليه (403).
export const calendarEventsRouter = Router();
calendarEventsRouter.use(requireAuth, requireStaff);

const idOf = (v: unknown) => (typeof v === "string" && v.length > 0 && v.length <= 64 ? v : "");

async function getEvent(rawId: unknown) {
  const item = await prisma().calendarEvent.findUnique({ where: { id: idOf(rawId) }, include: calendarEventInclude });
  if (!item) throw notFound("الحدث غير موجود");
  return item;
}

calendarEventsRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const q = listCalendarEventsQuerySchema.parse(req.query);
    const where: Prisma.CalendarEventWhereInput = {};
    // تداخل: الحدث ينتهي بعد from ويبدأ قبل to
    if (q.from) where.endDate = { gte: q.from };
    if (q.to) where.startDate = { lte: q.to };
    const items = await prisma().calendarEvent.findMany({
      where,
      include: calendarEventInclude,
      orderBy: [{ startDate: "asc" }, { id: "asc" }],
    });
    res.json({ events: items.map(serializeCalendarEvent) });
  })
);

calendarEventsRouter.post(
  "/",
  asyncHandler(async (req, res) => {
    const body = createCalendarEventSchema.parse(req.body);
    const created = await prisma().calendarEvent.create({
      data: {
        title: body.title,
        description: body.description || null,
        startDate: body.startDate,
        endDate: body.endDate,
        ...(body.color ? { color: body.color } : {}),
        createdById: req.user!.id, // دائماً المستخدم الحالي
      },
      include: calendarEventInclude,
    });
    res.status(201).json({ event: serializeCalendarEvent(created) });
  })
);

calendarEventsRouter.get(
  "/:id",
  asyncHandler(async (req, res) => {
    res.json({ event: serializeCalendarEvent(await getEvent(req.params.id)) });
  })
);

calendarEventsRouter.patch(
  "/:id",
  asyncHandler(async (req, res) => {
    const existing = await getEvent(req.params.id);
    const body = updateCalendarEventSchema.parse(req.body);

    const startDate = body.startDate ?? existing.startDate;
    const endDate = body.endDate ?? existing.endDate;
    if (endDate < startDate) throw badRequest("تاريخ النهاية قبل البداية");

    const data: Prisma.CalendarEventUpdateInput = { startDate, endDate };
    if (body.title !== undefined) data.title = body.title;
    if (body.description !== undefined) data.description = body.description || null;
    if (body.color !== undefined) data.color = body.color;

    const updated = await prisma().calendarEvent.update({ where: { id: existing.id }, data, include: calendarEventInclude });
    res.json({ event: serializeCalendarEvent(updated) });
  })
);

calendarEventsRouter.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    const existing = await getEvent(req.params.id);
    await prisma().calendarEvent.delete({ where: { id: existing.id } });
    res.json({ ok: true });
  })
);
