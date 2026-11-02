import { useState } from "react";
import { Modal } from "../ui/Modal";
import { FieldWrap, Input } from "../ui/Field";
import { Button } from "../ui/Button";
import { addDaysISO, formatArabicDate } from "../../lib/date";
import type { SalesOrder } from "../../types";

interface MoveOrderModalProps {
  open: boolean;
  onClose: () => void;
  order: SalesOrder;
  /** تُرجع false عند الفشل لإبقاء النافذة مفتوحة */
  onConfirm: (date: string) => Promise<boolean>;
}

// نقل أوردر إلى يوم محدد. لا يمس الحالة ولا المخزون (يتغير تاريخ الأوردر فقط).
export function MoveOrderModal({ open, onClose, order, onConfirm }: MoveOrderModalProps) {
  const [date, setDate] = useState(addDaysISO(order.date, 1));
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (!date) return setError("اختر التاريخ");
    if (date === order.date) return setError("الأوردر موجود في هذا اليوم بالفعل");
    setSaving(true);
    try {
      if (await onConfirm(date)) onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="نقل الأوردر إلى يوم" description={`اليوم الحالي: ${formatArabicDate(order.date, "d MMMM yyyy")}`} size="sm">
      <FieldWrap label="اليوم الجديد" error={error}>
        <Input
          type="date"
          autoFocus
          value={date}
          onChange={(e) => {
            setDate(e.target.value);
            setError("");
          }}
        />
      </FieldWrap>
      <p className="mb-3 text-xs text-muted">يتغير تاريخ الأوردر فقط؛ حالته ومخزونه كما هما.</p>
      <div className="mt-2 flex justify-end gap-2">
        <Button type="button" variant="secondary" onClick={onClose}>
          إلغاء
        </Button>
        <Button type="button" onClick={() => void submit()} disabled={saving}>
          {saving ? "جارٍ النقل..." : "نقل"}
        </Button>
      </div>
    </Modal>
  );
}
