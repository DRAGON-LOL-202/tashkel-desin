import { Router, type Request } from "express";
import type { Prisma, SalesOrderStatus } from "../generated/prisma/client.ts";
import { prisma } from "../db.js";
import { isStaff, requireAuth, requireRole, requireStaff } from "../middleware/auth.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { badRequest, conflict, forbidden, notFound } from "../utils/httpError.js";
import { isSalesRole, isSalesRouteAllowed } from "../utils/inventoryAccess.js";
import { num2, num3 } from "../utils/inventorySerialize.js";
import { handleLowStockTransition, type LowStockTransition } from "../utils/inventoryLowStock.js";
import { salesOrderInclude, salesProductInclude, serializeSalesOrder, serializeSalesProduct } from "../utils/salesSerialize.js";
import {
  addLineSchema,
  addOrderComponentSchema,
  createOrderSchema,
  createProductSchema,
  updateLineSchema,
  updateOrderComponentSchema,
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
const requireSalesRead = requireRole("ADMIN", "MANAGER", "SALES_FLAGGER", "SALES_EDITOR", "SALES_SUPERVISOR");
const requireSalesEdit = requireRole("ADMIN", "MANAGER", "SALES_EDITOR", "SALES_SUPERVISOR");

export const salesRouter = Router();
salesRouter.use(requireAuth, requireSalesRead, (req, _res, next) => {
  if (isSalesRole(req.user!) && !isSalesRouteAllowed(req.user!.role, req.method, req.path, req.body)) {
    return next(forbidden());
  }
  next();
});

const serializeOrderForUser = (req: Request, o: Parameters<typeof serializeSalesOrder>[0]) =>
  serializeSalesOrder(o, { hideMoney: !isStaff(req.user!) });

const serializeProductForUser = (req: Request, p: Parameters<typeof serializeSalesProduct>[0]) =>
  serializeSalesProduct(p, { hideMoney: !isStaff(req.user!) });

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
function neededByItem(order: { lines: { quantity: number; components: { id: string; itemId: string; quantity: { toString(): string } }[] }[] }, skip?: Set<string>) {
  const needs = new Map<string, number>();
  for (const l of order.lines) {
    for (const c of l.components) {
      if (skip?.has(c.id)) continue; // مكوّن تالف: لا يُحتسب ضمن ما يعود للمخزون
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
  clearSnapshots: boolean,
  damaged?: Set<string>
): Promise<LowStockTransition[]> {
  const needs = neededByItem(order, damaged);
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
        note: damaged && damaged.size > 0 ? "إعادة تلقائية للمخزون (باستثناء التالف)" : "إعادة تلقائية للمخزون",
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
async function applyStatus(tx: Tx, orderId: string, target: SalesOrderStatus, userId: string, damagedIds: string[] = []): Promise<LowStockTransition[]> {
  const order = await tx.salesOrder.findUniqueOrThrow({ where: { id: orderId }, include: salesOrderInclude });
  const wantDeducted = DEDUCTING.has(target);
  let transitions: LowStockTransition[] = [];

  // التالف: يُحدَّد عند مرتجع أوردر خُصمت مكوناته فقط، ولا يعود للمخزون
  const damaged = new Set(damagedIds);
  if (damaged.size > 0) {
    const own = new Set(order.lines.flatMap((l) => l.components.map((c) => c.id)));
    if ([...damaged].some((id) => !own.has(id))) throw badRequest("أحد المكونات التالفة لا يخص هذا الأوردر");
    if (target !== "RETURNED" || !order.stockDeducted) throw badRequest("تحديد التالف متاح عند إرجاع أوردر تم تنفيذه فقط");
  }
  if (wantDeducted && !order.stockDeducted) {
    transitions = await deductStock(tx, order, userId);
  } else if (!wantDeducted && order.stockDeducted) {
    transitions = await restoreStock(tx, order, userId, target === "RETURNED" ? "مرتجع مبيعات" : "إلغاء تنفيذ أوردر", target === "REGISTERED", damaged);
  } else if (target === "REGISTERED") {
    await tx.salesOrderComponent.updateMany({ where: { line: { orderId } }, data: { unitCostSnapshot: null, unitSellSnapshot: null } });
  }
  // علامات التالف تخص واقعة المرتجع: تُحفظ معها، وتُمسح عند الخروج من «مرتجع»
  if (damaged.size > 0) {
    await tx.salesOrderComponent.updateMany({ where: { id: { in: [...damaged] }, line: { orderId } }, data: { damaged: true } });
  } else if (order.status === "RETURNED" && target !== "RETURNED") {
    await tx.salesOrderComponent.updateMany({ where: { line: { orderId } }, data: { damaged: false } });
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
  requireSalesEdit,
  asyncHandler(async (req, res) => {
    const rows = await prisma().salesProduct.findMany({ include: salesProductInclude, orderBy: [{ name: "asc" }, { id: "asc" }] });
    res.json({ products: rows.map((p) => serializeProductForUser(req, p)) });
  })
);

salesRouter.post(
  "/products",
  requireSalesEdit,
  asyncHandler(async (req, res) => {
    const body = createProductSchema.parse(req.body);
    await assertProductNameFree(body.name);
    await assertItemsUsable(body.components);
    const created = await prisma().salesProduct.create({
      data: { name: body.name, notes: body.notes, components: { create: body.components } },
      include: salesProductInclude,
    });
    res.status(201).json({ product: serializeProductForUser(req, created) });
  })
);

salesRouter.patch(
  "/products/:id",
  requireSalesEdit,
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
    res.json({ product: serializeProductForUser(req, updated) });
  })
);

// حذف المنتج الثابت لا يمس الأوردرات السابقة (محتوياتها منسوخة واسمه محفوظ في البند)
salesRouter.delete(
  "/products/:id",
  requireSalesEdit,
  asyncHandler(async (req, res) => {
    const id = idOf(req.params.id);
    const existing = await prisma().salesProduct.findUnique({ where: { id }, select: { id: true } });
    if (!existing) throw notFound("المنتج غير موجود");
    await prisma().salesProduct.delete({ where: { id } });
    res.json({ ok: true });
  })
);

// ===== الأوردرات =====
// ?date=YYYY-MM-DD أوردرات يوم، أو ?from=&to= أوردرات فترة (للتصدير الشهري، حتى 366 يوماً)، أو ?q= بحث برقم البوليصة/اسم المقفل في كل الأيام
salesRouter.get(
  "/orders",
  asyncHandler(async (req, res) => {
    const q = typeof req.query.q === "string" ? req.query.q.trim().slice(0, 80) : "";
    const date = typeof req.query.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(req.query.date) ? req.query.date : "";
    const isoDay = (v: unknown) => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : "");
    const from = isoDay(req.query.from);
    const to = isoDay(req.query.to);
    const ranged = !q && !date && from !== "" && to !== "";
    if (!q && !date && !ranged) throw badRequest("حدّد التاريخ أو كلمة البحث");
    if (ranged) {
      const span = (Date.parse(to) - Date.parse(from)) / 86_400_000;
      if (!(span >= 0)) throw badRequest("تاريخ البداية بعد تاريخ النهاية");
      if (span > 366) throw badRequest("الفترة أطول من سنة");
    }
    const rows = await prisma().salesOrder.findMany({
      where: q
        ? { OR: [{ waybill: { contains: q, mode: "insensitive" } }, { closerName: { contains: q, mode: "insensitive" } }] }
        : ranged
          ? { date: { gte: from, lte: to } }
          : { date },
      include: salesOrderInclude,
      orderBy: q ? [{ date: "desc" }, { createdAt: "desc" }] : ranged ? [{ date: "asc" }, { createdAt: "asc" }, { id: "asc" }] : [{ createdAt: "asc" }, { id: "asc" }],
      take: q ? 100 : ranged ? 5000 : 500,
    });
    res.json({ orders: rows.map((o) => serializeOrderForUser(req, o)) });
  })
);

// أسماء المقفلين السابقة (لاقتراحها عند الكتابة)
salesRouter.get(
  "/closers",
  requireSalesEdit,
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
  requireSalesEdit,
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
    res.status(201).json({ order: serializeOrderForUser(req, created) });
  })
);

