import { useState, type FormEvent } from "react";
import { Modal } from "../ui/Modal";
import { Button } from "../ui/Button";
import { FieldWrap, Input, Textarea } from "../ui/Field";
import type { InventoryItem, InventoryItemInput } from "../../types";

interface ItemModalProps {
  open: boolean;
  onClose: () => void;
  editing: InventoryItem | null;
  /** يعيد true عند النجاح لإغلاق النافذة */
  onSubmit: (input: InventoryItemInput) => Promise<boolean>;
}

const toNum = (s: string) => (s.trim() === "" ? NaN : Number(s));

export function ItemModal({ open, onClose, editing, onSubmit }: ItemModalProps) {
  const [name, setName] = useState(editing?.name ?? "");
  const [sku, setSku] = useState(editing?.sku ?? "");
  const [unit, setUnit] = useState(editing?.unit ?? "قطعة");
  const [min, setMin] = useState(String(editing?.minQuantity ?? 0));
  const [initial, setInitial] = useState("0");
  const [notes, setNotes] = useState(editing?.notes ?? "");
  const [isActive, setIsActive] = useState(editing?.isActive ?? true);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const next: Record<string, string> = {};
    if (!name.trim()) next.name = "الاسم مطلوب";
    if (!unit.trim()) next.unit = "الوحدة مطلوبة";
    const minN = toNum(min);
    if (!Number.isFinite(minN) || minN < 0) next.min = "أدخل رقماً صحيحاً (0 أو أكثر)";
    const initN = toNum(initial);
    if (!editing && (!Number.isFinite(initN) || initN < 0)) next.initial = "أدخل رقماً صحيحاً (0 أو أكثر)";
    setErrors(next);
    if (Object.keys(next).length > 0) return;

    setSaving(true);
    const ok = await onSubmit({
      name: name.trim(),
      sku: sku.trim() === "" ? null : sku.trim(),
      unit: unit.trim(),
      minQuantity: minN,
      notes: notes.trim(),
      ...(editing ? { isActive } : { initialQuantity: initN }),
    });
    setSaving(false);
    if (ok) onClose();
  };

  return (
    <Modal open={open} onClose={onClose} title={editing ? "تعديل عنصر المخزون" : "إضافة عنصر مخزون"}>
      <form onSubmit={(e) => void submit(e)} noValidate>
        <FieldWrap label="الاسم" htmlFor="inv-name" error={errors.name}>
          <Input id="inv-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={150} autoFocus />
        </FieldWrap>
        <div className="grid grid-cols-2 gap-3">
          <FieldWrap label="الكود (اختياري)" htmlFor="inv-sku">
            <Input id="inv-sku" value={sku} onChange={(e) => setSku(e.target.value)} maxLength={64} dir="ltr" />
          </FieldWrap>
          <FieldWrap label="الوحدة" htmlFor="inv-unit" error={errors.unit}>
            <Input id="inv-unit" value={unit} onChange={(e) => setUnit(e.target.value)} maxLength={30} />
          </FieldWrap>
          <FieldWrap label="الحد الأدنى للتنبيه" htmlFor="inv-min" error={errors.min}>
            <Input id="inv-min" type="number" inputMode="decimal" min={0} step="any" value={min} onChange={(e) => setMin(e.target.value)} />
          </FieldWrap>
          {!editing && (
            <FieldWrap label="الكمية الافتتاحية" htmlFor="inv-initial" error={errors.initial}>
              <Input id="inv-initial" type="number" inputMode="decimal" min={0} step="any" value={initial} onChange={(e) => setInitial(e.target.value)} />
            </FieldWrap>
          )}
        </div>
        <FieldWrap label="ملاحظات" htmlFor="inv-notes">
          <Textarea id="inv-notes" value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={1000} />
        </FieldWrap>
        {editing && (
          <label className="mb-4 flex items-center gap-2 text-sm text-text">
            <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
            العنصر مفعّل
          </label>
        )}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            إلغاء
          </Button>
          <Button type="submit" disabled={saving}>
            {saving ? "جارٍ الحفظ..." : editing ? "حفظ" : "إضافة"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
