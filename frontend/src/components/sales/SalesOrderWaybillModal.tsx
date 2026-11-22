import { Badge } from "../ui/Badge";
import { Button } from "../ui/Button";
import { Modal } from "../ui/Modal";
import { SalesOrderWaybillSheet } from "./SalesOrderWaybillSheet";
import { SALES_STATUS_META } from "./status";
import type { SalesOrder } from "../../types";

interface SalesOrderWaybillModalProps {
  open: boolean;
  order: SalesOrder | null;
  onClose: () => void;
}

// نافذة معاينة بوليصة التجهيز في صفحة «أوردرات مبيعات إلكترونية» (عرض المحتويات المحددة فقط بدون أي مبالغ)
export function SalesOrderWaybillModal({ open, order, onClose }: SalesOrderWaybillModalProps) {
  if (!open || !order) return null;

  const statusMeta = SALES_STATUS_META[order.status];

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`معاينة بوليصة الأوردر ${order.waybill ? `#${order.waybill}` : ""}`}
      description={order.customerName ? `العميل: ${order.customerName}` : undefined}
      size="lg"
    >
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Badge color={statusMeta.color}>{statusMeta.label}</Badge>
        {order.cancelled && <Badge color="#EF4444">أوردر ملغي</Badge>}
      </div>

      <div className="max-h-[68vh] overflow-y-auto rounded-card border border-border bg-background/50 p-4">
        <SalesOrderWaybillSheet order={order} />
      </div>

      <div className="mt-4 flex justify-end">
        <Button type="button" variant="secondary" onClick={onClose}>
          إغلاق
        </Button>
      </div>
    </Modal>
  );
}
