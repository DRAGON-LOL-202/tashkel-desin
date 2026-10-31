import { useState, type FormEvent } from "react";
import { Package, RotateCcw } from "lucide-react";
import { Modal } from "../ui/Modal";
import { Button } from "../ui/Button";
import { FieldWrap, Input } from "../ui/Field";
import { AttachmentImage } from "../ui/ImageAttachments";
import { useAuth } from "../auth/AuthProvider";
import { calcTotalValue, fmtMoney, fmtQty } from "./format";
import type { InventoryItem, InventoryMovementInput } from "../../types";

interface ReturnModalProps {
  open: boolean;
  onClose: () => void;
  items: InventoryItem[];
  initialItem?: InventoryItem | null;
  onSubmit: (itemId: string, input: InventoryMovementInput) => Promise<boolean>;
}

export function ReturnModal({ open, onClose, items, initialItem = null, onSubmit }: ReturnModalProps) {
  const activeItems = items.filter((i) => i.isActive);
  const [selectedId, setSelectedId] = useState(initialItem?.id ?? activeItems[0]?.id ?? "");
  const selectedItem = activeItems.find((i) => i.id === selectedId) ?? initialItem ?? null;

  const [qty, setQty] = useState("");
  const [reason, setReason] = useState("");
  const [referenceId, setReferenceId] = useState("");
  const [note, setNote] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const { user } = useAuth();

  const qtyNum = qty.trim() === "" ? NaN : Number(qty);
  const validQty = Number.isFinite(qtyNum) && qtyNum > 0;
  const newBalance = selectedItem && validQty ? Math.round((selectedItem.quantity + qtyNum) * 1000) / 1000 : null;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const next: Record<string, string> = {};
    if (!selectedItem) next.item = "اختر المنتج المرتجع";
    if (!validQty) next.qty = "الكمية المرتجعة يجب أن تكون أكبر من صفر (لا يُسمح بكمية صفرية أو سالبة)";
    if (!reason.trim()) next.reason = "سبب الإرجاع مطلوب";
    setErrors(next);
    if (Object.keys(next).length > 0 || !selectedItem) return;

    setSaving(true);
    const ok = await onSubmit(selectedItem.id, {
      type: "RETURN",
      quantity: Math.round(qtyNum * 1000) / 1000,
      reason: reason.trim(),
      referenceId: referenceId.trim() || null,
      note: note.trim(),
    });
    setSaving(false);
    if (ok) onClose();
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="إضافة مرتجع إلى المخزون"
      description="إعادة كميات إلى المخزون وتسجيل حركة مرتجع مستقلة وتحديث القيمة تلقائياً"
      size="lg"
    >
      <form onSubmit={(e) => void submit(e)} noValidate className="flex flex-col gap-3">
        <FieldWrap label="المنتج" htmlFor="ret-item" error={errors.item}>
          <select
            id="ret-item"
            value={selectedItem?.id ?? ""}
            onChange={(e) => setSelectedId(e.target.value)}
            className="pp-input pp-input--select"
          >
            {activeItems.map((i) => (
              <option key={i.id} value={i.id}>
                {i.name} {i.sku ? `(${i.sku})` : ""} — الرصيد الحالي: {fmtQty(i.quantity)} {i.unit}
              </option>
            ))}
          </select>
        </FieldWrap>

        {selectedItem && (
          <div className="flex items-center gap-3 rounded-control border border-border bg-background/50 p-3">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-control border border-border bg-surface">
              {selectedItem.attachments[0] ? (
                <AttachmentImage attachment={selectedItem.attachments[0]} className="h-full w-full object-cover" />
              ) : (
                <Package size={22} className="text-muted opacity-50" />
              )}
            </div>
            <div className="min-w-0 flex-1 text-xs text-muted">
              <p className="truncate text-sm font-bold text-text">{selectedItem.name}</p>
              <p>
                الرصيد الحالي: <strong>{fmtQty(selectedItem.quantity)} {selectedItem.unit}</strong> · سعر الوحدة:{" "}
                {fmtMoney(selectedItem.unitPrice)}
              </p>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <FieldWrap label={`الكمية المرتجعة (${selectedItem?.unit ?? "وحدة"})`} htmlFor="ret-qty" error={errors.qty}>
            <Input
              id="ret-qty"
              type="number"
              inputMode="decimal"
              min={0.001}
              step="any"
              value={qty}
              onChange={(e) => setQty(e.target.value)}
              placeholder="أدخل كمية أكبر من 0"
              autoFocus
            />
          </FieldWrap>

          <FieldWrap label="رقم العملية الأصلية (إن وجد)" htmlFor="ret-ref">
            <Input
              id="ret-ref"
              value={referenceId}
              onChange={(e) => setReferenceId(e.target.value)}
              maxLength={100}
              dir="ltr"
              placeholder="مثال: OP-1234ABCD"
            />
          </FieldWrap>
        </div>

        <FieldWrap label="سبب الإرجاع" htmlFor="ret-reason" error={errors.reason}>
          <Input
            id="ret-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            maxLength={500}
            placeholder="مثال: فائض عن حاجة المشروع / استبدال خامة..."
          />
        </FieldWrap>

        <FieldWrap label="ملاحظات (اختياري)" htmlFor="ret-note">
          <Input id="ret-note" value={note} onChange={(e) => setNote(e.target.value)} maxLength={1000} />
        </FieldWrap>

        <div className="flex flex-wrap items-center justify-between gap-2 rounded-control border border-border bg-background/50 px-3.5 py-2.5 text-xs text-muted">
          <span>
            المستخدم: <strong className="text-text">{user?.name ?? "—"}</strong> · التاريخ:{" "}
            {new Date().toLocaleDateString("ar-EG")}
          </span>
          {selectedItem && newBalance !== null && (
            <span>
              الرصيد الجديد: <strong className="text-text">{fmtQty(newBalance)} {selectedItem.unit}</strong> (
              <strong className="text-primary-deep">{fmtMoney(calcTotalValue(newBalance, selectedItem.unitPrice))}</strong>)
            </span>
          )}
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            إلغاء
          </Button>
          <Button type="submit" disabled={saving || !selectedItem} icon={<RotateCcw size={16} />}>
            {saving ? "جارٍ الحفظ..." : "تأكيد المرتجع"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
