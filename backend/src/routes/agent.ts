import { Router } from "express";
import type { Prisma } from "../generated/prisma/client.ts";
import { prisma } from "../db.js";
import { requireAuth, requireRole, requireStaff } from "../middleware/auth.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { badRequest, conflict, notFound } from "../utils/httpError.js";
import { BUCKETS, centsToDecimalString, fromCents, matchesBucket, summarize, toCents, waybillNumber, waybillUpperBound, type AccountingRow, type Bucket } from "../utils/agentMath.js";
import { itemSelect, orderSellCents } from "../utils/salesSerialize.js";
import { cancelOrderSchema, createAgentOrderSchema, exportOrdersSchema, setPrefixSchema, updateAgentOrderSchema } from "../validators/agent.js";

// نظام أوردرات الفتيات — مساحة الفتاة. كل استعلام هنا مقيَّد بـ agentId = المستخدم الحالي من التوكن (لا يُقبل معرّف فتاة من الجسم/المسار)،
// فأي أوردر لفتاة أخرى يردّ 404 ولا يُكشف وجوده.
const requireAgent = requireRole("SALES_AGENT");

export const agentRouter = Router();
agentRouter.use(requireAuth, requireAgent);

type Tx = Prisma.TransactionClient;
const idOf = (v: unknown) => (typeof v === "string" && v.length > 0 && v.length <= 64 ? v : "");

const agentOrderInclude = {
  lines: { orderBy: { id: "asc" } },
  // الأسطر والمكونات لحساب سعر البيع تلقائياً (ثابت بعد التنفيذ، وحيّ قبله) — لا تُرسل للفتاة
  salesOrder: { select: { id: true, status: true, returnFlagged: true, stockDeducted: true, lines: { include: { components: { include: { item: { select: itemSelect } } } } } } },
} satisfies Prisma.AgentOrderInclude;
type AgentOrderRow = Prisma.AgentOrderGetPayload<{ include: typeof agentOrderInclude }>;

/** سعر بيع الأوردر بالقروش: لا تدخله الفتاة. بعد التصدير يُقرأ من أوردر المبيعات (مثبَّت بعد التنفيذ)، وللمسودة من آخر حساب محفوظ. */
const agentSellCents = (o: AgentOrderRow) => (o.salesOrder ? orderSellCents(o.salesOrder.lines) : toCents(o.sellPrice));

/** الفتاة لا ترى سعر الشحن ولا أي بيانات داخلية للمبيعات؛ ترى حالة أوردرها فقط */
export function serializeAgentOrder(o: AgentOrderRow) {
  return {
    id: o.id,
    seq: o.seq,
    waybill: o.waybill,
    date: o.date,
    customerName: o.customerName,
    customerPhone: o.customerPhone,
    customerAddress: o.customerAddress,
    notes: o.notes,
    sellPrice: fromCents(agentSellCents(o)),
    status: o.status,
    salesStatus: o.salesOrder?.status ?? null,
    returnFlagged: o.salesOrder?.returnFlagged ?? false,
    exportedAt: o.exportedAt?.toISOString() ?? null,
    cancelledAt: o.cancelledAt?.toISOString() ?? null,
    cancelReason: o.cancelReason,
    createdAt: o.createdAt.toISOString(),
    lines: o.lines.map((l) => ({ id: l.id, productId: l.productId, productName: l.productName, quantity: l.quantity })),
  };
}

export const toAccountingRow = (o: AgentOrderRow): AccountingRow => ({
  agentStatus: o.status,
  salesStatus: (o.salesOrder?.status ?? null) as AccountingRow["salesStatus"],
  returnFlagged: o.salesOrder?.returnFlagged ?? false,
  sellCents: agentSellCents(o),
  shippingCents: 0, // سعر الشحن لا يظهر ولا يدخل حسابات الفتاة
});

