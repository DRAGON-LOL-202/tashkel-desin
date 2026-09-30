import { Router } from "express";
import type { Prisma, User } from "../generated/prisma/client.ts";
import { prisma } from "../db.js";
import { isStaff, requireAuth, requireStaff } from "../middleware/auth.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { forbidden, notFound } from "../utils/httpError.js";
import { feedbackInclude, serializeFeedback } from "../utils/feedbackSerialize.js";
import { assertAttachmentsAllowed, deleteStoredObjects } from "../utils/attachments.js";
import { keysOf, removedKeys } from "../utils/attachmentKeys.ts";
import {
  bulkDeleteSchema,
  createFeedbackSchema,
  listFeedbackQuerySchema,
  updateFeedbackSchema,
} from "../validators/feedback.js";

export const feedbackRouter = Router();
feedbackRouter.use(requireAuth);

const idOf = (v: unknown) => (typeof v === "string" && v.length > 0 && v.length <= 64 ? v : "");

// المصمم يصل إلى ملاحظاته هو فقط؛ ADMIN/MANAGER إلى الكل.
async function getFeedbackFor(user: User, rawId: unknown) {
  const item = await prisma().feedback.findUnique({ where: { id: idOf(rawId) }, include: feedbackInclude });
  if (!item) throw notFound("الملاحظة غير موجودة");
  if (!isStaff(user) && item.createdById !== user.id) throw forbidden("هذه الملاحظة ليست لك");
  return item;
}

feedbackRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const user = req.user!;
    const q = listFeedbackQuerySchema.parse(req.query);
    const where: Prisma.FeedbackWhereInput = {};
    if (!isStaff(user)) where.createdById = user.id;
    if (q.type) where.type = q.type;
    if (q.status) where.status = q.status;
    if (q.from || q.to) where.date = { ...(q.from ? { gte: q.from } : {}), ...(q.to ? { lte: q.to } : {}) };
    const items = await prisma().feedback.findMany({
      where,
      include: feedbackInclude,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    });
    res.json({ feedback: items.map(serializeFeedback) });
  })
);

// المصمم: إنشاء فقط. createdById دائماً المستخدم الحالي.
feedbackRouter.post(
  "/",
  asyncHandler(async (req, res) => {
    const user = req.user!;
    const body = createFeedbackSchema.parse(req.body);
    await assertAttachmentsAllowed(user.id, "feedback", body.attachments ?? [], []);
    const created = await prisma().feedback.create({
      data: {
        title: body.title,
        description: body.description,
        attachments: body.attachments ?? [],
        type: body.type,
        date: body.date,
        createdById: user.id,
      },
      include: feedbackInclude,
    });
    res.status(201).json({ feedback: serializeFeedback(created) });
  })
);

// المسار الثابت قبل /:id
feedbackRouter.post(
  "/bulk-delete",
  requireStaff,
  asyncHandler(async (req, res) => {
    const body = bulkDeleteSchema.parse(req.body ?? {});
    const where: Prisma.FeedbackWhereInput = {};
    if (body.type) where.type = body.type;
    if (body.fromDate || body.toDate) {
      where.date = { ...(body.fromDate ? { gte: body.fromDate } : {}), ...(body.toDate ? { lte: body.toDate } : {}) };
    }
    const doomed = await prisma().feedback.findMany({ where, select: { attachments: true } });
    const result = await prisma().feedback.deleteMany({ where });
    await deleteStoredObjects(doomed.flatMap((r) => keysOf(r.attachments)));
    res.json({ ok: true, deleted: result.count });
  })
);

feedbackRouter.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const item = await getFeedbackFor(req.user!, req.params.id);
    res.json({ feedback: serializeFeedback(item) });
  })
);

feedbackRouter.patch(
  "/:id",
  requireStaff,
  asyncHandler(async (req, res) => {
    const existing = await getFeedbackFor(req.user!, req.params.id);
    const body = updateFeedbackSchema.parse(req.body);
    if (body.attachments !== undefined) await assertAttachmentsAllowed(req.user!.id, "feedback", body.attachments, existing.attachments);
    const data: Prisma.FeedbackUpdateInput = {};
    if (body.title !== undefined) data.title = body.title;
    if (body.description !== undefined) data.description = body.description;
    if (body.attachments !== undefined) data.attachments = body.attachments;
    if (body.type !== undefined) data.type = body.type;
    if (body.date !== undefined) data.date = body.date;
    if (body.status !== undefined) data.status = body.status;
    const updated = await prisma().feedback.update({ where: { id: existing.id }, data, include: feedbackInclude });
    if (body.attachments !== undefined) await deleteStoredObjects(removedKeys(existing.attachments, body.attachments));
    res.json({ feedback: serializeFeedback(updated) });
  })
);

feedbackRouter.delete(
  "/:id",
  requireStaff,
  asyncHandler(async (req, res) => {
    const existing = await getFeedbackFor(req.user!, req.params.id);
    await prisma().feedback.delete({ where: { id: existing.id } });
    await deleteStoredObjects(keysOf(existing.attachments));
    res.json({ ok: true });
  })
);
