import { Router } from "express";
import { prisma } from "../db.js";
import { requireAuth, requireRole, requireStaff } from "../middleware/auth.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { badRequest, conflict, notFound } from "../utils/httpError.js";
import {
  inventoryItemInclude,
  num3,
  serializeInventoryCategory,
  serializeInventoryItem,
  serializeInventoryMovement,
} from "../utils/inventorySerialize.js";
import { assertAttachmentsAllowed, deleteStoredObjects } from "../utils/attachments.js";
import { keysOf, removedKeys } from "../utils/attachmentKeys.ts";
import { randomUUID } from "node:crypto";
import { createCategorySchema, createItemSchema, createMovementSchema, round3, updateItemSchema, withdrawSchema } from "../validators/inventory.js";

// الصلاحيات (مبدئية — تُطابَق مع untitled.txt): أي مستخدم مسجّل يرى المخزون،
// والإضافة/التعديل/الحركات اليدوية للإدارة (ADMIN/MANAGER)، والحذف النهائي للمدير العام فقط.
// السحب (POST /withdrawals) متاح لكل مستخدم مسجّل، والرصيد يُخصم مباشرة.
export const inventoryRouter = Router();
inventoryRouter.use(requireAuth);

const MOVEMENT_INCLUDE = { createdBy: { select: { id: true, name: true } }, item: { select: { name: true, unit: true } } } as const;

const idOf = (v: unknown) => (typeof v === "string" && v.length > 0 && v.length <= 64 ? v : "");

const isUniqueViolation = (e: unknown) => (e as { code?: string })?.code === "P2002";

async function assertCategoryExists(categoryId: string) {
  const c = await prisma().inventoryCategory.findUnique({ where: { id: idOf(categoryId) }, select: { id: true } });
  if (!c) throw badRequest("التصنيف غير موجود");
}

async function getItem(rawId: unknown) {
  const item = await prisma().inventoryItem.findUnique({ where: { id: idOf(rawId) }, include: inventoryItemInclude });
  if (!item) throw notFound("عنصر المخزون غير موجود");
  return item;
}

// ===== القائمة =====
inventoryRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const q = typeof req.query.q === "string" ? req.query.q.trim().slice(0, 100) : "";
    const includeInactive = req.query.includeInactive === "true";
    const items = await prisma().inventoryItem.findMany({
      where: {
        ...(includeInactive ? {} : { isActive: true }),
        ...(typeof req.query.categoryId === "string" && req.query.categoryId ? { categoryId: idOf(req.query.categoryId) } : {}),
        ...(q
          ? { OR: [{ name: { contains: q, mode: "insensitive" } }, { sku: { contains: q, mode: "insensitive" } }] }
          : {}),
      },
      include: inventoryItemInclude,
      orderBy: [{ name: "asc" }, { id: "asc" }],
    });
    let rows = items.map(serializeInventoryItem);
    if (req.query.lowOnly === "true") rows = rows.filter((i) => i.isLow);
    res.json({ items: rows });
  })
);

// ===== التصنيفات (المسارات الثابتة قبل /:id) =====
inventoryRouter.get(
  "/categories",
  asyncHandler(async (_req, res) => {
    const items = await prisma().inventoryCategory.findMany({ orderBy: [{ createdAt: "asc" }, { id: "asc" }] });
    res.json({ categories: items.map(serializeInventoryCategory) });
  })
);

inventoryRouter.post(
  "/categories",
  requireStaff,
  asyncHandler(async (req, res) => {
    const { name } = createCategorySchema.parse(req.body);
    const dup = await prisma().inventoryCategory.findFirst({ where: { name: { equals: name, mode: "insensitive" } } });
    if (dup) throw conflict("هذا التصنيف موجود مسبقاً");
    const created = await prisma().inventoryCategory.create({ data: { name } });
    res.status(201).json({ category: serializeInventoryCategory(created) });
  })
);

