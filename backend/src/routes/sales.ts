import { Router } from "express";
import type { Prisma, SalesOrderStatus } from "../generated/prisma/client.ts";
import { prisma } from "../db.js";
import { requireAuth, requireStaff } from "../middleware/auth.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { badRequest, conflict, notFound } from "../utils/httpError.js";
import { num2, num3 } from "../utils/inventorySerialize.js";
import { handleLowStockTransition, type LowStockTransition } from "../utils/inventoryLowStock.js";
import { salesOrderInclude, salesProductInclude, serializeSalesOrder, serializeSalesProduct } from "../utils/salesSerialize.js";
import {
  addLineSchema,
  createOrderSchema,
  createProductSchema,
  updateLineSchema,
  updateOrderSchema,
  updateProductSchema,
} from "../validators/sales.js";
import { round3 } from "../validators/inventory.js";

// المبيعات الإلكترونية: للإدارة (ADMIN / MANAGER) فقط لأنها تعرض التكلفة وسعر البيع.
// - المنتج الثابت (بوكس) = اسم + محتويات من المخزون؛ تُنسخ محتوياته إلى الأوردر عند إضافته فلا يغيّر تعديل المنتج أوردرات سابقة.
// - الحالات: مسجل ← تم التنفيذ ← شحن ← تم التسليم / مرتجع.
// - «تم التنفيذ/شحن/تم التسليم» تخصم مكونات الأوردر من المخزون مرة واحدة فقط (stockDeducted)؛
//   والرجوع إلى «مسجل» أو «مرتجع» أو حذف الأوردر بعد الخصم يعيد الكميات للمخزون بحركة RETURN.
// - الخصم كله أو لا شيء داخل معاملة واحدة مع قفل صفوف الأصناف مرتبة بالمعرّف (يمنع الجمود وتجاوز الرصيد).
export const salesRouter = Router();
salesRouter.use(requireAuth, requireStaff);

const DEDUCTING = new Set<SalesOrderStatus>(["EXECUTED", "SHIPPED", "DELIVERED"]);

const idOf = (v: unknown) => (typeof v === "string" && v.length > 0 && v.length <= 64 ? v : "");

type Tx = Prisma.TransactionClient;

// ===== أدوات مشتركة =====
async function getOrder(rawId: unknown) {
  const o = await prisma().salesOrder.findUnique({ where: { id: idOf(rawId) }, include: salesOrderInclude });
  if (!o) throw notFound("الأوردر غير موجود");
  return o;
}

async function lockOrder(tx: Tx, orderId: string) {
  const rows = await tx.$queryRaw<{ id: string }[]>`SELECT "id" FROM "SalesOrder" WHERE "id" = ${orderId} FOR UPDATE`;
  if (rows.length === 0) throw notFound("الأوردر غير موجود");
}

async function assertWaybillFree(waybill: string, exceptId?: string) {
  if (!waybill) return;
  const dup = await prisma().salesOrder.findFirst({
    where: { waybill: { equals: waybill, mode: "insensitive" }, ...(exceptId ? { id: { not: exceptId } } : {}) },
    select: { date: true },
  });
  if (dup) throw conflict(`رقم البوليصة «${waybill}» مستخدم في أوردر آخر بتاريخ ${dup.date}`);
}

/** المكوّنات المطلوبة من المخزون لأوردر (مجمّعة لكل صنف) بالألف من الوحدة لتفادي أخطاء الفاصلة العائمة */
function neededByItem(order: { lines: { quantity: number; components: { itemId: string; quantity: { toString(): string } }[] }[] }) {
  const needs = new Map<string, number>();
  for (const l of order.lines) {
    for (const c of l.components) {
      needs.set(c.itemId, (needs.get(c.itemId) ?? 0) + Math.round(num3(c.quantity) * 1000) * l.quantity);
    }
  }
  return needs;
}

const orderLabel = (o: { id: string; waybill: string }) => (o.waybill ? `بوليصة ${o.waybill}` : `أوردر ${o.id.slice(-6)}`);

async function lockItems(tx: Tx, ids: string[]) {
  if (ids.length === 0) return [];
  await tx.$queryRaw`SELECT "id" FROM "InventoryItem" WHERE "id" = ANY(${ids}::text[]) ORDER BY "id" FOR UPDATE`;
  return tx.inventoryItem.findMany({ where: { id: { in: ids } } });
}

