import { Router } from "express";
import type { Prisma } from "../generated/prisma/client.ts";
import { prisma } from "../db.js";
import { requireAuth, requireRole, requireStaff } from "../middleware/auth.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { badRequest, conflict, notFound } from "../utils/httpError.js";
import { BUCKETS, calcAdjustedBoxPriceCents, centsToDecimalString, fromCents, matchesBucket, summarize, toCents, waybillNumber, waybillUpperBound, type AccountingRow, type Bucket } from "../utils/agentMath.js";
import { itemSelect, orderSellCents } from "../utils/salesSerialize.js";
import { num2, num3 } from "../utils/inventorySerialize.js";
import { cancelOrderSchema, createAgentOrderSchema, createSalesPageSchema, exportOrdersSchema, setPrefixSchema, updateAgentOrderSchema, updateSalesPageSchema } from "../validators/agent.js";

// نظام أوردرات الفتيات — مساحة الفتاة. كل استعلام هنا مقيَّد بـ agentId = المستخدم الحالي من التوكن (لا يُقبل معرّف فتاة من الجسم/المسار)،
// فأي أوردر لفتاة أخرى يردّ 404 ولا يُكشف وجوده.
const requireAgent = requireRole("SALES_AGENT");

export const agentRouter = Router();
agentRouter.use(requireAuth, requireAgent);

type Tx = Prisma.TransactionClient;
const idOf = (v: unknown) => (typeof v === "string" && v.length > 0 && v.length <= 64 ? v : "");

const lineInclude = {
  // محتويات البوكس المعدَّلة لهذا الأوردر؛ ومحتويات المنتج الثابت كاحتياطي للأسطر القديمة التي لا صفوف لها
  components: { include: { item: { select: itemSelect } }, orderBy: { id: "asc" } },
  product: { select: { components: { include: { item: { select: itemSelect } }, orderBy: { id: "asc" } } } },
} satisfies Prisma.AgentOrderLineInclude;

const agentOrderInclude = {
  lines: { orderBy: { id: "asc" }, include: lineInclude },
  salesPage: { select: { id: true, name: true } },
  // الأسطر والمكونات لحساب سعر الخروج وسعر المخزون تلقائياً (ثابت بعد التنفيذ، وحيّ قبله)
  salesOrder: {
    select: {
      id: true,
      status: true,
      returnFlagged: true,
      stockDeducted: true,
      lines: {
        select: {
          quantity: true,
          boxPrice: true,
          components: { include: { item: { select: itemSelect } } },
        },
      },
    },
  },
} satisfies Prisma.AgentOrderInclude;
type AgentOrderRow = Prisma.AgentOrderGetPayload<{ include: typeof agentOrderInclude }>;

type SalesLineLike = {
  quantity: number;
  boxPrice: { toString(): string } | null;
  components: Parameters<typeof orderSellCents>[0][number]["components"];
};

type AccountingSourceRow = {
  status: AgentOrderRow["status"];
  sellPrice: AgentOrderRow["sellPrice"];
  salesOrder: {
    status: string;
    returnFlagged: boolean;
    lines: SalesLineLike[];
  } | null;
};

/** سعر الخروج من المخزون بالقروش (من مكونات المخزون) */
const agentSellCents = (o: AccountingSourceRow) => (o.salesOrder ? orderSellCents(o.salesOrder.lines) : toCents(o.sellPrice));

function exitCentsOfSalesLines(lines: SalesLineLike[]) {
  if (lines.some((l) => l.boxPrice !== null)) {
    return lines.reduce((acc, l) => acc + (l.boxPrice !== null ? l.quantity * toCents(l.boxPrice) : orderSellCents([l])), 0);
  }
  return orderSellCents(lines);
}

/** سعر الخروج الفعلي للأوردر بالقروش: إن وُجد boxPrice على البنود يُحسب منه، وإلا يتبع سعر المخزون */
const agentExitCents = (o: AccountingSourceRow) => (o.salesOrder ? exitCentsOfSalesLines(o.salesOrder.lines) : toCents(o.sellPrice));

type LineRow = AgentOrderRow["lines"][number];
/** محتويات البند الفعلية: المعدَّلة إن وُجدت، وإلا محتويات المنتج الثابت (أسطر أُنشئت قبل ميزة التعديل) */
const effectiveComponents = (l: LineRow) => (l.components.length > 0 ? l.components : (l.product?.components ?? []));

