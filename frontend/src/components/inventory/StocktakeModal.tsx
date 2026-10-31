import { useState, type FormEvent } from "react";
import { ClipboardCheck, Package } from "lucide-react";
import { Modal } from "../ui/Modal";
import { Button } from "../ui/Button";
import { FieldWrap, Input } from "../ui/Field";
import { AttachmentImage } from "../ui/ImageAttachments";
import { useAuth } from "../auth/AuthProvider";
import { calcTotalValue, fmtMoney, fmtQty } from "./format";
import type { InventoryItem, InventoryMovementInput } from "../../types";

interface StocktakeModalProps {
  open: boolean;
  onClose: () => void;
  items: InventoryItem[];
  initialItem?: InventoryItem | null;
  onSubmit: (itemId: string, input: InventoryMovementInput) => Promise<boolean>;
}

export function StocktakeModal({ open, onClose, items, initialItem = null, onSubmit }: StocktakeModalProps) {
  const activeItems = items.filter((i) => i.isActive);
  const [selectedId, setSelectedId] = useState(initialItem?.id ?? activeItems[0]?.id ?? "");
  const selectedItem = activeItems.find((i) => i.id === selectedId) ?? initialItem ?? null;

  const [actualQty, setActualQty] = useState(selectedItem ? String(selectedItem.quantity) : "");
  const [reason, setReason] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const { user } = useAuth();

  const handleSelectItem = (id: string) => {
    setSelectedId(id);
    const found = activeItems.find((i) => i.id === id);
    if (found) setActualQty(String(found.quantity));
    setError("");
  };

  const recorded = selectedItem?.quantity ?? 0;
  const actualNum = actualQty.trim() === "" ? NaN : Number(actualQty);
  const validActual = Number.isFinite(actualNum) && actualNum >= 0;
  const diff = validActual ? Math.round((actualNum - recorded) * 1000) / 1000 : null;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!selectedItem) {
      setError("اختر المنتج المراد جرده");
      return;
    }
    if (!validActual) {
      setError("أدخل الكمية الفعلية الموجودة بالمخزن (0 أو أكثر)");
      return;
    }
    if (diff !== 0 && !reason.trim()) {
      setError("يرجى إدخال سبب الفرق في الجرد");
      return;
    }
    setError("");
    setSaving(true);
    const ok = await onSubmit(selectedItem.id, {
      type: "ADJUST",
      quantity: Math.round(actualNum * 1000) / 1000,
      reason: reason.trim() || "مطابقة جرد دوري",
      note: note.trim(),
    });
    setSaving(false);
    if (ok) onClose();
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="جرد المخزون وتسوية الأرصدة"
      description="مطابقة الكمية الفعلية في المخزن مع الكمية المسجلة في النظام وتسجيل حركة تسوية جرد"
      size="lg"
    >
      <form onSubmit={(e) => void submit(e)} noValidate className="flex flex-col gap-3">
        <FieldWrap label="اختيار المنتج" htmlFor="st-item">
          <select
            id="st-item"
            value={selectedItem?.id ?? ""}
            onChange={(e) => handleSelectItem(e.target.value)}
            className="pp-input pp-input--select"
          >
            {activeItems.map((i) => (
              <option key={i.id} value={i.id}>
                {i.name} {i.sku ? `(${i.sku})` : ""} — المسجل: {fmtQty(i.quantity)} {i.unit}
              </option>
            ))}
          </select>
        </FieldWrap>

        {selectedItem && (
          <div className="flex items-center gap-3 rounded-control border border-border bg-background/50 p-3">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-control border border-border bg-surface">
              {selectedItem.attachments[0] ? (
                <AttachmentImage attachment={selectedItem.attachments[0]} className="h-full w-full object-cover" />
              ) : (
                <Package size={24} className="text-muted opacity-50" />
              )}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate font-bold text-text">{selectedItem.name}</p>
              <p className="text-xs text-muted">
                {selectedItem.categoryName} {selectedItem.sku ? `· الكود: ${selectedItem.sku}` : ""} · سعر الوحدة:{" "}
                {fmtMoney(selectedItem.unitPrice)}
              </p>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="rounded-control border border-border bg-background/40 p-3 text-center">
            <span className="block text-xs text-muted">الكمية المسجلة في النظام</span>
            <span className="mt-1 block text-lg font-bold text-text">
              {fmtQty(recorded)} <span className="text-xs font-normal text-muted">{selectedItem?.unit}</span>
            </span>
          </div>

          <div className="rounded-control border border-primary/30 bg-primary/5 p-3">
            <label htmlFor="st-actual" className="mb-1 block text-center text-xs font-semibold text-text">
              الكمية الفعلية بالمخزن ({selectedItem?.unit})
            </label>
            <Input
              id="st-actual"
              type="number"
              inputMode="decimal"
              min={0}
              step="any"
              value={actualQty}
              onChange={(e) => setActualQty(e.target.value)}
              className="text-center font-bold"
              autoFocus
            />
          </div>

          <div className="rounded-control border border-border bg-background/40 p-3 text-center">
            <span className="block text-xs text-muted">الفرق بين الكميتين</span>
            <span
              className="mt-1 block text-lg font-bold"
              dir="ltr"
              style={{
                color: diff === null || diff === 0 ? undefined : diff > 0 ? "#1E8E5A" : "#C0392B",
              }}
            >
              {diff === null ? "—" : `${diff > 0 ? "+" : ""}${fmtQty(diff)}`}
            </span>
          </div>
        </div>

        {selectedItem && validActual && (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-control border border-border bg-background/50 px-3.5 py-2 text-xs text-muted">
            <span>
              المسؤول عن الجرد: <strong className="text-text">{user?.name ?? "—"}</strong>
            </span>
            <span>
              القيمة بعد الجرد:{" "}
              <strong className="text-primary-deep">
                {fmtMoney(calcTotalValue(actualNum, selectedItem.unitPrice))}
              </strong>
            </span>
          </div>
        )}

        <FieldWrap label="سبب الفرق" htmlFor="st-reason" error={error}>
          <Input
            id="st-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            maxLength={500}
            placeholder="مثال: تلف / كسر / خطأ عد سابق / مطابقة جرد..."
          />
        </FieldWrap>

        <FieldWrap label="ملاحظات إضافية (اختياري)" htmlFor="st-note">
          <Input
            id="st-note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            maxLength={1000}
            placeholder="أي ملاحظات إضافية حول عملية الجرد"
          />
        </FieldWrap>

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            إلغاء
          </Button>
          <Button type="submit" disabled={saving || !selectedItem} icon={<ClipboardCheck size={16} />}>
            {saving ? "جارٍ التأكيد..." : "تأكيد الجرد"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