/** خصم مكونات الأوردر من المخزون (كله أو لا شيء) وتثبيت الأسعار */
async function deductStock(tx: Tx, order: Awaited<ReturnType<typeof getOrder>>, userId: string): Promise<LowStockTransition[]> {
  const needs = neededByItem(order);
  const ids = [...needs.keys()].sort();
  const byId = new Map((await lockItems(tx, ids)).map((i) => [i.id, i]));

  const problems: string[] = [];
  for (const id of ids) {
    const item = byId.get(id);
    const need = (needs.get(id) ?? 0) / 1000;
    if (!item) problems.push("أحد مكونات الأوردر لم يعد موجوداً في المخزون");
    else if (!item.isActive) problems.push(`«${item.name}» مؤرشف في المخزون`);
    else if (num3(item.quantity) < need) problems.push(`«${item.name}»: المطلوب ${need} والمتاح ${num3(item.quantity)} ${item.unit}`);
  }
  if (problems.length > 0) throw conflict(`لا يمكن تنفيذ الأوردر — ${problems.join(" | ")}`);

  const transitions: LowStockTransition[] = [];
  for (const id of ids) {
    const item = byId.get(id)!;
    const need = (needs.get(id) ?? 0) / 1000;
    const before = num3(item.quantity);
    const after = round3(before - need);
    await tx.inventoryItem.update({ where: { id }, data: { quantity: after } });
    await tx.inventoryMovement.create({
      data: {
        itemId: id,
        type: "OUT",
        previousBalance: before,
        delta: -need,
        balanceAfter: after,
        unitPriceSnapshot: num2(item.unitPrice),
        reason: `مبيعات — ${orderLabel(order)}`,
        referenceId: `sales:${order.id}`,
        note: "خصم تلقائي عند تنفيذ الأوردر",
        createdById: userId,
      },
    });
    transitions.push({
      id,
      name: item.name,
      unit: item.unit,
      beforeQty: before,
      afterQty: after,
      minQty: num3(item.minQuantity),
      wasAlertSent: item.lowAlertSent,
      isActive: item.isActive,
    });
  }

  // تثبيت التكلفة وسعر البيع وقت التنفيذ حتى لا تتغير الأرقام لو تغيّرت أسعار المخزون لاحقاً
  for (const line of order.lines) {
    for (const c of line.components) {
      const item = byId.get(c.itemId)!;
      await tx.salesOrderComponent.update({
        where: { id: c.id },
        data: { unitCostSnapshot: num2(item.unitPrice), unitSellSnapshot: num2(item.sellPrice) },
      });
    }
  }
  return transitions;
}

/** إعادة المكونات المخصومة إلى المخزون (حركة RETURN) */
async function restoreStock(
  tx: Tx,
  order: Awaited<ReturnType<typeof getOrder>>,
  userId: string,
  reason: string,
  clearSnapshots: boolean
): Promise<LowStockTransition[]> {
  const needs = neededByItem(order);
  const ids = [...needs.keys()].sort();
  const byId = new Map((await lockItems(tx, ids)).map((i) => [i.id, i]));
  const transitions: LowStockTransition[] = [];
  for (const id of ids) {
    const item = byId.get(id);
    if (!item) continue;
    const back = (needs.get(id) ?? 0) / 1000;
    const before = num3(item.quantity);
    const after = round3(before + back);
    await tx.inventoryItem.update({ where: { id }, data: { quantity: after } });
    await tx.inventoryMovement.create({
      data: {
        itemId: id,
        type: "RETURN",
        previousBalance: before,
        delta: back,
        balanceAfter: after,
        unitPriceSnapshot: num2(item.unitPrice),
        reason: `${reason} — ${orderLabel(order)}`,
        referenceId: `sales:${order.id}`,
        note: "إعادة تلقائية للمخزون",
        createdById: userId,
      },
    });
    transitions.push({
      id,
      name: item.name,
      unit: item.unit,
      beforeQty: before,
      afterQty: after,
      minQty: num3(item.minQuantity),
      wasAlertSent: item.lowAlertSent,
      isActive: item.isActive,
    });
  }
  if (clearSnapshots) {
    await tx.salesOrderComponent.updateMany({ where: { line: { orderId: order.id } }, data: { unitCostSnapshot: null, unitSellSnapshot: null } });
  }
  return transitions;
}