/** الفتاة ترى بيانات الفاتورة وأسعار البوكسات/الشحن التي أدخلتها فقط؛ لا ترى أسعار مكونات المخزون ولا التكاليف */
export function serializeAgentOrder(o: AgentOrderRow) {
  const exitCents = agentExitCents(o);
  const shipCents = toCents(o.shippingPrice);
  return {
    id: o.id,
    seq: o.seq,
    waybill: o.waybill,
    date: o.date,
    customerName: o.customerName,
    customerPhone: o.customerPhone,
    customerAddress: o.customerAddress,
    notes: o.notes,
    salesPageId: o.salesPageId ?? null,
    salesPageName: o.salesPage?.name ?? null,
    sellPrice: fromCents(exitCents),
    ...(o.shippingPrice !== null
      ? {
          shippingPrice: Number(o.shippingPrice.toString()),
          totalWithShipping: fromCents(exitCents + shipCents),
        }
      : {}),
    status: o.status,
    salesStatus: o.salesOrder?.status ?? null,
    returnFlagged: o.salesOrder?.returnFlagged ?? false,
    exportedAt: o.exportedAt?.toISOString() ?? null,
    cancelledAt: o.cancelledAt?.toISOString() ?? null,
    cancelReason: o.cancelReason,
    createdAt: o.createdAt.toISOString(),
    lines: o.lines.map((l) => {
      const bp = l.boxPrice === null ? null : Number(l.boxPrice.toString());
      return {
        id: l.id,
        productId: l.productId,
        productName: l.productName,
        quantity: l.quantity,
        ...(bp !== null ? { boxPrice: bp, lineTotal: fromCents(l.quantity * toCents(bp)) } : {}),
        // محتويات الوحدة الواحدة من البوكس (اسم وكمية فقط — بلا أي سعر)
        components: effectiveComponents(l).map((c) => ({ itemId: c.itemId, itemName: c.item.name, unit: c.item.unit, quantity: num3(c.quantity) })),
      };
    }),
  };
}

export const toAccountingRow = (o: AccountingSourceRow): AccountingRow => ({
  agentStatus: o.status,
  salesStatus: (o.salesOrder?.status ?? null) as AccountingRow["salesStatus"],
  returnFlagged: o.salesOrder?.returnFlagged ?? false,
  sellCents: agentSellCents(o),
  exitCents: agentExitCents(o),
  shippingCents: 0, // سعر شحن المحاسبة يُحسب من جدول المبيعات لا من مساحة الفتاة
});

const agentItemSelect = { ...itemSelect, addPrice: true, removePrice: true } as const;

async function loadActiveProducts(db: Pick<Tx, "salesProduct">, rawProductIds: string[]) {
  const productIds = [...new Set(rawProductIds)]; // نفس البوكس قد يظهر في أكثر من بند بمحتويات مختلفة
  const products = await db.salesProduct.findMany({ where: { id: { in: productIds } }, include: { components: { include: { item: { select: agentItemSelect } } } } });
  if (products.length !== productIds.length) throw notFound("أحد المنتجات غير موجود");
  for (const p of products) {
    if (!p.isActive) throw badRequest(`«${p.name}» غير مفعّل`);
    if (p.components.length === 0) throw badRequest(`«${p.name}» بلا محتويات`);
  }
  return new Map(products.map((p) => [p.id, p]));
}

type LoadedProducts = Awaited<ReturnType<typeof loadActiveProducts>>;
type ItemRow = Prisma.InventoryItemGetPayload<{ select: typeof agentItemSelect }>;
interface ResolvedLine {
  productId: string;
  productName: string;
  quantity: number;
  boxPrice: number | null;
  /** كمية الوحدة الواحدة من كل صنف في هذا البوكس */
  components: { itemId: string; quantity: number | string }[];
}
interface LineInput {
  productId: string;
  quantity: number;
  boxPrice?: number;
  components?: { itemId: string; quantity: number }[];
}

/** سعر بيع البنود بالقروش (إذا أدخلت الفتاة سعر البوكس يُؤخذ عن كل بوكس، وإلا من مكونات المخزون) */
const resolvedExitCents = (lines: { quantity: number; boxPrice: number | null; components: { itemId: string; quantity: number | string }[] }[], items: Map<string, ItemRow>) =>
  lines.reduce(
    (acc, l) =>
      acc +
      (l.boxPrice !== null
        ? l.quantity * toCents(l.boxPrice)
        : orderSellCents([{ quantity: l.quantity, components: l.components.map((c) => ({ id: c.itemId, itemId: c.itemId, quantity: c.quantity, item: items.get(c.itemId)! })) }])),
    0
  );