async function loadActiveProducts(db: Pick<Tx, "salesProduct">, productIds: string[]) {
  const products = await db.salesProduct.findMany({ where: { id: { in: productIds } }, include: { components: { include: { item: { select: itemSelect } } } } });
  if (products.length !== productIds.length) throw notFound("أحد المنتجات غير موجود");
  for (const p of products) {
    if (!p.isActive) throw badRequest(`«${p.name}» غير مفعّل`);
    if (p.components.length === 0) throw badRequest(`«${p.name}» بلا محتويات`);
  }
  return new Map(products.map((p) => [p.id, p]));
}

type LoadedProducts = Awaited<ReturnType<typeof loadActiveProducts>>;
/** سعر بيع بوكسات الأوردر (الكمية × مجموع مكونات البوكس × سعر بيع المكوّن الحالي) بالقروش */
const draftSellCents = (products: LoadedProducts, lines: { productId: string | null; quantity: number }[]) =>
  orderSellCents(lines.map((l) => ({ quantity: l.quantity, components: products.get(l.productId!)!.components })));

async function getOwnOrder(agentId: string, rawId: unknown) {
  const o = await prisma().agentOrder.findFirst({ where: { id: idOf(rawId), agentId }, include: agentOrderInclude });
  if (!o) throw notFound("الأوردر غير موجود");
  return o;
}

async function lockOwnOrder(tx: Tx, agentId: string, orderId: string) {
  const rows = await tx.$queryRaw<{ id: string; status: string }[]>`SELECT "id","status"::text AS "status" FROM "AgentOrder" WHERE "id" = ${orderId} AND "agentId" = ${agentId} FOR UPDATE`;
  if (rows.length === 0) throw notFound("الأوردر غير موجود");
  return rows[0];
}

/** حجز رقم بوليصة: قفل صف عداد الفتاة، فحص النطاق، تخطّي أرقام استُخدمت يدوياً، ثم زيادة العداد. العداد لا ينقص أبداً. */
export async function allocateWaybill(tx: Tx, agentId: string) {
  const rows = await tx.$queryRaw<{ prefix: number; nextSeq: number }[]>`SELECT "prefix","nextSeq" FROM "SalesAgentProfile" WHERE "userId" = ${agentId} FOR UPDATE`;
  const profile = rows[0];
  if (!profile) throw badRequest("لم تحدد الإدارة Prefix لحسابك بعد. تواصل مع الإدارة.");
  const higher = await tx.salesAgentProfile.findFirst({ where: { prefix: { gt: profile.prefix } }, orderBy: { prefix: "asc" }, select: { prefix: true } });
  const upper = waybillUpperBound(profile.prefix, higher?.prefix ?? null);
  let seq = profile.nextSeq;
  for (let tries = 0; tries < 50; tries++, seq++) {
    const n = waybillNumber(profile.prefix, seq);
    if (n > upper) throw conflict("انتهى نطاق أرقام البوليصات المخصص لحسابك. تواصل مع الإدارة.");
    const taken = await tx.salesOrder.findFirst({ where: { waybill: String(n) }, select: { id: true } });
    if (taken) continue; // رقم مستخدم في أوردر يدوي قديم: نتخطاه ولا نعيد استخدامه
    await tx.salesAgentProfile.update({ where: { userId: agentId }, data: { nextSeq: seq + 1 } });
    return { seq, waybill: String(n) };
  }
  throw conflict("تعذّر حجز رقم بوليصة. حاول مرة أخرى.");
}

agentRouter.get(
  "/me",
  asyncHandler(async (req, res) => {
    const profile = await prisma().salesAgentProfile.findUnique({ where: { userId: req.user!.id } });
    res.json({ profile: profile ? { prefix: profile.prefix, nextSeq: profile.nextSeq } : null });
  })
);

// البوكسات المتاحة للاختيار (الاسم فقط: بلا أسعار ولا مكونات مخزنية)
agentRouter.get(
  "/products",
  asyncHandler(async (_req, res) => {
    const products = await prisma().salesProduct.findMany({
      where: { isActive: true, components: { some: {} } },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    });
    res.json({ products });
  })
);