/** تغيير حالة الأوردر مع ما يلزم من خصم/إعادة. يُستدعى داخل معاملة والأوردر مقفول. */
async function applyStatus(tx: Tx, orderId: string, target: SalesOrderStatus, userId: string): Promise<LowStockTransition[]> {
  const order = await tx.salesOrder.findUniqueOrThrow({ where: { id: orderId }, include: salesOrderInclude });
  const wantDeducted = DEDUCTING.has(target);
  let transitions: LowStockTransition[] = [];
  if (wantDeducted && !order.stockDeducted) {
    transitions = await deductStock(tx, order, userId);
  } else if (!wantDeducted && order.stockDeducted) {
    transitions = await restoreStock(tx, order, userId, target === "RETURNED" ? "مرتجع مبيعات" : "إلغاء تنفيذ أوردر", target === "REGISTERED");
  } else if (target === "REGISTERED") {
    await tx.salesOrderComponent.updateMany({ where: { line: { orderId } }, data: { unitCostSnapshot: null, unitSellSnapshot: null } });
  }
  await tx.salesOrder.update({ where: { id: orderId }, data: { status: target, stockDeducted: wantDeducted } });
  return transitions;
}

async function loadActiveProducts(productIds: string[]) {
  const products = await prisma().salesProduct.findMany({ where: { id: { in: productIds } }, include: salesProductInclude });
  if (products.length !== productIds.length) throw notFound("أحد المنتجات غير موجود");
  for (const p of products) {
    if (!p.isActive) throw badRequest(`«${p.name}» غير مفعّل`);
    if (p.components.length === 0) throw badRequest(`«${p.name}» بلا محتويات`);
  }
  return new Map(products.map((p) => [p.id, p]));
}

const lineCreateData = (p: Awaited<ReturnType<typeof loadActiveProducts>> extends Map<string, infer V> ? V : never, quantity: number) => ({
  productId: p.id,
  productName: p.name,
  quantity,
  components: { create: p.components.map((c) => ({ itemId: c.itemId, quantity: c.quantity })) },
});

async function assertItemsUsable(componentList: { itemId: string }[]) {
  const ids = [...new Set(componentList.map((c) => c.itemId))];
  const items = await prisma().inventoryItem.findMany({ where: { id: { in: ids } }, select: { id: true, name: true, isActive: true } });
  if (items.length !== ids.length) throw badRequest("أحد المكونات غير موجود في المخزون");
  const archived = items.find((i) => !i.isActive);
  if (archived) throw badRequest(`«${archived.name}» مؤرشف ولا يصلح مكوّناً`);
}

async function assertProductNameFree(name: string, exceptId?: string) {
  const dup = await prisma().salesProduct.findFirst({
    where: { name: { equals: name, mode: "insensitive" }, ...(exceptId ? { id: { not: exceptId } } : {}) },
    select: { id: true },
  });
  if (dup) throw conflict("يوجد منتج مبيعات بنفس الاسم");
}

// ===== المنتجات الثابتة =====
salesRouter.get(
  "/products",
  asyncHandler(async (_req, res) => {
    const rows = await prisma().salesProduct.findMany({ include: salesProductInclude, orderBy: [{ name: "asc" }, { id: "asc" }] });
    res.json({ products: rows.map(serializeSalesProduct) });
  })
);

salesRouter.post(
  "/products",
  asyncHandler(async (req, res) => {
    const body = createProductSchema.parse(req.body);
    await assertProductNameFree(body.name);
    await assertItemsUsable(body.components);
    const created = await prisma().salesProduct.create({
      data: { name: body.name, notes: body.notes, components: { create: body.components } },
      include: salesProductInclude,
    });
    res.status(201).json({ product: serializeSalesProduct(created) });
  })
);