/**
 * يحوّل بنود الطلب إلى بنود جاهزة للحفظ: المحتويات المرسلة (تعديل الفتاة) بعد التحقق من الأصناف، وإلا نسخة من المنتج الثابت.
 * الفتاة تضيف/تغيّر/تحذف أصنافاً من محتويات بوكسها فقط؛ المنتج الثابت نفسه لا يتغير أبداً.
 */
async function resolveLines(tx: Tx, products: LoadedProducts, input: LineInput[]) {
  const wanted = new Set<string>();
  for (const l of input) {
    const p = products.get(l.productId)!;
    // تحميل مكونات المنتج الثابت الأصلية ومكونات السطر المختارة معاً حتى لا يُفقد removePrice عند حذف صنف
    for (const c of p.components) wanted.add(c.itemId);
    if (l.components) for (const c of l.components) wanted.add(c.itemId);
  }
  const rows = await tx.inventoryItem.findMany({ where: { id: { in: [...wanted] } }, select: agentItemSelect });
  const items = new Map(rows.map((i) => [i.id, i]));
  const adjustPrices = new Map(
    rows.map((i) => [i.id, { addPriceCents: toCents(i.addPrice), removePriceCents: toCents(i.removePrice) }])
  );
  const lines: ResolvedLine[] = input.map((l) => {
    const p = products.get(l.productId)!;
    const components: ResolvedLine["components"] = l.components
      ? l.components.map((c) => ({ itemId: c.itemId, quantity: c.quantity }))
      : p.components.map((c) => ({ itemId: c.itemId, quantity: c.quantity.toString() }));
    for (const c of components) {
      const item = items.get(c.itemId);
      if (!item) throw notFound(`أحد أصناف «${p.name}» غير موجود`);
      // الأصناف المؤرشفة تُرفض فقط إذا أضافتها الفتاة؛ نسخة المنتج الثابت الأصلية تمر كما كانت
      if (l.components && !item.isActive) throw badRequest(`الصنف «${item.name}» غير مفعّل`);
    }
    let boxPrice: number | null;
    if (p.fixedPrice !== null) {
      // السعر الثابت مفعّل: السيرفر هو المرجع الوحيد ويتجاهل أي سعر مرسل من العميل
      const calc = calcAdjustedBoxPriceCents(toCents(p.fixedPrice), p.components, components, adjustPrices);
      boxPrice = fromCents(calc.unitCents);
    } else {
      boxPrice = l.boxPrice ?? null;
    }
    return { productId: p.id, productName: p.name, quantity: l.quantity, boxPrice, components };
  });
  return { lines, items, sellCents: resolvedExitCents(lines, items) };
}

const linesCreate = (lines: ResolvedLine[]) =>
  lines.map((l) => ({
    productId: l.productId,
    productName: l.productName,
    quantity: l.quantity,
    boxPrice: l.boxPrice === null ? null : centsToDecimalString(toCents(l.boxPrice)),
    components: { create: l.components.map((c) => ({ itemId: c.itemId, quantity: c.quantity })) },
  }));

/** سعر الخروج للأوردر المحفوظ حالياً بالقروش (يدعم سعر البوكس المخصص أو التقدير التلقائي من المكونات) */
const storedLinesExitCents = (lines: LineRow[]) =>
  lines.reduce(
    (acc, l) =>
      acc + (l.boxPrice !== null ? l.quantity * toCents(l.boxPrice) : orderSellCents([{ quantity: l.quantity, components: effectiveComponents(l) }])),
    0
  );

async function getOwnOrder(agentId: string, rawId: unknown) {
  const o = await prisma().agentOrder.findFirst({ where: { id: idOf(rawId), agentId }, include: agentOrderInclude });
  if (!o) throw notFound("الأوردر غير موجود");
  return o;
}

async function lockOwnOrder(tx: Tx, agentId: string, orderId: string) {
  const rows = await tx.$queryRaw<{ id: string; status: string; salesOrderId: string | null; salesPageId: string | null }[]>`
    SELECT "id","status"::text AS "status","salesOrderId","salesPageId" FROM "AgentOrder" WHERE "id" = ${orderId} AND "agentId" = ${agentId} FOR UPDATE
  `;
  if (rows.length === 0) throw notFound("الأوردر غير موجود");
  return rows[0];
}

