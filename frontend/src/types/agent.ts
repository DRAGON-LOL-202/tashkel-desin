// نظام أوردرات الفتيات + متابعة المحاسب + الحسابات (يطابق استجابات /api/agent و/api/accounting و/api/sales-agents)
import type { SalesOrderStatus } from "./sales";

export type AgentOrderStatus = "DRAFT" | "EXPORTED" | "CANCELLED";

/** فلاتر التصنيف (تطابق BUCKETS في الباكند) */
export type AgentBucket = "all" | "draft" | "exported" | "executed" | "shipped" | "delivered" | "returned" | "cancelled";

export interface AgentProduct {
  id: string;
  name: string;
}

export interface AgentOrderLine {
  id: string;
  productId: string | null;
  productName: string;
  quantity: number;
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
  /** محسوب تلقائياً في الباكند من مكونات الأوردر (لا تدخله الفتاة) */
  sellPrice: number;
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
  lines: { productId: string; quantity: number }[];
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
  sellPrice: number | null;
  shippingPrice: number | null;
  status: SalesOrderStatus;
  returnFlagged: boolean;
  cancelled: boolean;
  cancelReason: string | null;
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
  deliveredSales: number;
  totalShipping: number;
  grandTotal: number;
  salesPercent: number;
  shippingPercent: number;
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
