// منطق نظام الفتيات النقي (بلا قاعدة بيانات): الترقيم والحسابات. كل المبالغ بالقروش (أعداد صحيحة) لتفادي أخطاء الكسور العشرية.

/** رقم البوليصة = Prefix × 100 + الرقم التسلسلي (مثال: 500/1 → 50001، 500/100 → 50100) */
export const waybillNumber = (prefix: number, seq: number) => prefix * 100 + seq;

/** أعلى رقم مسموح للفتاة قبل أن تدخل نطاق فتاة أخرى: (أقرب Prefix أكبر) × 100 − 1 */
export const waybillUpperBound = (prefix: number, higherPrefix: number | null) =>
  higherPrefix === null ? Number.MAX_SAFE_INTEGER : higherPrefix * 100 - 1;

export const toCents = (n: number | string | { toString(): string } | null | undefined) =>
  n === null || n === undefined ? 0 : Math.round(Number(n.toString()) * 100);
export const fromCents = (c: number) => Math.round(c) / 100;
export const centsToDecimalString = (c: number) => (Math.round(c) / 100).toFixed(2);

export interface ComponentQtyLike {
  itemId: string;
  quantity: number | string | { toString(): string };
}

export interface ItemAdjustPriceCents {
  addPriceCents: number;
  removePriceCents: number;
}

/**
 * حساب سعر البوكس تلقائياً بالقروش انطلاقاً من «السعر الثابت اليدوي» مع تطبيق
 * «سعر الإضافة» عند زيادة/إضافة صنف و«سعر الحذف» عند إنقاص/حذف صنف (مستقل عن أسعار المخزون).
 */
export function calcAdjustedBoxPriceCents(
  fixedPriceCents: number,
  defaultComponents: ComponentQtyLike[],
  selectedComponents: ComponentQtyLike[],
  itemAdjustPrices: ReadonlyMap<string, ItemAdjustPriceCents>
): { baseCents: number; deltaCents: number; unitCents: number } {
  const defMilli = new Map<string, number>();
  for (const c of defaultComponents) {
    defMilli.set(c.itemId, (defMilli.get(c.itemId) ?? 0) + Math.round(Number(c.quantity.toString()) * 1000));
  }
  const selMilli = new Map<string, number>();
  for (const c of selectedComponents) {
    selMilli.set(c.itemId, (selMilli.get(c.itemId) ?? 0) + Math.round(Number(c.quantity.toString()) * 1000));
  }
  const allIds = new Set([...defMilli.keys(), ...selMilli.keys()]);
  let deltaCents = 0;
  for (const itemId of allIds) {
    const diffMilli = (selMilli.get(itemId) ?? 0) - (defMilli.get(itemId) ?? 0);
    if (diffMilli === 0) continue;
    const prices = itemAdjustPrices.get(itemId);
    if (!prices) continue;
    if (diffMilli > 0) {
      deltaCents += Math.round((diffMilli * prices.addPriceCents) / 1000);
    } else {
      deltaCents -= Math.round(((-diffMilli) * prices.removePriceCents) / 1000);
    }
  }
  return {
    baseCents: fixedPriceCents,
    deltaCents,
    unitCents: Math.max(0, fixedPriceCents + deltaCents),
  };
}

export const FIXED_FEE_CENTS = 700; // 7 جنيه لكل أوردر مسلَّم
/** العمولة 3% من مجموع سعر البيع (بالقروش) مقرَّبة لأقرب قرش (النصف لأعلى) على المجموع لا على كل أوردر */
export const commissionCents = (salesCents: number) => Math.floor((salesCents * 3 + 50) / 100);

export type SalesStatus = "REGISTERED" | "EXECUTED" | "SHIPPED" | "DELIVERED" | "RETURNED";
export type AgentStatus = "DRAFT" | "EXPORTED" | "CANCELLED";

export interface AccountingRow {
  agentStatus: AgentStatus;
  /** حالة أوردر المبيعات المرتبط (null للمسودة) */
  salesStatus: SalesStatus | null;
  returnFlagged: boolean;
  /** سعر الخروج من المخزون (مكوّنات البوكس × سعر بيع الصنف بالمخزون) */
  sellCents: number;
  /** سعر الخروج الفعلي الذي أدخلته الفتاة (وإن غاب يساوي sellCents) */
  exitCents?: number;
  shippingCents: number;
}

export const BUCKETS = ["all", "draft", "exported", "executed", "shipped", "delivered", "returned", "cancelled"] as const;
export type Bucket = (typeof BUCKETS)[number];

const isLive = (r: AccountingRow) => r.agentStatus === "EXPORTED" && r.salesStatus !== null;
export const isReturned = (r: AccountingRow) => isLive(r) && (r.salesStatus === "RETURNED" || r.returnFlagged);