salesRouter.patch(
  "/products/:id",
  asyncHandler(async (req, res) => {
    const id = idOf(req.params.id);
    const existing = await prisma().salesProduct.findUnique({ where: { id }, select: { id: true } });
    if (!existing) throw notFound("المنتج غير موجود");
    const body = updateProductSchema.parse(req.body);
    if (body.name !== undefined) await assertProductNameFree(body.name, id);
    if (body.components !== undefined) await assertItemsUsable(body.components);
    const updated = await prisma().$transaction(async (tx) => {
      if (body.components !== undefined) {
        await tx.salesProductComponent.deleteMany({ where: { productId: id } });
        await tx.salesProductComponent.createMany({ data: body.components.map((c) => ({ productId: id, itemId: c.itemId, quantity: c.quantity })) });
      }
      return tx.salesProduct.update({
        where: { id },
        data: {
          ...(body.name !== undefined ? { name: body.name } : {}),
          ...(body.notes !== undefined ? { notes: body.notes } : {}),
          ...(body.isActive !== undefined ? { isActive: body.isActive } : {}),
        },
        include: salesProductInclude,
      });
    });
    res.json({ product: serializeSalesProduct(updated) });
  })
);

// حذف المنتج الثابت لا يمس الأوردرات السابقة (محتوياتها منسوخة واسمه محفوظ في البند)
salesRouter.delete(
  "/products/:id",
  asyncHandler(async (req, res) => {
    const id = idOf(req.params.id);
    const existing = await prisma().salesProduct.findUnique({ where: { id }, select: { id: true } });
    if (!existing) throw notFound("المنتج غير موجود");
    await prisma().salesProduct.delete({ where: { id } });
    res.json({ ok: true });
  })
);

// ===== الأوردرات =====
// ?date=YYYY-MM-DD أوردرات يوم، أو ?q= بحث برقم البوليصة/اسم المقفل في كل الأيام
salesRouter.get(
  "/orders",
  asyncHandler(async (req, res) => {
    const q = typeof req.query.q === "string" ? req.query.q.trim().slice(0, 80) : "";
    const date = typeof req.query.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(req.query.date) ? req.query.date : "";
    if (!q && !date) throw badRequest("حدّد التاريخ أو كلمة البحث");
    const rows = await prisma().salesOrder.findMany({
      where: q
        ? { OR: [{ waybill: { contains: q, mode: "insensitive" } }, { closerName: { contains: q, mode: "insensitive" } }] }
        : { date },
      include: salesOrderInclude,
      orderBy: q ? [{ date: "desc" }, { createdAt: "desc" }] : [{ createdAt: "asc" }, { id: "asc" }],
      take: q ? 100 : 500,
    });
    res.json({ orders: rows.map(serializeSalesOrder) });
  })
);

// أسماء المقفلين السابقة (لاقتراحها عند الكتابة)
salesRouter.get(
  "/closers",
  asyncHandler(async (_req, res) => {
    const rows = await prisma().salesOrder.findMany({
      where: { closerName: { not: "" } },
      select: { closerName: true },
      distinct: ["closerName"],
      orderBy: { closerName: "asc" },
      take: 100,
    });
    res.json({ closers: rows.map((r) => r.closerName) });
  })
);

salesRouter.post(
  "/orders",
  asyncHandler(async (req, res) => {
    const body = createOrderSchema.parse(req.body);
    await assertWaybillFree(body.waybill);
    const products = await loadActiveProducts(body.lines.map((l) => l.productId));
    const created = await prisma().salesOrder.create({
      data: {
        date: body.date,
        waybill: body.waybill,
        closerName: body.closerName,
        notes: body.notes,
        createdById: req.user!.id,
        lines: { create: body.lines.map((l) => lineCreateData(products.get(l.productId)!, l.quantity)) },
      },
      include: salesOrderInclude,
    });
    res.status(201).json({ order: serializeSalesOrder(created) });
  })
);

salesRouter.patch(
  "/orders/:id",
  asyncHandler(async (req, res) => {
    const existing = await getOrder(req.params.id);
    const body = updateOrderSchema.parse(req.body);
    if (body.waybill !== undefined && body.waybill !== existing.waybill) await assertWaybillFree(body.waybill, existing.id);

    const { order, transitions } = await prisma().$transaction(async (tx) => {
      await lockOrder(tx, existing.id);
      let moved: LowStockTransition[] = [];
      if (body.status !== undefined) moved = await applyStatus(tx, existing.id, body.status, req.user!.id);
      await tx.salesOrder.update({
        where: { id: existing.id },
        data: {
          ...(body.date !== undefined ? { date: body.date } : {}),
          ...(body.waybill !== undefined ? { waybill: body.waybill } : {}),
          ...(body.closerName !== undefined ? { closerName: body.closerName } : {}),
          ...(body.notes !== undefined ? { notes: body.notes } : {}),
        },
      });
      const fresh = await tx.salesOrder.findUniqueOrThrow({ where: { id: existing.id }, include: salesOrderInclude });
      return { order: fresh, transitions: moved };
    });
    await handleLowStockTransition(transitions);
    res.json({ order: serializeSalesOrder(order) });
  })
);