agentRouter.get(
  "/orders",
  asyncHandler(async (req, res) => {
    const bucketRaw = typeof req.query.bucket === "string" ? req.query.bucket : "all";
    const bucket: Bucket = (BUCKETS as readonly string[]).includes(bucketRaw) ? (bucketRaw as Bucket) : "all";
    const q = typeof req.query.q === "string" ? req.query.q.trim().slice(0, 80) : "";
    const rows = await prisma().agentOrder.findMany({
      where: {
        agentId: req.user!.id,
        ...(q
          ? { OR: [{ waybill: { contains: q } }, { customerName: { contains: q, mode: "insensitive" as const } }, { customerPhone: { contains: q } }] }
          : {}),
      },
      include: agentOrderInclude,
      orderBy: [{ date: "desc" }, { seq: "desc" }],
      take: 1000,
    });
    res.json({ orders: rows.filter((o) => matchesBucket(toAccountingRow(o), bucket)).map(serializeAgentOrder) });
  })
);

agentRouter.get(
  "/dashboard",
  asyncHandler(async (req, res) => {
    const rows = await prisma().agentOrder.findMany({ where: { agentId: req.user!.id }, include: agentOrderInclude });
    res.json({ summary: summarize(rows.map(toAccountingRow)) });
  })
);

agentRouter.post(
  "/orders",
  asyncHandler(async (req, res) => {
    const body = createAgentOrderSchema.parse(req.body);
    const agentId = req.user!.id;
    const created = await prisma().$transaction(async (tx) => {
      const products = await loadActiveProducts(tx, body.lines.map((l) => l.productId));
      const { seq, waybill } = await allocateWaybill(tx, agentId);
      return tx.agentOrder.create({
        data: {
          agentId,
          seq,
          waybill,
          date: body.date,
          customerName: body.customerName,
          customerPhone: body.customerPhone,
          customerAddress: body.customerAddress,
          notes: body.notes,
          sellPrice: centsToDecimalString(draftSellCents(products, body.lines)),
          lines: { create: body.lines.map((l) => ({ productId: l.productId, productName: products.get(l.productId)!.name, quantity: l.quantity })) },
        },
        include: agentOrderInclude,
      });
    });
    res.status(201).json({ order: serializeAgentOrder(created) });
  })
);

agentRouter.patch(
  "/orders/:id",
  asyncHandler(async (req, res) => {
    const body = updateAgentOrderSchema.parse(req.body);
    const agentId = req.user!.id;
    const own = await getOwnOrder(agentId, req.params.id);
    const updated = await prisma().$transaction(async (tx) => {
      const locked = await lockOwnOrder(tx, agentId, own.id);
      if (locked.status !== "DRAFT") throw conflict("لا يمكن تعديل أوردر بعد تصديره. يمكنك إلغاؤه مع ذكر السبب.");
      if (body.lines) {
        const products = await loadActiveProducts(tx, body.lines.map((l) => l.productId));
        await tx.agentOrderLine.deleteMany({ where: { orderId: own.id } });
        await tx.agentOrderLine.createMany({
          data: body.lines.map((l) => ({ orderId: own.id, productId: l.productId, productName: products.get(l.productId)!.name, quantity: l.quantity })),
        });
      }
      await tx.agentOrder.update({
        where: { id: own.id },
        data: {
          ...(body.date !== undefined ? { date: body.date } : {}),
          ...(body.customerName !== undefined ? { customerName: body.customerName } : {}),
          ...(body.customerPhone !== undefined ? { customerPhone: body.customerPhone } : {}),
          ...(body.customerAddress !== undefined ? { customerAddress: body.customerAddress } : {}),
          ...(body.notes !== undefined ? { notes: body.notes } : {}),
        },
      });
      // السعر محسوب تلقائياً: يُعاد حسابه من البوكسات الحالية عند كل تعديل للمسودة
      const current = await tx.agentOrderLine.findMany({ where: { orderId: own.id } });
      const products = await loadActiveProducts(tx, current.map((l) => l.productId).filter((v): v is string => v !== null));
      await tx.agentOrder.update({ where: { id: own.id }, data: { sellPrice: centsToDecimalString(draftSellCents(products, current)) } });
      return tx.agentOrder.findUniqueOrThrow({ where: { id: own.id }, include: agentOrderInclude });
    });
    res.json({ order: serializeAgentOrder(updated) });
  })
);