/** هل يدخل الأوردر في الحساب؟ مسلَّم، غير مُعلَّم/مسجَّل مرتجعاً، غير ملغي (يُحتسب مرة واحدة لأنه صف واحد) */
export const isDelivered = (r: AccountingRow) => isLive(r) && r.salesStatus === "DELIVERED" && !r.returnFlagged;
export const isShipped = (r: AccountingRow) => isLive(r) && r.salesStatus === "SHIPPED" && !r.returnFlagged;
/** وصل إلى «تم التنفيذ» أو ما بعده (شحن/تسليم) ولم يُرجَع */
export const isExecuted = (r: AccountingRow) =>
  isLive(r) && !r.returnFlagged && (r.salesStatus === "EXECUTED" || r.salesStatus === "SHIPPED" || r.salesStatus === "DELIVERED");

export function matchesBucket(r: AccountingRow, b: Bucket): boolean {
  switch (b) {
    case "all": return true;
    case "draft": return r.agentStatus === "DRAFT";
    case "exported": return r.agentStatus === "EXPORTED";
    case "executed": return isExecuted(r);
    case "shipped": return isShipped(r);
    case "delivered": return isDelivered(r);
    case "returned": return isReturned(r);
    case "cancelled": return r.agentStatus === "CANCELLED";
  }
}

export interface AgentSummary {
  total: number;
  unexported: number;
  exported: number;
  executed: number;
  shipped: number;
  delivered: number;
  returned: number;
  cancelled: number;
  deliveredSales: number;
  deliveredCount: number;
  fixedFee: number;
  commission: number;
  totalDue: number;
}

export function summarize(rows: AccountingRow[]): AgentSummary {
  const delivered = rows.filter(isDelivered);
  const salesCents = delivered.reduce((a, r) => a + (r.exitCents ?? r.sellCents), 0);
  const fixed = delivered.length * FIXED_FEE_CENTS;
  const commission = commissionCents(salesCents);
  return {
    total: rows.length,
    unexported: rows.filter((r) => matchesBucket(r, "draft")).length,
    exported: rows.filter((r) => matchesBucket(r, "exported")).length,
    executed: rows.filter(isExecuted).length,
    shipped: rows.filter(isShipped).length,
    delivered: delivered.length,
    returned: rows.filter(isReturned).length,
    cancelled: rows.filter((r) => matchesBucket(r, "cancelled")).length,
    deliveredSales: fromCents(salesCents),
    deliveredCount: delivered.length,
    fixedFee: fromCents(fixed),
    commission: fromCents(commission),
    totalDue: fromCents(fixed + commission),
  };
}

/** الحسابات العامة: سعر الخروج من المخزون + سعر الخروج (من الفتاة) + الشحن + فرق الصرف %. الإجمالي الكلي = سعر الخروج + الشحن. */
export function generalAccounts(rows: AccountingRow[], draftCount = 0) {
  const delivered = rows.filter(isDelivered);
  const inventorySellCents = delivered.reduce((a, r) => a + r.sellCents, 0);
  const exitPriceCents = delivered.reduce((a, r) => a + (r.exitCents ?? r.sellCents), 0);
  const shippingCents = delivered.reduce((a, r) => a + r.shippingCents, 0);
  const grandCents = exitPriceCents + shippingCents;
  const priceDiffCents = exitPriceCents - inventorySellCents;
  const pct = (part: number) => (grandCents === 0 ? 0 : Math.round((part / grandCents) * 10000) / 100);
  const priceDiffPercent = inventorySellCents === 0 ? 0 : Math.round((priceDiffCents / inventorySellCents) * 10000) / 100;
  return {
    // نفس تعريف حساب الفتاة: كل الأوردرات (مسودات + مصدَّرة + ملغاة) ⇒ الإجمالي العام = مجموع حسابات الفتيات
    totalOrders: rows.length + draftCount,
    draftCount: draftCount + rows.filter((r) => r.agentStatus === "DRAFT").length,
    deliveredCount: delivered.length,
    shippedCount: rows.filter(isShipped).length,
    returnedCount: rows.filter(isReturned).length,
    cancelledCount: rows.filter((r) => r.agentStatus === "CANCELLED").length,
    /** سعر الخروج من المخزون (قيمة مكونات المخزون للأوردرات المسلّمة) */
    deliveredSales: fromCents(inventorySellCents),
    /** سعر الخروج الذي أدخلته الفتيات للأوردرات المسلّمة */
    deliveredExitPrice: fromCents(exitPriceCents),
    totalShipping: fromCents(shippingCents),
    /** الإجمالي الكلي = سعر الخروج + الشحن */
    grandTotal: fromCents(grandCents),
    salesPercent: pct(exitPriceCents),
    shippingPercent: pct(shippingCents),
    /** فرق صرف (بالجنيه وبالنسبة المئوية) بين سعر الخروج من المخزون وسعر الخروج */
    priceDiff: fromCents(priceDiffCents),
    priceDiffPercent,
  };
}