/** التحقق من اسم الصفحة (مصدر الأوردر): إجباري بمجرد وجود صفحة نشطة واحدة على الأقل */
async function validateOrderPage(tx: Tx, rawPageId: string | null | undefined, currentPageId?: string | null): Promise<string | null> {
  const activeCount = await tx.salesPage.count({ where: { isActive: true } });
  if (typeof rawPageId === "string") {
    const page = await tx.salesPage.findUnique({ where: { id: rawPageId }, select: { id: true, isActive: true } });
    if (!page) throw badRequest("الصفحة المختارة غير موجودة");
    if (!page.isActive && page.id !== currentPageId) throw badRequest("هذه الصفحة موقوفة حالياً ولا يمكن اختيارها");
    return page.id;
  }
  if (activeCount > 0) throw badRequest("اختيار اسم الصفحة إجباري");
  return null;
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

// صفحات البيع المفعّلة للاختيار الإجباري في أوردر الفتاة (معرّف واسم فقط بلا أي مبالغ)
agentRouter.get(
  "/pages",
  asyncHandler(async (_req, res) => {
    const pages = await prisma().salesPage.findMany({
      where: { isActive: true },
      orderBy: [{ name: "asc" }, { id: "asc" }],
      select: { id: true, name: true },
    });
    res.json({ pages });
  })
);

// البوكسات المتاحة للاختيار: الاسم والسعر الثابت ومحتوياته (صنف + كمية + أسعار الإضافة والحذف)؛ بلا تكلفة ولا سعر مخزون ولا رصيد مخزون
agentRouter.get(
  "/products",
  asyncHandler(async (_req, res) => {
    const products = await prisma().salesProduct.findMany({
      where: { isActive: true, components: { some: {} } },
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        fixedPrice: true,
        components: {
          orderBy: { id: "asc" },
          select: { itemId: true, quantity: true, item: { select: { name: true, unit: true, addPrice: true, removePrice: true } } },
        },
      },
    });
    res.json({
      products: products.map((p) => ({
        id: p.id,
        name: p.name,
        fixedPrice: p.fixedPrice === null ? null : num2(p.fixedPrice),
        components: p.components.map((c) => ({
          itemId: c.itemId,
          itemName: c.item.name,
          unit: c.item.unit,
          quantity: num3(c.quantity),
          addPrice: num2(c.item.addPrice),
          removePrice: num2(c.item.removePrice),
        })),
      })),
    });
  })
);

// أصناف المخزون المفعّلة لإضافتها إلى محتويات بوكس (الاسم والوحدة وأسعار الإضافة/الحذف فقط: بلا تكلفة ولا سعر مخزون ولا أرصدة)
agentRouter.get(
  "/items",
  asyncHandler(async (_req, res) => {
    const items = await prisma().inventoryItem.findMany({
      where: { isActive: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true, unit: true, addPrice: true, removePrice: true },
    });
    res.json({
      items: items.map((i) => ({
        id: i.id,
        name: i.name,
        unit: i.unit,
        addPrice: num2(i.addPrice),
        removePrice: num2(i.removePrice),
      })),
    });
  })
);

function bucketWhere(bucket: Bucket): Prisma.AgentOrderWhereInput {
  switch (bucket) {
    case "all":
      return {};
    case "draft":
      return { status: "DRAFT" };
    case "exported":
      return { status: "EXPORTED" };
    case "cancelled":
      return { status: "CANCELLED" };
    case "returned":
      return { status: "EXPORTED", salesOrder: { is: { OR: [{ status: "RETURNED" }, { returnFlagged: true }] } } };
    case "delivered":
      return { status: "EXPORTED", salesOrder: { is: { status: "DELIVERED", returnFlagged: false } } };
    case "shipped":
      return { status: "EXPORTED", salesOrder: { is: { status: "SHIPPED", returnFlagged: false } } };
    case "executed":
      return { status: "EXPORTED", salesOrder: { is: { status: { in: ["EXECUTED", "SHIPPED", "DELIVERED"] }, returnFlagged: false } } };
  }
}

