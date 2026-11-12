import { Modal } from "../ui/Modal";
import { LoadingState, ErrorState } from "../ui/StatusViews";
import { useCallback } from "react";
import { useResource } from "../../hooks/useResource";
import { accountingService } from "../../services/agentService";
import { formatArabicDate, formatArabicTime } from "../../lib/date";
import { SALES_STATUS_META } from "../sales/status";
import type { OrderLogEntry, SalesOrderStatus } from "../../types";

const NONE: OrderLogEntry[] = [];

const statusText = (v: string | null) => (v && v in SALES_STATUS_META ? SALES_STATUS_META[v as SalesOrderStatus].label : (v ?? "—"));

function describe(l: OrderLogEntry): string {
  if (l.event === "STATUS") return `تغيير الحالة: ${statusText(l.from)} ← ${statusText(l.to)}`;
  if (l.event === "RETURN_FLAG") return l.to === "true" ? "وضع علامة مرتجع" : "إزالة علامة مرتجع";
  if (l.event === "SHIPPING_PRICE") return `سعر الشحن: ${l.from ?? "غير محدد"} ← ${l.to ?? "غير محدد"}`;
  return l.event;
}

// سجل تغييرات الأوردر: الحالة، علامة المرتجع، سعر الشحن — مع هوية من غيّر وتاريخه
export function OrderLogModal({ open, onClose, orderId, waybill }: { open: boolean; onClose: () => void; orderId: string; waybill: string }) {
  const loader = useCallback(() => accountingService.log(orderId), [orderId]);
  const log = useResource<OrderLogEntry[]>(loader, NONE);
  return (
    <Modal open={open} onClose={onClose} title={`سجل الأوردر ${waybill}`} size="md">
      {log.loading ? (
        <LoadingState />
      ) : log.error ? (
        <ErrorState message={log.error} onRetry={() => void log.retry()} />
      ) : log.data.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted">لا توجد تغييرات مسجلة بعد.</p>
      ) : (
        <ol className="flex flex-col gap-2">
          {log.data.map((l) => (
            <li key={l.id} className="rounded-control border border-border px-3 py-2 text-sm">
              <p className="text-text">{describe(l)}</p>
              <p className="mt-0.5 text-xs text-muted">
                {l.by} • {formatArabicDate(l.at)} {formatArabicTime(l.at)}
              </p>
            </li>
          ))}
        </ol>
      )}
    </Modal>
  );
}
