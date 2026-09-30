import { Router } from "express";
import type { Prisma } from "../generated/prisma/client.ts";
import { prisma } from "../db.js";
import { requireAuth, requireStaff } from "../middleware/auth.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { badRequest, notFound } from "../utils/httpError.js";
import { defaultEndDate, goalInclude, resolveGoalStatus, serializeGoal } from "../utils/goalSerialize.js";
import { createGoalSchema, listGoalsQuerySchema, updateGoalSchema } from "../validators/goals.js";

// الأهداف للإدارة فقط (ADMIN/MANAGER)؛ المصمم لا يصل إليها (403).
export const goalsRouter = Router();
goalsRouter.use(requireAuth, requireStaff);

const idOf = (v: unknown) => (typeof v === "string" && v.length > 0 && v.length <= 64 ? v : "");

async function getGoal(rawId: unknown) {
  const item = await prisma().goal.findUnique({ where: { id: idOf(rawId) }, include: goalInclude });
  if (!item) throw notFound("الهدف غير موجود");
  return item;
}

goalsRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const q = listGoalsQuerySchema.parse(req.query);
    const where: Prisma.GoalWhereInput = {};
    if (q.type) where.type = q.type;
    if (q.status) where.status = q.status;
    const items = await prisma().goal.findMany({
      where,
      include: goalInclude,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    });
    res.json({ goals: items.map(serializeGoal) });
  })
);

goalsRouter.post(
  "/",
  asyncHandler(async (req, res) => {
    const body = createGoalSchema.parse(req.body);
    const created = await prisma().goal.create({
      data: {
        title: body.title,
        description: body.description || null,
        type: body.type,
        target: body.target,
        current: body.current,
        startDate: body.startDate,
        endDate: body.endDate ?? defaultEndDate(body.type, body.startDate),
        status: resolveGoalStatus({ current: body.current, target: body.target, requested: body.status }),
        createdById: req.user!.id, // دائماً المستخدم الحالي
      },
      include: goalInclude,
    });
    res.status(201).json({ goal: serializeGoal(created) });
  })
);

goalsRouter.get(
  "/:id",
  asyncHandler(async (req, res) => {
    res.json({ goal: serializeGoal(await getGoal(req.params.id)) });
  })
);

goalsRouter.patch(
  "/:id",
  asyncHandler(async (req, res) => {
    const existing = await getGoal(req.params.id);
    const body = updateGoalSchema.parse(req.body);

    const target = body.target ?? existing.target;
    const current = body.current ?? existing.current;
    const startDate = body.startDate ?? existing.startDate;
    const endDate = body.endDate ?? existing.endDate;
    if (endDate < startDate) throw badRequest("تاريخ النهاية قبل البداية");

    const data: Prisma.GoalUpdateInput = {
      target,
      current,
      startDate,
      endDate,
      status: resolveGoalStatus({ current, target, requested: body.status, previous: existing.status }),
    };
    if (body.title !== undefined) data.title = body.title;
    if (body.description !== undefined) data.description = body.description || null;
    if (body.type !== undefined) data.type = body.type;

    const updated = await prisma().goal.update({ where: { id: existing.id }, data, include: goalInclude });
    res.json({ goal: serializeGoal(updated) });
  })
);

goalsRouter.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    const existing = await getGoal(req.params.id);
    await prisma().goal.delete({ where: { id: existing.id } });
    res.json({ ok: true });
  })
);