agentRouter.get(
  "/orders",
  asyncHandler(async (req, res) => {
    const bucketRaw = typeof req.query.bucket === "string" ? req.query.bucket : "all";
    const bucket: Bucket = (BUCKETS as readonly string[]).includes(bucketRaw) ? (bucketRaw as Bucket) : "all";
    const q = typeof req.query.q === "string" ? req.query.q.trim().slice(0, 80) : "";
    const rawLimit = Number(req.query.limit);
    const rawOffset = Number(req.query.offset);
    const limit = Number.isInteger(rawLimit) && rawLimit >= 1 ? Math.min(rawLimit, 1000) : 500;
    const offset = Number.isInteger(rawOffset) && rawOffset >= 0 ? rawOffset : 0;
    const where: Prisma.AgentOrderWhereInput = {
      agentId: req.user!.id,
      ...bucketWhere(bucket),
      ...(q
        ? { OR: [{ waybill: { contains: q } }, { customerName: { contains: q, mode: "insensitive" as const } }, { customerPhone: { contains: q } }] }
        : {}),
    };
    const [rows, total] = await Promise.all([
      prisma().agentOrder.findMany({
        where,
        include: agentOrderInclude,
        orderBy: [{ date: "desc" }, { seq: "desc" }, { id: "desc" }],
        take: limit,
        skip: offset,
      }),
      prisma().agentOrder.count({ where }),
    ]);
    const orders = rows.map(serializeAgentOrder);
    res.json({ orders, total, hasMore: offset + orders.length < total });
  })
);

agentRouter.get(
  "/dashboard",
  asyncHandler(async (req, res) => {
    const rows = await prisma().agentOrder.findMany({
      where: { agentId: req.user!.id },
      select: {
        status: true,
        sellPrice: true,
        salesOrder: {
          select: {
            status: true,
            returnFlagged: true,
            lines: {
              select: {
                quantity: true,
                boxPrice: true,
                components: {
                  select: {
                    id: true,
                    itemId: true,
                    quantity: true,
                    unitCostSnapshot: true,
                    unitSellSnapshot: true,
                    damaged: true,
                    item: { select: itemSelect },
                  },
                },
              },
            },
          },
        },
      },
    });
    res.json({ summary: summarize(rows.map(toAccountingRow)) });
  })
);