salesRouter.patch(
  "/orders/:id",
  asyncHandler(async (req, res) => {
    const role = req.user!.role;
    if (role === "SALES_FLAGGER") {
      if (typeof req.body !== "object" || req.body === null || Array.isArray(req.body)) throw forbidden();
      const keys = Object.keys(req.body as Record<string, unknown>);
      if (keys.length !== 1 || keys[0] !== "returnFlagged") throw forbidden();
    } else if (role === "SALES_EDITOR" || role === "SALES_SUPERVISOR") {
      if (typeof req.body === "object" && req.body !== null && ("status" in req.body || "damagedComponentIds" in req.body)) {
        throw forbidden();
      }
    }
    const existing = await getOrder(req.params.id);
    const body = updateOrderSchema.parse(req.body);
    if (!isStaff(req.user!) && (body.status !== undefined || body.damagedComponentIds !== undefined)) {
      throw forbidden();
    }
    if (body.waybill !== undefined && body.waybill !== existing.waybill) await assertWaybillFree(body.waybill, existing.id);
    if (body.returnFlagged === true && (existing.status === "RETURNED" || body.status === "RETURNED")) throw badRequest("الأوردر مسجل كمرتجع بالفعل");

    const { order, transitions } = await prisma().$transaction(async (tx) => {
      await lockOrder(tx, existing.id);
      let moved: LowStockTransition[] = [];
      if (body.status !== undefined) moved = await applyStatus(tx, existing.id, body.status, req.user!.id, body.damagedComponentIds);
      await tx.salesOrder.update({
        where: { id: existing.id },
        data: {
          ...(body.date !== undefined ? { date: body.date } : {}),
          ...(body.waybill !== undefined ? { waybill: body.waybill } : {}),
          ...(body.closerName !== undefined ? { closerName: body.closerName } : {}),
          ...(body.notes !== undefined ? { notes: body.notes } : {}),
          // التحويل إلى «مرتجع» يُنهي المراجعة فتُمسح العلامة؛ وإلا تتبع طلب المستخدم
          ...(body.status === "RETURNED" || body.returnFlagged === false
            ? { returnFlagged: false, returnFlaggedAt: null }
            : body.returnFlagged === true && !existing.returnFlagged
              ? { returnFlagged: true, returnFlaggedAt: new Date() }
              : {}),
        },
      });
      const fresh = await tx.salesOrder.findUniqueOrThrow({ where: { id: existing.id }, include: salesOrderInclude });
      return { order: fresh, transitions: moved };
    });
    await handleLowStockTransition(transitions);
    res.json({ order: serializeOrderForUser(req, order) });
  })
);