salesRouter.delete(
  "/orders/:id",
  asyncHandler(async (req, res) => {
    const existing = await getOrder(req.params.id);
    const transitions = await prisma().$transaction(async (tx) => {
      await lockOrder(tx, existing.id);
      const order = await tx.salesOrder.findUniqueOrThrow({ where: { id: existing.id }, include: salesOrderInclude });
      const moved = order.stockDeducted ? await restoreStock(tx, order, req.user!.id, "حذف أوردر", false) : [];
      await tx.salesOrder.delete({ where: { id: order.id } });
      return moved;
    });
    await handleLowStockTransition(transitions);
    res.json({ ok: true });
  })
);

// ===== بنود الأوردر (قبل التنفيذ فقط) =====
async function withEditableOrder<T>(rawId: unknown, fn: (tx: Tx, orderId: string) => Promise<T>) {
  const existing = await getOrder(rawId);
  return prisma().$transaction(async (tx) => {
    await lockOrder(tx, existing.id);
    const cur = await tx.salesOrder.findUniqueOrThrow({ where: { id: existing.id }, select: { status: true, stockDeducted: true } });
    if (cur.stockDeducted || cur.status !== "REGISTERED") {
      throw conflict("لا يمكن تعديل منتجات أوردر بعد تنفيذه. أعده إلى «مسجل» أولاً.");
    }
    await fn(tx, existing.id);
    return tx.salesOrder.findUniqueOrThrow({ where: { id: existing.id }, include: salesOrderInclude });
  });
}

salesRouter.post(
  "/orders/:id/lines",
  asyncHandler(async (req, res) => {
    const body = addLineSchema.parse(req.body);
    const products = await loadActiveProducts([body.productId]);
    const product = products.get(body.productId)!;
    const order = await withEditableOrder(req.params.id, async (tx, orderId) => {
      const sameLine = await tx.salesOrderLine.findFirst({ where: { orderId, productId: product.id } });
      if (sameLine) {
        await tx.salesOrderLine.update({ where: { id: sameLine.id }, data: { quantity: Math.min(sameLine.quantity + body.quantity, 1000) } });
      } else {
        await tx.salesOrderLine.create({ data: { orderId, ...lineCreateData(product, body.quantity) } });
      }
    });
    res.status(201).json({ order: serializeSalesOrder(order) });
  })
);

salesRouter.patch(
  "/orders/:id/lines/:lineId",
  asyncHandler(async (req, res) => {
    const body = updateLineSchema.parse(req.body);
    const lineId = idOf(req.params.lineId);
    const order = await withEditableOrder(req.params.id, async (tx, orderId) => {
      const line = await tx.salesOrderLine.findFirst({ where: { id: lineId, orderId }, select: { id: true } });
      if (!line) throw notFound("البند غير موجود");
      await tx.salesOrderLine.update({ where: { id: line.id }, data: { quantity: body.quantity } });
    });
    res.json({ order: serializeSalesOrder(order) });
  })
);

salesRouter.delete(
  "/orders/:id/lines/:lineId",
  asyncHandler(async (req, res) => {
    const lineId = idOf(req.params.lineId);
    const order = await withEditableOrder(req.params.id, async (tx, orderId) => {
      const lines = await tx.salesOrderLine.findMany({ where: { orderId }, select: { id: true } });
      if (!lines.some((l) => l.id === lineId)) throw notFound("البند غير موجود");
      if (lines.length === 1) throw badRequest("يجب أن يحتوي الأوردر على منتج واحد على الأقل. احذف الأوردر نفسه بدلاً من ذلك.");
      await tx.salesOrderLine.delete({ where: { id: lineId } });
    });
    res.json({ order: serializeSalesOrder(order) });
  })
);