// الحذف قبل التصدير فقط. رقم البوليصة لا يُعاد استخدامه (العداد لا ينقص).
agentRouter.delete(
  "/orders/:id",
  asyncHandler(async (req, res) => {
    const agentId = req.user!.id;
    const own = await getOwnOrder(agentId, req.params.id);
    await prisma().$transaction(async (tx) => {
      const locked = await lockOwnOrder(tx, agentId, own.id);
      if (locked.status !== "DRAFT") throw conflict("لا يمكن حذف أوردر بعد تصديره. استخدم «إلغاء الأوردر» مع ذكر السبب.");
      await tx.agentOrder.delete({ where: { id: own.id } });
    });
    res.json({ ok: true });
  })
);

/** تصدير أوردر واحد داخل معاملة واحدة: قفل صفه، ثم إنشاء أوردر المبيعات وربطه. إعادة المحاولة لا تنشئ نسخة ثانية. */
async function exportOne(agentId: string, agentName: string, orderId: string) {
  return prisma().$transaction(async (tx) => {
    const locked = await lockOwnOrder(tx, agentId, orderId);
    if (locked.status === "EXPORTED") return { id: orderId, result: "ALREADY_EXPORTED" as const };
    if (locked.status === "CANCELLED") return { id: orderId, result: "CANCELLED" as const };
    const order = await tx.agentOrder.findUniqueOrThrow({ where: { id: orderId }, include: { lines: true } });
    if (order.lines.length === 0) throw badRequest(`الأوردر ${order.waybill} بلا منتجات`);
    const products = await loadActiveProducts(tx, order.lines.map((l) => l.productId).filter((v): v is string => v !== null));
    if (order.lines.some((l) => l.productId === null)) throw badRequest(`الأوردر ${order.waybill} يحتوي منتجاً لم يعد موجوداً`);
    const dup = await tx.salesOrder.findFirst({ where: { waybill: { equals: order.waybill, mode: "insensitive" } }, select: { id: true } });
    if (dup) throw conflict(`رقم البوليصة ${order.waybill} مستخدم في أوردر آخر`);
    const sellCents = draftSellCents(products, order.lines);
    const customer = [order.customerName, order.customerPhone, order.customerAddress].filter(Boolean).join(" — ");
    const salesOrder = await tx.salesOrder.create({
      data: {
        date: order.date,
        waybill: order.waybill,
        closerName: agentName,
        notes: [customer ? `العميل: ${customer}` : "", order.notes].filter(Boolean).join("\n"),
        createdById: agentId,
        agentId,
        source: "AGENT",
        agentSellPrice: centsToDecimalString(sellCents),
        lines: {
          create: order.lines.map((l) => {
            const p = products.get(l.productId!)!;
            return { productId: p.id, productName: p.name, quantity: l.quantity, components: { create: p.components.map((c) => ({ itemId: c.itemId, quantity: c.quantity })) } };
          }),
        },
      },
    });
    await tx.agentOrder.update({
      where: { id: orderId },
      data: { status: "EXPORTED", exportedAt: new Date(), exportedById: agentId, salesOrderId: salesOrder.id, sellPrice: centsToDecimalString(sellCents) },
    });
    await tx.salesOrderStatusLog.create({ data: { orderId: salesOrder.id, event: "EXPORT", fromValue: null, toValue: order.waybill, byId: agentId } });
    return { id: orderId, result: "EXPORTED" as const };
  });
}

