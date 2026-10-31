import { useRef, useState, type FormEvent } from "react";
import { Check, ChevronDown, Plus, X } from "lucide-react";
import { Modal } from "../ui/Modal";
import { Button } from "../ui/Button";
import { FieldWrap, Input, Textarea } from "../ui/Field";
import { ImageAttachmentsField } from "../ui/ImageAttachments";
import { discardUpload } from "../../services/filesService";
import type { ImageAttachment, InventoryCategory, InventoryItem, InventoryItemInput } from "../../types";

interface ItemModalProps {
  open: boolean;
  onClose: () => void;
  editing: InventoryItem | null;
  categories: InventoryCategory[];
  /** يعيد التصنيف الجديد (أو الموجود مسبقاً) أو null عند الفشل */
  onCreateCategory: (name: string) => Promise<InventoryCategory | null>;
  /** يعيد true عند النجاح لإغلاق النافذة */
  onSubmit: (input: InventoryItemInput) => Promise<boolean>;
}

const toNum = (s: string) => (s.trim() === "" ? NaN : Number(s));

export function ItemModal({ open, onClose, editing, categories, onCreateCategory, onSubmit }: ItemModalProps) {
  const [name, setName] = useState(editing?.name ?? "");
  const [categoryId, setCategoryId] = useState(editing?.categoryId ?? "");
  const [images, setImages] = useState<ImageAttachment[]>(editing?.attachments ?? []);
  const [sku, setSku] = useState(editing?.sku ?? "");
  const [unit, setUnit] = useState(editing?.unit ?? "قطعة");
  const [min, setMin] = useState(String(editing?.minQuantity ?? 0));
  const [initial, setInitial] = useState("0");
  const [notes, setNotes] = useState(editing?.notes ?? "");
  const [isActive, setIsActive] = useState(editing?.isActive ?? true);
  const [addingCategory, setAddingCategory] = useState(categories.length === 0);
  const [newCategory, setNewCategory] = useState("");
  const [creatingCategory, setCreatingCategory] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const sessionKeys = useRef(new Set<string>());

  const close = () => {
    // صور رُفعت في هذه الجلسة ولم تُحفظ: تُحذف من R2
    sessionKeys.current.forEach((key) => void discardUpload(key));
    sessionKeys.current.clear();
    onClose();
  };

  const handleAddCategory = async () => {
    const value = newCategory.trim();
    if (!value || creatingCategory) return;
    setCreatingCategory(true);
    const created = await onCreateCategory(value);
    setCreatingCategory(false);
    if (!created) return;
    setCategoryId(created.id);
    setNewCategory("");
    setAddingCategory(false);
    setErrors((e) => ({ ...e, category: "" }));
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (saving) return;
    const next: Record<string, string> = {};
    if (!name.trim()) next.name = "الاسم مطلوب";
    if (!categoryId) next.category = "اختر تصنيفاً أو أضف تصنيفاً جديداً";
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
      categoryId,
      attachments: images,
      sku: sku.trim() === "" ? null : sku.trim(),
      unit: unit.trim(),
      minQuantity: minN,
      notes: notes.trim(),
      ...(editing ? { isActive } : { initialQuantity: initN }),
    });
    setSaving(false);
    if (ok) {
      sessionKeys.current.clear(); // الصور صارت محفوظة
      onClose();
    }
  };

  return (
    <Modal open={open} onClose={close} title={editing ? "تعديل عنصر المخزون" : "إضافة عنصر مخزون"} description="الصور والتصنيف والكمية (يمكن إضافة أكثر من صورة)">
      <form onSubmit={(e) => void submit(e)} noValidate>
        <FieldWrap label="صور العنصر">
          <ImageAttachmentsField value={images} onChange={setImages} scope="inventory" sessionKeys={sessionKeys} />
        </FieldWrap>

        <FieldWrap label="الاسم" htmlFor="inv-name" error={errors.name}>
          <Input id="inv-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={150} placeholder="مثال: خشب MDF 3مم" autoFocus />
        </FieldWrap>

        <FieldWrap label="التصنيف" htmlFor="inv-category" error={errors.category}>
          <div className="flex items-stretch gap-2">
            <div className="relative flex-1">
              <select
                id="inv-category"
                value={categoryId}
                onChange={(e) => setCategoryId(e.target.value)}
                className="pp-input pp-input--select cursor-pointer appearance-none"
              >
                <option value="">اختر التصنيف…</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
              <ChevronDown size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
            </div>
            <button
              type="button"
              onClick={() => setAddingCategory((v) => !v)}
              aria-label="إضافة تصنيف جديد"
              aria-expanded={addingCategory}
              title="إضافة تصنيف جديد"
              className="task-icon-btn !h-auto !w-11 shrink-0"
            >
              {addingCategory ? <X size={16} /> : <Plus size={16} />}
            </button>
          </div>
          {addingCategory && (
            <div className="mt-2 flex items-stretch gap-2">
              <input
                value={newCategory}
                maxLength={60}
                onChange={(e) => setNewCategory(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault(); // لا يرسل النموذج الرئيسي
                    void handleAddCategory();
                  }
                }}
                placeholder="اسم التصنيف الجديد"
                aria-label="اسم التصنيف الجديد"
                className="pp-input flex-1"
              />
              <Button type="button" variant="secondary" icon={<Check size={16} />} disabled={!newCategory.trim() || creatingCategory} onClick={() => void handleAddCategory()}>
                إضافة
              </Button>
            </div>
          )}
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
          <Button type="button" variant="secondary" onClick={close}>
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
