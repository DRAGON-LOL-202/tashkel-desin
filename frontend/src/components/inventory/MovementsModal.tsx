import { useEffect, useState } from "react";
import { Modal } from "../ui/Modal";
import { ErrorState, LoadingState } from "../ui/StatusViews";
import { errorMessage } from "../../lib/api";
import { inventoryService } from "../../services/inventoryService";
import { fmtQty, MOVEMENT_LABEL } from "./format";
import type { InventoryItem, InventoryMovement } from "../../types";

interface MovementsModalProps {
  open: boolean;
  onClose: () => void;
  item: InventoryItem;
}

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
    <Modal open={open} onClose={onClose} title="سجل الحركات" description={item.name} size="lg">
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
        <p className="py-6 text-center text-sm text-muted">لا توجد حركات بعد</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-right text-xs text-muted">
                <th className="px-2 py-2 font-medium">النوع</th>
                <th className="px-2 py-2 font-medium">التغيير</th>
                <th className="px-2 py-2 font-medium">الرصيد بعدها</th>
                <th className="px-2 py-2 font-medium">بواسطة</th>
                <th className="px-2 py-2 font-medium">التاريخ</th>
                <th className="px-2 py-2 font-medium">ملاحظة</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((m) => (
                <tr key={m.id} className="border-b border-border/60 align-top">
                  <td className="px-2 py-2">{MOVEMENT_LABEL[m.type]}</td>
                  <td className="px-2 py-2 font-semibold" dir="ltr" style={{ color: m.delta < 0 ? "#C0392B" : m.delta > 0 ? "#1E8E5A" : undefined }}>
                    {m.delta > 0 ? "+" : ""}
                    {fmtQty(m.delta)}
                  </td>
                  <td className="px-2 py-2">{fmtQty(m.balanceAfter)}</td>
                  <td className="px-2 py-2">{m.createdByName}</td>
                  <td className="px-2 py-2 text-xs text-muted">{new Date(m.createdAt).toLocaleString("ar-EG")}</td>
                  <td className="px-2 py-2 text-muted">{m.note || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Modal>
  );
}