// لا خصم مخزون هنا إطلاقاً: الخصم يحدث فقط عند «تم التنفيذ» في نظام المبيعات الحالي.
agentRouter.post(
  "/orders/export",
  asyncHandler(async (req, res) => {
    const body = exportOrdersSchema.parse(req.body);
    const ids = [...new Set(body.ids)];
    const results: { id: string; result: "EXPORTED" | "ALREADY_EXPORTED" | "CANCELLED" | "ERROR"; message?: string }[] = [];
    for (const id of ids) {
      try {
        results.push(await exportOne(req.user!.id, req.user!.name, id));
      } catch (e) {
        // كل أوردر معاملة مستقلة: فشل أحدها لا يُبقي سجلاً جزئياً ولا يمنع الباقي
        results.push({ id, result: "ERROR", message: e instanceof Error ? e.message : "تعذّر التصدير" });
      }
    }
    const fresh = await prisma().agentOrder.findMany({ where: { agentId: req.user!.id, id: { in: ids } }, include: agentOrderInclude });
    res.json({ results, orders: fresh.map(serializeAgentOrder) });
  })
);

// إلغاء بعد التصدير: سبب إلزامي + تأكيد، يُحفظ السجل ويبقى الأوردر ورقم بوليصته. لا حركة مخزون تلقائية.
agentRouter.post(
  "/orders/:id/cancel",
  asyncHandler(async (req, res) => {
    const body = cancelOrderSchema.parse(req.body);
    const agentId = req.user!.id;
    const own = await getOwnOrder(agentId, req.params.id);
    const updated = await prisma().$transaction(async (tx) => {
      const locked = await lockOwnOrder(tx, agentId, own.id);
      if (locked.status === "DRAFT") throw conflict("الأوردر لم يُصدَّر بعد؛ يمكنك حذفه بدل إلغائه.");
      if (locked.status === "CANCELLED") throw conflict("الأوردر ملغي بالفعل");
      const now = new Date();
      await tx.agentOrder.update({ where: { id: own.id }, data: { status: "CANCELLED", cancelledAt: now, cancelReason: body.reason, cancelledById: agentId } });
      // مزامنة أوردر المبيعات الرئيسي في نفس المعاملة (لا تحديث جزئي): يظهر ملغياً ويُمنع تعديله/تنفيذه. لا حركة مخزون.
      if (own.salesOrderId) {
        await tx.$queryRaw`SELECT "id" FROM "SalesOrder" WHERE "id" = ${own.salesOrderId} FOR UPDATE`;
        await tx.salesOrder.update({ where: { id: own.salesOrderId }, data: { cancelledAt: now, cancelReason: body.reason, cancelledById: agentId } });
        await tx.salesOrderStatusLog.create({ data: { orderId: own.salesOrderId, event: "CANCEL", fromValue: null, toValue: body.reason.slice(0, 200), byId: agentId } });
      }
      return tx.agentOrder.findUniqueOrThrow({ where: { id: own.id }, include: agentOrderInclude });
    });
    res.json({ order: serializeAgentOrder(updated) });
  })
);

// ===== إدارة Prefix الفتيات (الإدارة فقط) =====
export const salesAgentsAdminRouter = Router();
salesAgentsAdminRouter.use(requireAuth, requireStaff);

