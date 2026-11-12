import { Router } from "express";
import type { Prisma } from "../generated/prisma/client.ts";
import { prisma } from "../db.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { badRequest, conflict, notFound } from "../utils/httpError.js";
import { centsToDecimalString, fromCents, generalAccounts, matchesBucket, summarize, toCents, BUCKETS, type AccountingRow, type Bucket } from "../utils/agentMath.js";
import { itemSelect, orderSellCents } from "../utils/salesSerialize.js";
import { accountantStatusSchema, returnFlagSchema, shippingPriceSchema } from "../validators/agent.js";

// متابعة أوردرات المبيعات + حسابات الفتيات. للمحاسب (SALES_ACCOUNTANT) والإدارة.
// المحاسب هنا لا يعدّل محتوى الأوردر ولا ينفّذ مرتجعاً مخزنياً ولا يخصم مخزوناً: يغيّر الحالة (شحن/تسليم) وعلامة المرتجع وسعر الشحن فقط.
export const accountingRouter = Router();
accountingRouter.use(requireAuth, requireRole("ADMIN", "MANAGER", "SALES_ACCOUNTANT"));

type Tx = Prisma.TransactionClient;
const idOf = (v: unknown) => (typeof v === "string" && v.length > 0 && v.length <= 64 ? v : "");

const include = {
  agent: { select: { id: true, name: true } },
  agentOrder: { select: { id: true, status: true, customerName: true, cancelReason: true, cancelledAt: true } },
  // المكونات لحساب سعر البيع (مثبَّت بعد التنفيذ)؛ لا تُعرض للمحاسب
  lines: { select: { id: true, productName: true, quantity: true, components: { include: { item: { select: itemSelect } } } }, orderBy: { id: "asc" } },
} satisfies Prisma.SalesOrderInclude;
type Row = Prisma.SalesOrderGetPayload<{ include: typeof include }>;

const FOLLOW_STATUSES = ["EXECUTED", "SHIPPED", "DELIVERED", "RETURNED"] as const;

const rowOf = (o: Row): AccountingRow => ({
  agentStatus: (o.agentOrder?.status ?? "EXPORTED") as AccountingRow["agentStatus"],
  salesStatus: o.status,
  returnFlagged: o.returnFlagged,
  sellCents: orderSellCents(o.lines),
  shippingCents: toCents(o.shippingPrice),
});

function serialize(o: Row) {
  return {
    id: o.id,
    waybill: o.waybill,
    boxName: o.lines.map((l) => (l.quantity > 1 ? `${l.productName} × ${l.quantity}` : l.productName)).join("، "),
    agentId: o.agentId,
    agentName: o.agent?.name ?? "",
    // أوردر يدوي من صفحة المبيعات (بلا فتاة) أم أوردر فتاة مصدَّر
    source: o.agentId ? ("AGENT" as const) : ("MANUAL" as const),
    closerName: o.closerName,
    date: o.date,
    sellPrice: fromCents(orderSellCents(o.lines)),
    shippingPrice: o.shippingPrice === null ? null : Number(o.shippingPrice.toString()),
    status: o.status,
    returnFlagged: o.returnFlagged,
    cancelled: o.agentOrder?.status === "CANCELLED" || o.cancelledAt != null,
    cancelReason: o.agentOrder?.cancelReason ?? null,
    shippedAt: o.shippedAt?.toISOString() ?? null,
    deliveredAt: o.deliveredAt?.toISOString() ?? null,
    // هل يدخل في حساب المستحقات حالياً؟ (مسلَّم وغير مرتجع وغير ملغي)
    counted: o.agentId != null && matchesBucket(rowOf(o), "delivered"),
  };
}

const dateRe = /^\d{4}-\d{2}-\d{2}$/;
const dateFilter = (q: Record<string, unknown>) => {
  const from = typeof q.from === "string" && dateRe.test(q.from) ? q.from : undefined;
  const to = typeof q.to === "string" && dateRe.test(q.to) ? q.to : undefined;
  return from || to ? { date: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } } : {};
};

/**
 * مسح كل أوردرات الفتيات المصدَّرة (بما فيها الملغاة) المطابقة للفلتر على دفعات (cursor)، بلا حدّ صامت.
 * الحسابات والعدّادات تُبنى على كل السجلات؛ لا نحتفظ إلا بما تحتاجه كل دالة (صفوف خفيفة).
 */
