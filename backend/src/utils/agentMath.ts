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
  sellCents: number;
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
  const salesCents = delivered.reduce((a, r) => a + r.sellCents, 0);
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

/** الحسابات العامة: الشحن يُحتسب مرة واحدة لكل أوردر مسلَّم (ولا يدخل ملغي/مرتجع). الإجمالي صفر ← النسب صفر. */
export function generalAccounts(rows: AccountingRow[], draftCount = 0) {
  const delivered = rows.filter(isDelivered);
  const salesCents = delivered.reduce((a, r) => a + r.sellCents, 0);
  const shippingCents = delivered.reduce((a, r) => a + r.shippingCents, 0);
  const grandCents = salesCents + shippingCents;
  const pct = (part: number) => (grandCents === 0 ? 0 : Math.round((part / grandCents) * 10000) / 100);
  return {
    // نفس تعريف حساب الفتاة: كل الأوردرات (مسودات + مصدَّرة + ملغاة) ⇒ الإجمالي العام = مجموع حسابات الفتيات
    totalOrders: rows.length + draftCount,
    draftCount: draftCount + rows.filter((r) => r.agentStatus === "DRAFT").length,
    deliveredCount: delivered.length,
    shippedCount: rows.filter(isShipped).length,
    returnedCount: rows.filter(isReturned).length,
    cancelledCount: rows.filter((r) => r.agentStatus === "CANCELLED").length,
    deliveredSales: fromCents(salesCents),
    totalShipping: fromCents(shippingCents),
    grandTotal: fromCents(grandCents),
    salesPercent: pct(salesCents),
    shippingPercent: pct(shippingCents),
  };
}
