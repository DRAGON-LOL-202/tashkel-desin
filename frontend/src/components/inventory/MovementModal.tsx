import { useState, type FormEvent } from "react";
import { Modal } from "../ui/Modal";
import { Button } from "../ui/Button";
import { FieldWrap, Input, Select } from "../ui/Field";
import { fmtQty } from "./format";
import type { InventoryItem, InventoryMovementInput, InventoryMovementType } from "../../types";

interface MovementModalProps {
  open: boolean;
  onClose: () => void;
  item: InventoryItem;
  initialType?: InventoryMovementType;
  onSubmit: (input: InventoryMovementInput) => Promise<boolean>;
}

export function MovementModal({ open, onClose, item, initialType = "IN", onSubmit }: MovementModalProps) {
  const [type, setType] = useState<InventoryMovementType>(initialType);
  const [qty, setQty] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const n = qty.trim() === "" ? NaN : Number(qty);
  const preview = !Number.isFinite(n) ? null : type === "IN" ? item.quantity + n : type === "OUT" ? item.quantity - n : n;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!Number.isFinite(n) || n < 0 || (type !== "ADJUST" && n <= 0)) {
      setError(type === "ADJUST" ? "أدخل الرصيد الفعلي (0 أو أكثر)" : "أدخل كمية أكبر من صفر");
      return;
    }
    if (preview !== null && preview < 0) {
      setError(`الرصيد غير كافٍ (المتاح ${fmtQty(item.quantity)} ${item.unit})`);
      return;
    }
    setError("");
    setSaving(true);
    const ok = await onSubmit({ type, quantity: n, note: note.trim() });
    setSaving(false);
    if (ok) onClose();
  };

  return (
    <Modal open={open} onClose={onClose} title="حركة مخزون" description={`${item.name} — الرصيد الحالي ${fmtQty(item.quantity)} ${item.unit}`}>
      <form onSubmit={(e) => void submit(e)} noValidate>
        <FieldWrap label="نوع الحركة" htmlFor="mv-type">
          <Select id="mv-type" value={type} onChange={(e) => setType(e.target.value as InventoryMovementType)}>
            <option value="IN">إدخال</option>
            <option value="OUT">إخراج</option>
            <option value="ADJUST">جرد (ضبط الرصيد)</option>
          </Select>
        </FieldWrap>
        <FieldWrap label={type === "ADJUST" ? `الرصيد الفعلي (${item.unit})` : `الكمية (${item.unit})`} htmlFor="mv-qty" error={error}>
          <Input id="mv-qty" type="number" inputMode="decimal" min={0} step="any" value={qty} onChange={(e) => setQty(e.target.value)} autoFocus />
        </FieldWrap>
        {preview !== null && preview >= 0 && <p className="-mt-2 mb-4 text-xs text-muted">الرصيد بعد الحركة: {fmtQty(preview)} {item.unit}</p>}
        <FieldWrap label="ملاحظة (اختياري)" htmlFor="mv-note">
          <Input id="mv-note" value={note} onChange={(e) => setNote(e.target.value)} maxLength={1000} />
        </FieldWrap>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            إلغاء
          </Button>
          <Button type="submit" disabled={saving}>
            {saving ? "جارٍ الحفظ..." : "تسجيل الحركة"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