salesRouter.delete(
  "/orders/:id",
  requireSalesEdit,
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
  requireSalesEdit,
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
    res.status(201).json({ order: serializeOrderForUser(req, order) });
  })
);

salesRouter.patch(
  "/orders/:id/lines/:lineId",
  requireSalesEdit,
  asyncHandler(async (req, res) => {
    const body = updateLineSchema.parse(req.body);
    const lineId = idOf(req.params.lineId);
    const order = await withEditableOrder(req.params.id, async (tx, orderId) => {
      const line = await tx.salesOrderLine.findFirst({ where: { id: lineId, orderId }, select: { id: true } });
      if (!line) throw notFound("البند غير موجود");
      await tx.salesOrderLine.update({ where: { id: line.id }, data: { quantity: body.quantity } });
    });
    res.json({ order: serializeOrderForUser(req, order) });
  })
);

salesRouter.delete(
  "/orders/:id/lines/:lineId",
  requireSalesEdit,
  asyncHandler(async (req, res) => {
    const lineId = idOf(req.params.lineId);
    const order = await withEditableOrder(req.params.id, async (tx, orderId) => {
      const lines = await tx.salesOrderLine.findMany({ where: { orderId }, select: { id: true } });
      if (!lines.some((l) => l.id === lineId)) throw notFound("البند غير موجود");
      if (lines.length === 1) throw badRequest("يجب أن يحتوي الأوردر على منتج واحد على الأقل. احذف الأوردر نفسه بدلاً من ذلك.");
      await tx.salesOrderLine.delete({ where: { id: lineId } });
    });
    res.json({ order: serializeOrderForUser(req, order) });
  })
);

