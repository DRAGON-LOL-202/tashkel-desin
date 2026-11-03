import { useState, type FormEvent } from "react";
import { Modal } from "../ui/Modal";
import { Button } from "../ui/Button";
import { FieldWrap, Input, Select } from "../ui/Field";
import { calcTotalValue, fmtMoney, fmtQty } from "./format";
import type { InventoryItem, InventoryMovementInput, InventoryMovementType } from "../../types";

interface MovementModalProps {
  open: boolean;
  onClose: () => void;
  item: InventoryItem;
  initialType?: InventoryMovementType;
  inOnly?: boolean;
  hidePrices?: boolean;
  onSubmit: (input: InventoryMovementInput) => Promise<boolean>;
}

export function MovementModal({ open, onClose, item, initialType = "IN", inOnly = false, hidePrices = false, onSubmit }: MovementModalProps) {
  const [type, setType] = useState<InventoryMovementType>(inOnly ? "IN" : initialType);
  const [qty, setQty] = useState("");
  const [reason, setReason] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const n = qty.trim() === "" ? NaN : Number(qty);
  const preview = !Number.isFinite(n)
    ? null
    : type === "IN" || type === "RETURN"
      ? Math.round((item.quantity + n) * 1000) / 1000
      : type === "OUT"
        ? Math.round((item.quantity - n) * 1000) / 1000
        : Math.round(n * 1000) / 1000;

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
    const ok = await onSubmit({ type, quantity: n, reason: reason.trim(), note: note.trim() });
    setSaving(false);
    if (ok) onClose();
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={type === "IN" ? "إضافة وارد للمخزون" : type === "OUT" ? "سحب من المخزون" : type === "RETURN" ? "إضافة مرتجع" : "جرد وضبط الرصيد"}
      description={`${item.name} — الرصيد الحالي ${fmtQty(item.quantity)} ${item.unit}${!hidePrices ? ` (${fmtMoney(item.totalValue ?? 0)})` : ""}`}
    >
      <form onSubmit={(e) => void submit(e)} noValidate>
        <FieldWrap label="نوع الحركة" htmlFor="mv-type">
          <Select id="mv-type" value={type} disabled={inOnly} onChange={(e) => !inOnly && setType(e.target.value as InventoryMovementType)}>
            <option value="IN">وارد (إضافة للمخزون)</option>
            {!inOnly && (
              <>
                <option value="OUT">سحب (خصم من المخزون)</option>
                <option value="RETURN">مرتجع (إعادة للمخزون)</option>
                <option value="ADJUST">جرد (تسوية الرصيد الفعلي)</option>
              </>
            )}
          </Select>
        </FieldWrap>
        <FieldWrap label={type === "ADJUST" ? `الرصيد الفعلي بالمخزن (${item.unit})` : `الكمية (${item.unit})`} htmlFor="mv-qty" error={error}>
          <Input id="mv-qty" type="number" inputMode="decimal" min={0} step="any" value={qty} onChange={(e) => setQty(e.target.value)} autoFocus />
        </FieldWrap>
        {preview !== null && preview >= 0 && (
          <div className="-mt-2 mb-4 flex flex-wrap items-center justify-between rounded-control border border-border bg-background/60 px-3 py-2 text-xs text-muted">
            <span>
              الرصيد بعد الحركة: <strong className="text-text">{fmtQty(preview)} {item.unit}</strong>
            </span>
            {!hidePrices && (
              <span>
                القيمة بعد الحركة: <strong className="text-primary-deep">{fmtMoney(calcTotalValue(preview, item.unitPrice ?? 0))}</strong>
              </span>
            )}
          </div>
        )}
        {(type === "ADJUST" || type === "RETURN") && (
          <FieldWrap label="السبب" htmlFor="mv-reason">
            <Input id="mv-reason" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} placeholder="سبب التسوية أو الإرجاع" />
          </FieldWrap>
        )}
        <FieldWrap label="ملاحظات (اختياري)" htmlFor="mv-note">
          <Input id="mv-note" value={note} onChange={(e) => setNote(e.target.value)} maxLength={1000} />
        </FieldWrap>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            إلغاء
          </Button>
          <Button type="submit" disabled={saving}>
            {saving ? "جارٍ الحفظ..." : "تأكيد الحركة"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