agentRouter.post(
  "/orders",
  asyncHandler(async (req, res) => {
    const body = createAgentOrderSchema.parse(req.body);
    const agentId = req.user!.id;
    const created = await prisma().$transaction(async (tx) => {
      const salesPageId = await validateOrderPage(tx, body.salesPageId);
      const products = await loadActiveProducts(tx, body.lines.map((l) => l.productId));
      const resolved = await resolveLines(tx, products, body.lines);
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
          salesPageId,
          sellPrice: centsToDecimalString(resolved.sellCents),
          ...(body.shippingPrice !== undefined
            ? { shippingPrice: body.shippingPrice === null ? null : centsToDecimalString(toCents(body.shippingPrice)) }
            : {}),
          lines: { create: linesCreate(resolved.lines) },
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
      const nextSalesPageId = body.salesPageId !== undefined ? await validateOrderPage(tx, body.salesPageId, locked.salesPageId) : undefined;
      if (body.lines) {
        const products = await loadActiveProducts(tx, body.lines.map((l) => l.productId));
        const resolved = await resolveLines(tx, products, body.lines);
        await tx.agentOrderLine.deleteMany({ where: { orderId: own.id } }); // المحتويات تُحذف معها (cascade)
        for (const l of linesCreate(resolved.lines)) await tx.agentOrderLine.create({ data: { orderId: own.id, ...l } });
      }
      await tx.agentOrder.update({
        where: { id: own.id },
        data: {
          ...(body.date !== undefined ? { date: body.date } : {}),
          ...(body.customerName !== undefined ? { customerName: body.customerName } : {}),
          ...(body.customerPhone !== undefined ? { customerPhone: body.customerPhone } : {}),
          ...(body.customerAddress !== undefined ? { customerAddress: body.customerAddress } : {}),
          ...(body.notes !== undefined ? { notes: body.notes } : {}),
          ...(nextSalesPageId !== undefined ? { salesPageId: nextSalesPageId } : {}),
          ...(body.shippingPrice !== undefined
            ? { shippingPrice: body.shippingPrice === null ? null : centsToDecimalString(toCents(body.shippingPrice)) }
            : {}),
        },
      });
      // السعر: يُعاد حسابه من سعر البوكسات أو من مكوناتها عند كل تعديل للمسودة
      const current = await tx.agentOrderLine.findMany({ where: { orderId: own.id }, include: lineInclude });
      await tx.agentOrder.update({ where: { id: own.id }, data: { sellPrice: centsToDecimalString(storedLinesExitCents(current)) } });
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
    const order = await tx.agentOrder.findUniqueOrThrow({ where: { id: orderId }, include: { lines: { orderBy: { id: "asc" }, include: lineInclude } } });
    if (order.lines.length === 0) throw badRequest(`الأوردر ${order.waybill} بلا منتجات`);
    const products = await loadActiveProducts(tx, order.lines.map((l) => l.productId).filter((v): v is string => v !== null));
    if (order.lines.some((l) => l.productId === null)) throw badRequest(`الأوردر ${order.waybill} يحتوي منتجاً لم يعد موجوداً`);
    const dup = await tx.salesOrder.findFirst({ where: { waybill: { equals: order.waybill, mode: "insensitive" } }, select: { id: true } });
    if (dup) throw conflict(`رقم البوليصة ${order.waybill} مستخدم في أوردر آخر`);
    const exitCents = storedLinesExitCents(order.lines);
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
        salesPageId: order.salesPageId,
        agentSellPrice: centsToDecimalString(exitCents),
        ...(order.shippingPrice !== null ? { shippingPrice: order.shippingPrice } : {}),
        lines: {
          create: order.lines.map((l) => {
            const p = products.get(l.productId!)!;
            // تُنسخ محتويات البوكس كما عدّلتها الفتاة (مع سعر البوكس الذي أدخلته إن وُجد)
            return {
              productId: p.id,
              productName: p.name,
              quantity: l.quantity,
              boxPrice: l.boxPrice,
              components: { create: effectiveComponents(l).map((c) => ({ itemId: c.itemId, quantity: c.quantity })) },
            };
          }),
        },
      },
    });
    await tx.agentOrder.update({
      where: { id: orderId },
      data: { status: "EXPORTED", exportedAt: new Date(), exportedById: agentId, salesOrderId: salesOrder.id, sellPrice: centsToDecimalString(exitCents) },
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

// إلغاء بعد التصدير وقبل التنفيذ فقط: سبب إلزامي + تأكيد، يُحفظ السجل ويبقى الأوردر ورقم بوليصته. بعد التنفيذ يُعالج عبر المرتجع من المشرف/الإدارة.
agentRouter.post(
  "/orders/:id/cancel",
  asyncHandler(async (req, res) => {
    const body = cancelOrderSchema.parse(req.body);
    const agentId = req.user!.id;
    const orderId = idOf(req.params.id);
    if (!orderId) throw notFound("الأوردر غير موجود");
    const updated = await prisma().$transaction(async (tx) => {
      const locked = await lockOwnOrder(tx, agentId, orderId);
      if (locked.status === "DRAFT") throw conflict("الأوردر لم يُصدَّر بعد؛ يمكنك حذفه بدل إلغائه.");
      if (locked.status === "CANCELLED") throw conflict("الأوردر ملغي بالفعل");
      const now = new Date();
      // مزامنة أوردر المبيعات الرئيسي في نفس المعاملة بناءً على locked.salesOrderId المقروء بعد القفل (يمنع سباق التصدير والإلغاء)
      if (locked.salesOrderId) {
        await tx.$queryRaw`SELECT "id" FROM "SalesOrder" WHERE "id" = ${locked.salesOrderId} FOR UPDATE`;
        const so = await tx.salesOrder.findUnique({ where: { id: locked.salesOrderId }, select: { status: true, stockDeducted: true } });
        if (so && (so.stockDeducted || so.status !== "REGISTERED")) {
          throw conflict("لا يمكن إلغاء أوردر بعد تنفيذه أو شحنه أو تسليمه. تواصل مع المشرف أو الإدارة لتسجيل مرتجع.");
        }
        await tx.salesOrder.update({ where: { id: locked.salesOrderId }, data: { cancelledAt: now, cancelReason: body.reason, cancelledById: agentId } });
        await tx.salesOrderStatusLog.create({ data: { orderId: locked.salesOrderId, event: "CANCEL", fromValue: null, toValue: body.reason.slice(0, 200), byId: agentId } });
      }
      await tx.agentOrder.update({ where: { id: locked.id }, data: { status: "CANCELLED", cancelledAt: now, cancelReason: body.reason, cancelledById: agentId } });
      return tx.agentOrder.findUniqueOrThrow({ where: { id: locked.id }, include: agentOrderInclude });
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

// ===== إدارة أسماء صفحات البيع (الإدارة فقط) =====
const isUniquePageViolation = (e: unknown) => (e as { code?: string })?.code === "P2002";

salesAgentsAdminRouter.get(
  "/pages",
  asyncHandler(async (_req, res) => {
    const pages = await prisma().salesPage.findMany({
      orderBy: [{ name: "asc" }, { id: "asc" }],
      select: {
        id: true,
        name: true,
        isActive: true,
        createdAt: true,
        _count: { select: { agentOrders: true, salesOrders: true } },
      },
    });
    res.json({
      pages: pages.map((p) => ({
        id: p.id,
        name: p.name,
        isActive: p.isActive,
        ordersCount: Math.max(p._count.agentOrders, p._count.salesOrders),
        createdAt: p.createdAt.toISOString(),
      })),
    });
  })
);

salesAgentsAdminRouter.post(
  "/pages",
  asyncHandler(async (req, res) => {
    const { name } = createSalesPageSchema.parse(req.body);
    const dup = await prisma().salesPage.findFirst({
      where: { name: { equals: name, mode: "insensitive" } },
      select: { id: true },
    });
    if (dup) throw conflict("اسم الصفحة موجود مسبقاً");
    try {
      const page = await prisma().salesPage.create({
        data: { name },
        select: { id: true, name: true, isActive: true, createdAt: true },
      });
      res.status(201).json({ page: { ...page, ordersCount: 0, createdAt: page.createdAt.toISOString() } });
    } catch (e) {
      if (isUniquePageViolation(e)) throw conflict("اسم الصفحة موجود مسبقاً");
      throw e;
    }
  })
);

salesAgentsAdminRouter.patch(
  "/pages/:id",
  asyncHandler(async (req, res) => {
    const id = idOf(req.params.id);
    const existing = await prisma().salesPage.findUnique({ where: { id }, select: { id: true } });
    if (!existing) throw notFound("الصفحة غير موجودة");
    const body = updateSalesPageSchema.parse(req.body);
    if (body.name !== undefined) {
      const dup = await prisma().salesPage.findFirst({
        where: { name: { equals: body.name, mode: "insensitive" }, id: { not: id } },
        select: { id: true },
      });
      if (dup) throw conflict("اسم الصفحة موجود مسبقاً");
    }
    try {
      const page = await prisma().salesPage.update({
        where: { id },
        data: {
          ...(body.name !== undefined ? { name: body.name } : {}),
          ...(body.isActive !== undefined ? { isActive: body.isActive } : {}),
        },
        select: {
          id: true,
          name: true,
          isActive: true,
          createdAt: true,
          _count: { select: { agentOrders: true, salesOrders: true } },
        },
      });
      res.json({
        page: {
          id: page.id,
          name: page.name,
          isActive: page.isActive,
          ordersCount: Math.max(page._count.agentOrders, page._count.salesOrders),
          createdAt: page.createdAt.toISOString(),
        },
      });
    } catch (e) {
      if (isUniquePageViolation(e)) throw conflict("اسم الصفحة موجود مسبقاً");
      throw e;
    }
  })
);

salesAgentsAdminRouter.delete(
  "/pages/:id",
  asyncHandler(async (req, res) => {
    const id = idOf(req.params.id);
    const existing = await prisma().salesPage.findUnique({
      where: { id },
      select: { id: true, _count: { select: { agentOrders: true, salesOrders: true } } },
    });
    if (!existing) throw notFound("الصفحة غير موجودة");
    if (existing._count.agentOrders > 0 || existing._count.salesOrders > 0) {
      throw conflict("لا يمكن حذف صفحة مرتبطة بأوردرات؛ يمكنك إيقافها بدلاً من حذفها");
    }
    try {
      await prisma().salesPage.delete({ where: { id } });
      res.json({ ok: true });
    } catch (e) {
      if ((e as { code?: string })?.code === "P2003") {
        throw conflict("لا يمكن حذف صفحة مرتبطة بأوردرات؛ يمكنك إيقافها بدلاً من حذفها");
      }
      throw e;
    }
  })
);