// ===== مكوّنات بند داخل أوردر واحد (قبل التنفيذ فقط) =====
// المكوّنات منسوخة من المنتج الثابت، فتعديلها هنا يخص هذا الأوردر وحده ولا يغيّر المنتج ولا الأوردرات الأخرى.
// الكمية = كمية الوحدة الواحدة من المنتج (تُضرب في عدد المنتج في البند).
salesRouter.post(
  "/orders/:id/lines/:lineId/components",
  requireSalesEdit,
  asyncHandler(async (req, res) => {
    const body = addOrderComponentSchema.parse(req.body);
    const lineId = idOf(req.params.lineId);
    await assertItemsUsable([{ itemId: body.itemId }]);
    const order = await withEditableOrder(req.params.id, async (tx, orderId) => {
      const line = await tx.salesOrderLine.findFirst({ where: { id: lineId, orderId }, select: { id: true } });
      if (!line) throw notFound("البند غير موجود");
      const same = await tx.salesOrderComponent.findFirst({ where: { lineId: line.id, itemId: body.itemId } });
      if (same) {
        const merged = round3(num3(same.quantity) + body.quantity);
        if (merged > 1_000_000) throw badRequest("الكمية كبيرة جداً");
        await tx.salesOrderComponent.update({ where: { id: same.id }, data: { quantity: merged } });
      } else {
        const count = await tx.salesOrderComponent.count({ where: { lineId: line.id } });
        if (count >= 50) throw badRequest("عدد المكونات كبير جداً");
        await tx.salesOrderComponent.create({ data: { lineId: line.id, itemId: body.itemId, quantity: body.quantity } });
      }
    });
    res.status(201).json({ order: serializeOrderForUser(req, order) });
  })
);

salesRouter.patch(
  "/orders/:id/lines/:lineId/components/:componentId",
  requireSalesEdit,
  asyncHandler(async (req, res) => {
    const body = updateOrderComponentSchema.parse(req.body);
    const lineId = idOf(req.params.lineId);
    const componentId = idOf(req.params.componentId);
    const order = await withEditableOrder(req.params.id, async (tx, orderId) => {
      const comp = await tx.salesOrderComponent.findFirst({ where: { id: componentId, lineId, line: { orderId } }, select: { id: true } });
      if (!comp) throw notFound("المكوّن غير موجود");
      await tx.salesOrderComponent.update({ where: { id: comp.id }, data: { quantity: body.quantity } });
    });
    res.json({ order: serializeOrderForUser(req, order) });
  })
);

salesRouter.delete(
  "/orders/:id/lines/:lineId/components/:componentId",
  requireSalesEdit,
  asyncHandler(async (req, res) => {
    const lineId = idOf(req.params.lineId);
    const componentId = idOf(req.params.componentId);
    const order = await withEditableOrder(req.params.id, async (tx, orderId) => {
      const comps = await tx.salesOrderComponent.findMany({ where: { lineId, line: { orderId } }, select: { id: true } });
      if (!comps.some((c) => c.id === componentId)) throw notFound("المكوّن غير موجود");
      if (comps.length === 1) throw badRequest("يجب أن يحتوي المنتج على مكوّن واحد على الأقل. أزل المنتج من الأوردر بدلاً من ذلك.");
      await tx.salesOrderComponent.delete({ where: { id: componentId } });
    });
    res.json({ order: serializeOrderForUser(req, order) });
  })
);
