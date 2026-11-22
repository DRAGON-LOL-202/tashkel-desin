// نظام أوردرات الفتيات + متابعة المحاسب + الحسابات (يطابق استجابات /api/agent و/api/accounting و/api/sales-agents)
import type { SalesOrderStatus } from "./sales";

export type AgentOrderStatus = "DRAFT" | "EXPORTED" | "CANCELLED";

/** فلاتر التصنيف (تطابق BUCKETS في الباكند) */
export type AgentBucket = "all" | "draft" | "exported" | "executed" | "shipped" | "delivered" | "returned" | "cancelled";

/** محتوى بوكس: صنف وكمية الوحدة الواحدة (بلا أي سعر) */
export interface AgentComponent {
  itemId: string;
  itemName: string;
  unit: string;
  quantity: number;
}

export interface AgentProduct {
  id: string;
  name: string;
  /** محتويات المنتج الثابت الافتراضية */
  components: AgentComponent[];
}

/** صنف مخزون يمكن إضافته إلى محتويات بوكس (اسم ووحدة فقط) */
export interface AgentItem {
  id: string;
  name: string;
  unit: string;
}

export interface AgentOrderLine {
  id: string;
  productId: string | null;
  productName: string;
  quantity: number;
  boxPrice?: number | null;
  lineTotal?: number | null;
  /** محتويات الوحدة الواحدة من البوكس في هذا الأوردر */
  components: AgentComponent[];
}

export interface AgentOrder {
  id: string;
  seq: number;
  waybill: string;
  date: string;
  customerName: string;
  customerPhone: string;
  customerAddress: string;
  notes: string;
  /** سعر الخروج (مجموع أسعار البوكسات التي أدخلتها الفتاة، أو تلقائي من المكونات للأوردرات القديمة) */
  sellPrice: number;
  shippingPrice?: number | null;
  totalWithShipping?: number;
  status: AgentOrderStatus;
  /** حالة أوردر المبيعات المرتبط بعد التصدير */
  salesStatus: SalesOrderStatus | null;
  returnFlagged: boolean;
  exportedAt: string | null;
  cancelledAt: string | null;
  cancelReason: string | null;
  createdAt: string;
  lines: AgentOrderLine[];
}

export interface AgentOrderInput {
  date: string;
  customerName: string;
  customerPhone: string;
  customerAddress: string;
  notes: string;
  shippingPrice?: number | null;
  lines: { productId: string; quantity: number; boxPrice?: number; components: { itemId: string; quantity: number }[] }[];
}

export interface AgentProfile {
  prefix: number;
  nextSeq: number;
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

export interface ExportResult {
  id: string;
  result: "EXPORTED" | "ALREADY_EXPORTED" | "CANCELLED" | "ERROR";
  message?: string;
}

export interface FollowOrderLine {
  id: string;
  productName: string;
  quantity: number;
  boxPrice: number | null;
  lineTotal: number | null;
  components: AgentComponent[];
}

export interface FollowStatusCounts {
  all: number;
  EXECUTED: number;
  SHIPPED: number;
  DELIVERED: number;
  RETURNED: number;
}

/** صف في صفحة متابعة المحاسب / تفاصيل حساب فتاة */
export interface FollowOrder {
  id: string;
  waybill: string;
  boxName: string;
  agentId: string | null;
  agentName: string;
  /** AGENT: أوردر فتاة مصدَّر، MANUAL: أوردر يدوي من صفحة المبيعات */
  source: "AGENT" | "MANUAL";
  closerName: string;
  date: string;
  customerName: string;
  customerPhone: string;
  customerAddress: string;
  notes: string;
  lines: FollowOrderLine[];
  /** سعر الخروج (الذي أدخلته الفتاة إن وُجد، وإلا سعر المخزون) */
  sellPrice: number | null;
  /** سعر الخروج من المخزون */
  inventorySellPrice: number | null;
  shippingPrice: number | null;
  status: SalesOrderStatus;
  returnFlagged: boolean;
  returnFlaggedAt: string | null;
  cancelled: boolean;
  cancelReason: string | null;
  createdAt: string;
  exportedAt: string | null;
  shippedAt: string | null;
  deliveredAt: string | null;
  /** يدخل حالياً في حساب المستحقات */
  counted: boolean;
}

export interface OrderLogEntry {
  id: string;
  event: string;
  from: string | null;
  to: string | null;
  by: string;
  at: string;
}

export interface AgentAccountRow extends AgentSummary {
  agentId: string;
  agentName: string;
  isActive: boolean;
  prefix: number | null;
}

export interface AgentAccountTotals {
  total: number;
  delivered: number;
  shipped: number;
  returned: number;
  cancelled: number;
  deliveredSales: number;
  fixedFee: number;
  commission: number;
  totalDue: number;
}

export interface FollowList {
  orders: FollowOrder[];
  /** العدد الكلي المطابق للفلاتر (دقيق دائماً، حتى لو المعروض أقل) */
  total: number;
  hasMore: boolean;
  counts?: FollowStatusCounts;
}

export interface AgentAccountDetail {
  agent: { id: string; name: string };
  summary: AgentSummary;
  orders: FollowOrder[];
  ordersTotal: number;
  hasMore: boolean;
}

export interface GeneralAccounts {
  totalOrders: number;
  deliveredCount: number;
  shippedCount: number;
  returnedCount: number;
  cancelledCount: number;
  /** سعر الخروج من المخزون */
  deliveredSales: number;
  /** سعر الخروج (من الفتاة) */
  deliveredExitPrice: number;
  totalShipping: number;
  /** الإجمالي الكلي = سعر الخروج + الشحن */
  grandTotal: number;
  salesPercent: number;
  shippingPercent: number;
  /** فرق صرف بالجنيه وبالنسبة المئوية بين سعر الخروج من المخزون وسعر الخروج */
  priceDiff: number;
  priceDiffPercent: number;
}

/** إدارة Prefix الفتيات (الإدارة) */
export interface AgentAdminRow {
  id: string;
  name: string;
  username: string;
  isActive: boolean;
  prefix: number | null;
  nextSeq: number | null;
  hasOrders: boolean;
  nextWaybill: number | null;
  maxWaybill: number | null;
}
