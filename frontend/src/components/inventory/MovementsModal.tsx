import { useEffect, useState } from "react";
import { Modal } from "../ui/Modal";
import { Badge } from "../ui/Badge";
import { ErrorState, LoadingState } from "../ui/StatusViews";
import { errorMessage } from "../../lib/api";
import { inventoryService } from "../../services/inventoryService";
import { MOVEMENT_LABEL, fmtMoney, fmtQty, formatBatchCode } from "./format";
import type { InventoryItem, InventoryMovement, InventoryMovementType } from "../../types";

interface MovementsModalProps {
  open: boolean;
  onClose: () => void;
  item: InventoryItem;
}

const TYPE_COLOR: Record<InventoryMovementType, string> = {
  IN: "#1E8E5A",
  RETURN: "#148D72",
  OUT: "#C0392B",
  ADJUST: "#D97706",
};

/** سجل حركات عنصر (الأحدث أولاً). يُحمَّل عند الفتح، ويُعاد تحميله إذا تغيّر رصيد العنصر. */
export function MovementsModal({ open, onClose, item }: MovementsModalProps) {
  const [rows, setRows] = useState<InventoryMovement[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    inventoryService
      .movements(item.id)
      .then((r) => {
        if (!cancelled) {
          setRows(r);
          setError(null);
        }
      })
      .catch((err) => {
        if (!cancelled) setError(errorMessage(err));
      });
    return () => {
      cancelled = true;
    };
  }, [item.id, item.quantity, attempt]);

  return (
    <Modal open={open} onClose={onClose} title="سجل حركات المنتج" description={`${item.name} — الرصيد الحالي: ${fmtQty(item.quantity)} ${item.unit}`} size="xl">
      {error ? (
        <ErrorState
          message={error}
          onRetry={() => {
            setError(null);
            setRows(null);
            setAttempt((a) => a + 1);
          }}
        />
      ) : rows === null ? (
        <LoadingState label="جارٍ تحميل السجل..." />
      ) : rows.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted">لا توجد حركات مسجلة لهذا المنتج بعد</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-right text-xs text-muted">
                <th className="px-2.5 py-2 font-medium">النوع</th>
                <th className="px-2.5 py-2 font-medium">الرصيد السابق</th>
                <th className="px-2.5 py-2 font-medium">الفرق</th>
                <th className="px-2.5 py-2 font-medium">الرصيد الجديد</th>
                <th className="px-2.5 py-2 font-medium">سعر الوحدة وقتها</th>
                <th className="px-2.5 py-2 font-medium">السبب / التفاصيل</th>
                <th className="px-2.5 py-2 font-medium">المسؤول</th>
                <th className="px-2.5 py-2 font-medium">التاريخ</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((m) => (
                <tr key={m.id} className="border-b border-border/60 align-top">
                  <td className="px-2.5 py-2">
                    <Badge color={TYPE_COLOR[m.type]}>{MOVEMENT_LABEL[m.type]}</Badge>
                  </td>
                  <td className="px-2.5 py-2 text-muted">{fmtQty(m.previousBalance)}</td>
                  <td
                    className="px-2.5 py-2 font-semibold"
                    dir="ltr"
                    style={{ color: m.delta < 0 ? "#C0392B" : m.delta > 0 ? "#1E8E5A" : undefined }}
                  >
                    {m.delta > 0 ? "+" : ""}
                    {fmtQty(m.delta)}
                  </td>
                  <td className="px-2.5 py-2 font-semibold text-text">{fmtQty(m.balanceAfter)}</td>
                  <td className="px-2.5 py-2 text-muted">{fmtMoney(m.unitPriceSnapshot)}</td>
                  <td className="px-2.5 py-2 text-xs text-muted">
                    {m.reason && <div className="font-medium text-text">السبب: {m.reason}</div>}
                    {m.referenceId && <div>مرجع: {m.referenceId}</div>}
                    {m.batchId && <div>عملية سحب: {formatBatchCode(m.batchId, m.id)}</div>}
                    {m.note && <div>{m.note}</div>}
                    {!m.reason && !m.referenceId && !m.batchId && !m.note && "—"}
                  </td>
                  <td className="px-2.5 py-2">{m.createdByName}</td>
                  <td className="px-2.5 py-2 text-xs text-muted">{new Date(m.createdAt).toLocaleString("ar-EG")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Modal>
  );
}
