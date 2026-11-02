import type { SalesOrderStatus } from "../../types";

export const SALES_STATUS_ORDER: SalesOrderStatus[] = ["REGISTERED", "EXECUTED", "SHIPPED", "DELIVERED", "RETURNED"];

export const SALES_STATUS_META: Record<SalesOrderStatus, { label: string; color: string; hint: string }> = {
  REGISTERED: { label: "مسجل", color: "#6B7C93", hint: "لم يُخصم شيء من المخزون بعد" },
  EXECUTED: { label: "تم التنفيذ", color: "#2E8BC0", hint: "يخصم المكونات من المخزون" },
  SHIPPED: { label: "شحن", color: "#D97706", hint: "المكونات مخصومة" },
  DELIVERED: { label: "تم التسليم", color: "#1E8E5A", hint: "المكونات مخصومة" },
  RETURNED: { label: "مرتجع", color: "#D64545", hint: "يعيد المكونات إلى المخزون" },
};

/** هل تُخصم المكونات في هذه الحالة؟ (مطابق للباكند) */
export const isDeductingStatus = (s: SalesOrderStatus) => s === "EXECUTED" || s === "SHIPPED" || s === "DELIVERED";
