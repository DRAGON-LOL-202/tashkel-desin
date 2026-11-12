import type { AgentOrder, AgentBucket } from "../../types";
import { SALES_STATUS_META } from "../sales/status";

export const BUCKET_LABEL: Record<AgentBucket, string> = {
  all: "الكل",
  draft: "غير مصدّرة",
  exported: "مصدّرة",
  executed: "تم تنفيذها",
  shipped: "مشحونة",
  delivered: "مسلّمة",
  returned: "مرتجعة",
  cancelled: "ملغاة",
};

export const BUCKET_ORDER: AgentBucket[] = ["all", "draft", "exported", "executed", "shipped", "delivered", "returned", "cancelled"];

/** الحالة الظاهرة للفتاة على أوردرها (بدون أي بيانات داخلية) */
export function agentOrderBadge(o: Pick<AgentOrder, "status" | "salesStatus" | "returnFlagged">): { label: string; color: string } {
  if (o.status === "DRAFT") return { label: "غير مصدّر", color: "#6B7C93" };
  if (o.status === "CANCELLED") return { label: "ملغي", color: "#8A8F98" };
  if (o.salesStatus === "RETURNED" || o.returnFlagged) return { label: "مرتجع", color: SALES_STATUS_META.RETURNED.color };
  if (o.salesStatus) {
    const m = SALES_STATUS_META[o.salesStatus];
    return { label: o.salesStatus === "REGISTERED" ? "تم التصدير" : m.label, color: m.color };
  }
  return { label: "تم التصدير", color: "#2E8BC0" };
}

export const rowBadge = (status: keyof typeof SALES_STATUS_META, returnFlagged: boolean, cancelled: boolean) => {
  if (cancelled) return { label: "ملغي", color: "#8A8F98" };
  if (returnFlagged && status !== "RETURNED") return { label: `${SALES_STATUS_META[status].label} • مرتجع`, color: SALES_STATUS_META.RETURNED.color };
  return { label: SALES_STATUS_META[status].label, color: SALES_STATUS_META[status].color };
};