const SCAN_BATCH = 1000;
async function scanAgentRows(where: Prisma.SalesOrderWhereInput, visit: (o: Row) => void, scope: "agent" | "all" = "agent") {
  let cursor: string | undefined;
  for (;;) {
    const batch = await prisma().salesOrder.findMany({
      // الحسابات والعدّادات: أوردرات الفتيات فقط. صفحة المتابعة (scope = all): كل الأوردرات بما فيها اليدوية.
      where: scope === "agent" ? { agentId: { not: null }, agentOrder: { isNot: null }, ...where } : where,
      include,
      orderBy: [{ date: "desc" }, { waybill: "desc" }, { id: "desc" }],
      take: SCAN_BATCH,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
    for (const o of batch) visit(o);
    if (batch.length < SCAN_BATCH) return;
    cursor = batch[batch.length - 1].id;
  }
}

/** صفوف الحساب الخفيفة لكل الأوردرات المطابقة (بدون حد) */
async function loadAccountingRows(where: Prisma.SalesOrderWhereInput) {
  const out: { agentId: string; row: AccountingRow }[] = [];
  await scanAgentRows(where, (o) => out.push({ agentId: o.agentId!, row: rowOf(o) }));
  return out;
}

/** قائمة معروضة: العدد الكلي المطابق دقيق دائماً، والمعروض محدود بـ limit مع hasMore */
const LIST_LIMIT = 500;
async function listAgentRows(where: Prisma.SalesOrderWhereInput, match: (r: AccountingRow) => boolean, limit = LIST_LIMIT, scope: "agent" | "all" = "agent") {
  const orders: ReturnType<typeof serialize>[] = [];
  let total = 0;
  await scanAgentRows(where, (o) => {
    if (!match(rowOf(o))) return;
    total += 1;
    if (orders.length < limit) orders.push(serialize(o));
  }, scope);
  return { orders, total, hasMore: total > orders.length };
}

// يعمل على أوردرات الفتيات المصدَّرة وعلى الأوردرات اليدوية؛ المرفوض فقط: الملغي.
async function lockAgentOrder(tx: Tx, id: string) {
  await tx.$queryRaw`SELECT "id" FROM "SalesOrder" WHERE "id" = ${id} FOR UPDATE`;
  const o = await tx.salesOrder.findFirst({ where: { id }, include });
  if (!o) throw notFound("الأوردر غير موجود");
  if (o.cancelledAt || (o.agentOrder && o.agentOrder.status !== "EXPORTED")) throw conflict("هذا الأوردر ملغي ولا يمكن تعديل حالته");
  return o;
}

// ===== صفحة «متابعة أوردرات المبيعات» =====
accountingRouter.get(
  "/orders",
  asyncHandler(async (req, res) => {
    const agentId = typeof req.query.agentId === "string" ? idOf(req.query.agentId) : "";
    const q = typeof req.query.q === "string" ? req.query.q.trim().slice(0, 80) : "";
    const statusQ = typeof req.query.status === "string" ? req.query.status : "";
    // كل أوردر وصل «تم التنفيذ» فما بعد في أوردرات مبيعات إلكترونية: يدوي، أو أوردر فتاة مصدَّر غير ملغي
    const and: Prisma.SalesOrderWhereInput[] = [{ OR: [{ agentOrder: { is: null } }, { agentOrder: { is: { status: "EXPORTED" } } }] }];
    if (q) {
      and.push({
        OR: [
          { waybill: { contains: q, mode: "insensitive" } },
          { closerName: { contains: q, mode: "insensitive" } },
          { agent: { name: { contains: q, mode: "insensitive" as const } } },
        ],
      });
    }
    const result = await listAgentRows(
      {
        status: { in: (FOLLOW_STATUSES as readonly string[]).includes(statusQ) ? [statusQ as (typeof FOLLOW_STATUSES)[number]] : [...FOLLOW_STATUSES] },
        cancelledAt: null,
        AND: and,
        ...(agentId ? { agentId } : {}),
        ...dateFilter(req.query),
      },
      () => true,
      LIST_LIMIT,
      "all"
    );
    res.json(result);
  })
);

accountingRouter.patch(
  "/orders/:id/status",
  asyncHandler(async (req, res) => {
    const { status } = accountantStatusSchema.parse(req.body);
    const orderId = idOf(req.params.id);
    const updated = await prisma().$transaction(async (tx) => {
      const o = await lockAgentOrder(tx, orderId);
      // الشحن/التسليم بعد «تم التنفيذ» فقط (الخصم تم بالفعل). لا خصم ولا إرجاع هنا إطلاقاً.
      if (!o.stockDeducted || !["EXECUTED", "SHIPPED", "DELIVERED"].includes(o.status)) {
        throw conflict("لا يمكن تغيير الحالة قبل «تم التنفيذ» أو بعد المرتجع");
      }
      if (o.status === status) return o; // إعادة الإرسال لا تكرر السجل
      await tx.salesOrder.update({
        where: { id: o.id },
        data: {
          status,
          ...(status === "SHIPPED" ? { shippedAt: o.shippedAt ?? new Date(), deliveredAt: null } : { deliveredAt: new Date(), shippedAt: o.shippedAt ?? new Date() }),
        },
      });
      await tx.salesOrderStatusLog.create({ data: { orderId: o.id, event: "STATUS", fromValue: o.status, toValue: status, byId: req.user!.id } });
      return tx.salesOrder.findUniqueOrThrow({ where: { id: o.id }, include });
    });
    res.json({ order: serialize(updated) });
  })
);

// علامة مرتجع للمتابعة والحسابات فقط: لا تمس الحالة ولا المخزون
accountingRouter.patch(
  "/orders/:id/return-flag",
  asyncHandler(async (req, res) => {
    const { flagged } = returnFlagSchema.parse(req.body);
    const orderId = idOf(req.params.id);
    const updated = await prisma().$transaction(async (tx) => {
      const o = await lockAgentOrder(tx, orderId);
      if (o.status === "RETURNED") throw conflict("الأوردر مسجل كمرتجع بالفعل");
      if (o.status === "REGISTERED") throw conflict("الأوردر لم يُنفَّذ بعد");
      if (o.returnFlagged === flagged) return o;
      await tx.salesOrder.update({ where: { id: o.id }, data: { returnFlagged: flagged, returnFlaggedAt: flagged ? new Date() : null } });
      await tx.salesOrderStatusLog.create({ data: { orderId: o.id, event: "RETURN_FLAG", fromValue: String(o.returnFlagged), toValue: String(flagged), byId: req.user!.id } });
      return tx.salesOrder.findUniqueOrThrow({ where: { id: o.id }, include });
    });
    res.json({ order: serialize(updated) });
  })
);

// سعر الشحن: يدخله المحاسب يدوياً (لا قيمة تلقائية)، ويُحفظ ويُعدَّل، ولا يدخل في عمولة الفتاة
accountingRouter.put(
  "/orders/:id/shipping",
  asyncHandler(async (req, res) => {
    const { shippingPrice } = shippingPriceSchema.parse(req.body);
    const orderId = idOf(req.params.id);
    const updated = await prisma().$transaction(async (tx) => {
      const o = await lockAgentOrder(tx, orderId);
      if (o.status === "REGISTERED") throw badRequest("أدخل سعر الشحن بعد «تم التنفيذ»");
      const next = shippingPrice === null ? null : centsToDecimalString(toCents(shippingPrice));
      const before = o.shippingPrice === null ? null : o.shippingPrice.toFixed(2);
      if (before === next) return o;
      await tx.salesOrder.update({ where: { id: o.id }, data: { shippingPrice: next } });
      await tx.salesOrderStatusLog.create({ data: { orderId: o.id, event: "SHIPPING_PRICE", fromValue: before, toValue: next, byId: req.user!.id } });
      return tx.salesOrder.findUniqueOrThrow({ where: { id: o.id }, include });
    });
    res.json({ order: serialize(updated) });
  })
);

accountingRouter.get(
  "/orders/:id/log",
  asyncHandler(async (req, res) => {
    const id = idOf(req.params.id);
    const exists = await prisma().salesOrder.findFirst({ where: { id }, select: { id: true } });
    if (!exists) throw notFound("الأوردر غير موجود");
    const logs = await prisma().salesOrderStatusLog.findMany({ where: { orderId: id }, orderBy: { createdAt: "asc" }, include: { by: { select: { name: true } } } });
    res.json({ logs: logs.map((l) => ({ id: l.id, event: l.event, from: l.fromValue, to: l.toValue, by: l.by.name, at: l.createdAt.toISOString() })) });
  })
);

// ===== حسابات الفتيات (المحاسب والإدارة) =====
async function agentSummaries(range: Record<string, unknown>) {
  const agents = await prisma().user.findMany({
    where: { role: "SALES_AGENT" },
    orderBy: { name: "asc" },
    select: { id: true, name: true, isActive: true, agentProfile: { select: { prefix: true } } },
  });
  const drafts = await prisma().agentOrder.groupBy({ by: ["agentId"], where: { status: "DRAFT", ...dateFilter(range) }, _count: { _all: true } });
  const draftBy = new Map(drafts.map((d) => [d.agentId, d._count._all]));
  const rows = await loadAccountingRows(dateFilter(range));
  const byAgent = new Map<string, AccountingRow[]>();
  for (const r of rows) {
    const list = byAgent.get(r.agentId);
    if (list) list.push(r.row);
    else byAgent.set(r.agentId, [r.row]);
  }
  const perAgent = agents.map((a) => {
    const s = summarize(byAgent.get(a.id) ?? []);
    const unexported = draftBy.get(a.id) ?? 0;
    return { agentId: a.id, agentName: a.name, isActive: a.isActive, prefix: a.agentProfile?.prefix ?? null, ...s, unexported, total: s.total + unexported };
  });
  return perAgent;
}

accountingRouter.get(
  "/agents",
  asyncHandler(async (req, res) => {
    const rows = await agentSummaries(req.query);
    const cents = (k: "deliveredSales" | "fixedFee" | "commission" | "totalDue") => fromCents(rows.reduce((a, r) => a + toCents(r[k]), 0));
    const totals = {
      total: rows.reduce((a, r) => a + r.total, 0),
      delivered: rows.reduce((a, r) => a + r.delivered, 0),
      shipped: rows.reduce((a, r) => a + r.shipped, 0),
      returned: rows.reduce((a, r) => a + r.returned, 0),
      cancelled: rows.reduce((a, r) => a + r.cancelled, 0),
      deliveredSales: cents("deliveredSales"),
      fixedFee: cents("fixedFee"),
      commission: cents("commission"),
      totalDue: cents("totalDue"),
    };
    res.json({ agents: rows, totals });
  })
);

accountingRouter.get(
  "/agents/:id",
  asyncHandler(async (req, res) => {
    const agentId = idOf(req.params.id);
    const agent = await prisma().user.findFirst({ where: { id: agentId, role: "SALES_AGENT" }, select: { id: true, name: true } });
    if (!agent) throw notFound("الفتاة غير موجودة");
    const bucketRaw = typeof req.query.bucket === "string" ? req.query.bucket : "all";
    const bucket: Bucket = (BUCKETS as readonly string[]).includes(bucketRaw) ? (bucketRaw as Bucket) : "all";
    const range = dateFilter(req.query);
    const rows = (await loadAccountingRows({ agentId, ...range })).map((r) => r.row);
    // المسودات تخضع لنفس فلتر الفترة الزمنية مثل بقية الحالات
    const drafts = await prisma().agentOrder.count({ where: { agentId, status: "DRAFT", ...range } });
    const summary = summarize(rows);
    const list = await listAgentRows({ agentId, ...range }, (r) => matchesBucket(r, bucket));
    res.json({
      agent,
      summary: { ...summary, unexported: drafts, total: summary.total + drafts },
      orders: bucket === "draft" ? [] : list.orders,
      ordersTotal: bucket === "draft" ? drafts : list.total,
      hasMore: bucket === "draft" ? false : list.hasMore,
    });
  })
);

accountingRouter.get(
  "/general",
  asyncHandler(async (req, res) => {
    const range = dateFilter(req.query);
    const rows = (await loadAccountingRows(range)).map((r) => r.row);
    // «إجمالي الأوردرات» يشمل المسودات في كل الشاشات؛ المسودات هنا لفتيات مسجَّلات بنفس الفترة
    const drafts = await prisma().agentOrder.count({ where: { status: "DRAFT", ...range } });
    res.json({ general: generalAccounts(rows, drafts) });
  })
);