// ===== السحب من المخزون (لكل مستخدم مسجّل) =====
// طلب واحد بعدة أصناف: كله أو لا شيء. تُقفل صفوف الأصناف مرتبة بالمعرّف (يمنع الجمود بين طلبين متزامنين)،
// ثم يُتحقق من الرصيد وتُسجَّل حركة OUT لكل صنف بنفس batchId.
inventoryRouter.post(
  "/withdrawals",
  asyncHandler(async (req, res) => {
    const body = withdrawSchema.parse(req.body);
    const userId = req.user!.id;
    const ids = body.lines.map((l) => idOf(l.itemId)).sort();
    if (ids.some((id) => id === "")) throw badRequest("صنف غير صالح");
    const batchId = randomUUID();

    const movements = await prisma().$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "InventoryItem" WHERE "id" = ANY(${ids}::text[]) ORDER BY "id" FOR UPDATE`;
      const items = await tx.inventoryItem.findMany({ where: { id: { in: ids } } });
      const byId = new Map(items.map((i) => [i.id, i]));
      const created: { id: string }[] = [];
      for (const line of [...body.lines].sort((a, b) => (a.itemId < b.itemId ? -1 : 1))) {
        const item = byId.get(line.itemId);
        if (!item) throw notFound("أحد الأصناف غير موجود");
        if (!item.isActive) throw badRequest(`«${item.name}» غير مفعّل`);
        const before = num3(item.quantity);
        const after = round3(before - line.quantity);
        if (after < 0) throw conflict(`الرصيد غير كافٍ لـ «${item.name}» (المتاح ${before} ${item.unit})`);
        await tx.inventoryItem.update({ where: { id: item.id }, data: { quantity: after } });
        created.push(
          await tx.inventoryMovement.create({
            data: { itemId: item.id, type: "OUT", delta: -line.quantity, balanceAfter: after, note: body.note, batchId, createdById: userId },
            select: { id: true },
          })
        );
      }
      return tx.inventoryMovement.findMany({
        where: { id: { in: created.map((c) => c.id) } },
        include: MOVEMENT_INCLUDE,
        orderBy: [{ id: "asc" }],
      });
    });
    res.status(201).json({ batchId, movements: movements.map(serializeInventoryMovement) });
  })
);

// سجل السحوبات: الإدارة ترى الجميع، والمصمم يرى سحوباته فقط.
inventoryRouter.get(
  "/withdrawals",
  asyncHandler(async (req, res) => {
    const raw = Number(req.query.limit);
    const limit = Number.isInteger(raw) && raw > 0 ? Math.min(raw, 500) : 200;
    const staff = req.user!.role === "ADMIN" || req.user!.role === "MANAGER";
    const rows = await prisma().inventoryMovement.findMany({
      where: { batchId: { not: null }, ...(staff ? {} : { createdById: req.user!.id }) },
      include: MOVEMENT_INCLUDE,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: limit,
    });
    res.json({ movements: rows.map(serializeInventoryMovement) });
  })
);

// ===== سجل حركات عنصر =====
inventoryRouter.get(
  "/:id/movements",
  asyncHandler(async (req, res) => {
    const item = await getItem(req.params.id);
    const raw = Number(req.query.limit);
    const limit = Number.isInteger(raw) && raw > 0 ? Math.min(raw, 500) : 100;
    const rows = await prisma().inventoryMovement.findMany({
      where: { itemId: item.id },
      include: MOVEMENT_INCLUDE,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: limit,
    });
    res.json({ movements: rows.map(serializeInventoryMovement) });
  })
);

// ===== إنشاء عنصر =====
inventoryRouter.post(
  "/",
  requireStaff,
  asyncHandler(async (req, res) => {
    const body = createItemSchema.parse(req.body);
    await assertCategoryExists(body.categoryId);
    await assertAttachmentsAllowed(req.user!.id, "inventory", body.attachments, []);
    try {
      const created = await prisma().$transaction(async (tx) => {
        const item = await tx.inventoryItem.create({
          data: {
            name: body.name,
            categoryId: body.categoryId,
            attachments: body.attachments,
            sku: body.sku ?? null,
            unit: body.unit,
            minQuantity: body.minQuantity,
            quantity: body.initialQuantity,
            notes: body.notes,
          },
        });
        // الرصيد الافتتاحي يُسجَّل كحركة إدخال ليبقى السجل مطابقاً للرصيد دائماً
        if (body.initialQuantity > 0) {
          await tx.inventoryMovement.create({
            data: {
              itemId: item.id,
              type: "IN",
              delta: body.initialQuantity,
              balanceAfter: body.initialQuantity,
              note: "رصيد افتتاحي",
              createdById: req.user!.id,
            },
          });
        }
        return tx.inventoryItem.findUniqueOrThrow({ where: { id: item.id }, include: inventoryItemInclude });
      });
      res.status(201).json({ item: serializeInventoryItem(created) });
    } catch (e) {
      if (isUniqueViolation(e)) throw conflict("كود المنتج مستخدم مسبقاً");
      throw e;
    }
  })
);

// ===== تعديل بيانات عنصر (الرصيد يتغيّر بالحركات فقط) =====
inventoryRouter.patch(
  "/:id",
  requireStaff,
  asyncHandler(async (req, res) => {
    const existing = await getItem(req.params.id);
    const body = updateItemSchema.parse(req.body);
    if (body.categoryId !== undefined) await assertCategoryExists(body.categoryId);
    if (body.attachments !== undefined) await assertAttachmentsAllowed(req.user!.id, "inventory", body.attachments, existing.attachments);
    try {
      const updated = await prisma().inventoryItem.update({
        where: { id: existing.id },
        data: {
          ...(body.name !== undefined ? { name: body.name } : {}),
          ...(body.categoryId !== undefined ? { categoryId: body.categoryId } : {}),
          ...(body.attachments !== undefined ? { attachments: body.attachments } : {}),
          ...(body.sku !== undefined ? { sku: body.sku } : {}),
          ...(body.unit !== undefined ? { unit: body.unit } : {}),
          ...(body.minQuantity !== undefined ? { minQuantity: body.minQuantity } : {}),
          ...(body.notes !== undefined ? { notes: body.notes } : {}),
          ...(body.isActive !== undefined ? { isActive: body.isActive } : {}),
        },
        include: inventoryItemInclude,
      });
      if (body.attachments !== undefined) await deleteStoredObjects(removedKeys(existing.attachments, body.attachments));
      res.json({ item: serializeInventoryItem(updated) });
    } catch (e) {
      if (isUniqueViolation(e)) throw conflict("كود المنتج مستخدم مسبقاً");
      throw e;
    }
  })
);

// ===== حركة مخزون (إدخال / إخراج / جرد) =====
// تُنفَّذ داخل معاملة واحدة مع قفل صف العنصر (FOR UPDATE): تسلسل الحركات المتزامنة على نفس العنصر،
// فلا يضيع تحديث ولا يهبط الرصيد تحت الصفر (يمنعه فحص هنا + قيد CHECK في قاعدة البيانات).
inventoryRouter.post(
  "/:id/movements",
  requireStaff,
  asyncHandler(async (req, res) => {
    const itemId = idOf(req.params.id);
    const body = createMovementSchema.parse(req.body);
    const userId = req.user!.id;

    const result = await prisma().$transaction(async (tx) => {
      const locked = await tx.$queryRaw<{ id: string }[]>`SELECT "id" FROM "InventoryItem" WHERE "id" = ${itemId} FOR UPDATE`;
      if (locked.length === 0) throw notFound("عنصر المخزون غير موجود");
      const current = await tx.inventoryItem.findUniqueOrThrow({ where: { id: itemId }, select: { quantity: true, isActive: true } });
      if (!current.isActive) throw badRequest("العنصر غير مفعّل");

      const before = num3(current.quantity);
      let after: number;
      if (body.type === "IN") after = round3(before + body.quantity);
      else if (body.type === "OUT") after = round3(before - body.quantity);
      else after = body.quantity;

      if (after < 0) throw conflict(`الرصيد غير كافٍ (المتاح ${before})`);
      const delta = round3(after - before);

      await tx.inventoryItem.update({ where: { id: itemId }, data: { quantity: after } });
      const movement = await tx.inventoryMovement.create({
        data: { itemId, type: body.type, delta, balanceAfter: after, note: body.note, createdById: userId },
        include: MOVEMENT_INCLUDE,
      });
      const item = await tx.inventoryItem.findUniqueOrThrow({ where: { id: itemId }, include: inventoryItemInclude });
      return { item, movement };
    });

    res.status(201).json({ item: serializeInventoryItem(result.item), movement: serializeInventoryMovement(result.movement) });
  })
);

// ===== حذف نهائي (المدير العام فقط) — يحذف سجل حركاته أيضاً؛ الأفضل التعطيل عبر isActive =====
inventoryRouter.delete(
  "/:id",
  requireRole("ADMIN"),
  asyncHandler(async (req, res) => {
    const existing = await getItem(req.params.id);
    await prisma().inventoryItem.delete({ where: { id: existing.id } });
    await deleteStoredObjects(keysOf(existing.attachments));
    res.json({ ok: true });
  })
);