salesAgentsAdminRouter.get(
  "/",
  asyncHandler(async (_req, res) => {
    const users = await prisma().user.findMany({
      where: { role: "SALES_AGENT" },
      orderBy: { name: "asc" },
      select: { id: true, name: true, username: true, isActive: true, agentProfile: { select: { prefix: true, nextSeq: true } } },
    });
    const prefixes = (await prisma().salesAgentProfile.findMany({ select: { prefix: true }, orderBy: { prefix: "asc" } })).map((p) => p.prefix);
    const withOrders = new Set((await prisma().agentOrder.groupBy({ by: ["agentId"] })).map((g) => g.agentId));
    res.json({
      agents: users.map((u) => {
        const higher = u.agentProfile ? prefixes.find((p) => p > u.agentProfile!.prefix) ?? null : null;
        return {
          id: u.id,
          name: u.name,
          username: u.username,
          isActive: u.isActive,
          prefix: u.agentProfile?.prefix ?? null,
          nextSeq: u.agentProfile?.nextSeq ?? null,
          hasOrders: withOrders.has(u.id),
          nextWaybill: u.agentProfile ? waybillNumber(u.agentProfile.prefix, u.agentProfile.nextSeq) : null,
          maxWaybill: u.agentProfile ? (higher === null ? null : waybillUpperBound(u.agentProfile.prefix, higher)) : null,
        };
      }),
    });
  })
);

// تحديد/تعديل Prefix ورقم البدء. لا يتغيران بعد إنشاء أي أوردر بهذا الحساب (حتى لا تتأثر الأرقام القديمة)، ولا يتعارض النطاق مع فتاة أخرى.
salesAgentsAdminRouter.put(
  "/:userId/prefix",
  asyncHandler(async (req, res) => {
    const { prefix, startSeq } = setPrefixSchema.parse(req.body);
    const userId = idOf(req.params.userId);
    const profile = await prisma().$transaction(async (tx) => {
      const user = await tx.user.findUnique({ where: { id: userId }, select: { id: true, role: true } });
      if (!user || user.role !== "SALES_AGENT") throw notFound("حساب الفتاة غير موجود");
      // قفل جدول البروفايلات لمنع سباق إنشاء Prefixes متداخلة بالتزامن
      await tx.$executeRaw`LOCK TABLE "SalesAgentProfile" IN SHARE ROW EXCLUSIVE MODE`;
      const current = await tx.salesAgentProfile.findUnique({ where: { userId } });
      const prefixChanged = !current || current.prefix !== prefix;
      const startChanged = startSeq !== undefined && (!current || current.nextSeq !== startSeq);
      if (!prefixChanged && !startChanged) return current!;
      if (current && (await tx.agentOrder.count({ where: { agentId: userId } })) > 0) {
        throw conflict("لا يمكن تغيير Prefix أو رقم البدء بعد إنشاء أوردرات بهذا الحساب");
      }
      if (prefixChanged) {
        const same = await tx.salesAgentProfile.findFirst({ where: { prefix, NOT: { userId } }, select: { userId: true } });
        if (same) throw conflict("هذا الـ Prefix مستخدم لفتاة أخرى");
        const lower = await tx.salesAgentProfile.findFirst({ where: { prefix: { lt: prefix }, NOT: { userId } }, orderBy: { prefix: "desc" } });
        if (lower && waybillNumber(lower.prefix, lower.nextSeq - 1) >= prefix * 100) {
          throw conflict(`النطاق يتعارض مع الفتاة ذات Prefix ${lower.prefix} (وصلت لرقم ${waybillNumber(lower.prefix, lower.nextSeq - 1)})`);
        }
      }
      const nextSeq = startSeq ?? current?.nextSeq ?? 1;
      // رقم البدء لا يتجاوز نطاق الفتاة (قبل Prefix التالي الأكبر)
      const higher = await tx.salesAgentProfile.findFirst({ where: { prefix: { gt: prefix }, NOT: { userId } }, orderBy: { prefix: "asc" }, select: { prefix: true } });
      const upper = waybillUpperBound(prefix, higher?.prefix ?? null);
      if (waybillNumber(prefix, nextSeq) > upper) throw conflict(`رقم البدء خارج نطاق هذا الحساب (الحد الأقصى للبوليصة ${upper})`);
      return current
        ? tx.salesAgentProfile.update({ where: { userId }, data: { prefix, nextSeq } })
        : tx.salesAgentProfile.create({ data: { userId, prefix, nextSeq } });
    });
    res.json({ profile: { userId: profile.userId, prefix: profile.prefix, nextSeq: profile.nextSeq } });
  })
);

