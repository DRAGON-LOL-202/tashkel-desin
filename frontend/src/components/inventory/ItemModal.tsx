import { useMemo, useRef, useState, type FormEvent } from "react";
import { Check, ChevronDown, Lock, Plus, Sparkles, Unlock, X } from "lucide-react";
import { Modal } from "../ui/Modal";
import { Button } from "../ui/Button";
import { FieldWrap, Input, Textarea } from "../ui/Field";
import { ImageAttachmentsField } from "../ui/ImageAttachments";
import { discardUpload } from "../../services/filesService";
import { inventoryService } from "../../services/inventoryService";
import { DEFAULT_INVENTORY_UNITS, calcTotalValue, fmtMoney, fmtQty } from "./format";
import { CategoryOptions } from "./CategoryOptions";
import type { ImageAttachment, InventoryCategory, InventoryGroup, InventoryItem, InventoryItemInput } from "../../types";

interface ItemModalProps {
  open: boolean;
  onClose: () => void;
  editing: InventoryItem | null;
  categories: InventoryCategory[];
  /** المجموعتان الرئيسيتان؛ تُلزم عند إضافة تصنيف جديد */
  groups: InventoryGroup[];
  units?: string[];
  /** يعيد التصنيف الجديد (أو الموجود مسبقاً) أو null عند الفشل */
  onCreateCategory: (name: string, groupId: string, description?: string) => Promise<InventoryCategory | null>;
  /** يعيد true عند النجاح لإغلاق النافذة */
  onSubmit: (input: InventoryItemInput) => Promise<boolean>;
}

const toNum = (s: string) => (s.trim() === "" ? NaN : Number(s));

export function ItemModal({ open, onClose, editing, categories, groups, units = [], onCreateCategory, onSubmit }: ItemModalProps) {
  const [name, setName] = useState(editing?.name ?? "");
  const [categoryId, setCategoryId] = useState(editing?.categoryId ?? "");
  const [images, setImages] = useState<ImageAttachment[]>(editing?.attachments ?? []);
  const [sku, setSku] = useState(editing?.sku ?? "");
  const [skuEditable, setSkuEditable] = useState(!editing);
  const [generatingSku, setGeneratingSku] = useState(false);

  const [unit, setUnit] = useState(editing?.unit ?? "قطعة");
  const [customUnits, setCustomUnits] = useState<string[]>([]);
  const [addingUnit, setAddingUnit] = useState(false);
  const [newUnit, setNewUnit] = useState("");

  const [min, setMin] = useState(String(editing?.minQuantity ?? 0));
  const [initial, setInitial] = useState("0");
  const [unitPrice, setUnitPrice] = useState(String(editing?.unitPrice ?? 0));
  const [notes, setNotes] = useState(editing?.notes ?? "");
  const [isActive, setIsActive] = useState(editing?.isActive ?? true);

  const [addingCategory, setAddingCategory] = useState(categories.length === 0);
  const [newCategory, setNewCategory] = useState("");
  const [newCategoryDesc, setNewCategoryDesc] = useState("");
  const [newCategoryGroup, setNewCategoryGroup] = useState("");
  const [creatingCategory, setCreatingCategory] = useState(false);

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const sessionKeys = useRef(new Set<string>());

  const availableUnits = useMemo(() => {
    const set = new Set<string>([...DEFAULT_INVENTORY_UNITS, ...units, ...customUnits]);
    if (unit.trim()) set.add(unit.trim());
    return [...set];
  }, [units, customUnits, unit]);

  const effectiveQty = editing ? editing.quantity : Number.isFinite(toNum(initial)) && toNum(initial) >= 0 ? toNum(initial) : 0;
  const effectivePrice = Number.isFinite(toNum(unitPrice)) && toNum(unitPrice) >= 0 ? toNum(unitPrice) : 0;
  const previewTotalValue = calcTotalValue(effectiveQty, effectivePrice);

  const close = () => {
    sessionKeys.current.forEach((key) => void discardUpload(key));
    sessionKeys.current.clear();
    onClose();
  };

  const handleGenerateSku = async () => {
    if (generatingSku) return;
    setGeneratingSku(true);
    try {
      const next = await inventoryService.nextSku();
      setSku(next);
      setSkuEditable(true);
      setErrors((e) => ({ ...e, sku: "" }));
    } catch {
      const fallback = `INV-${String(Math.floor(1000 + Math.random() * 9000))}`;
      setSku(fallback);
      setSkuEditable(true);
    } finally {
      setGeneratingSku(false);
    }
  };

  const handleAddCategory = async () => {
    const value = newCategory.trim();
    if (!value || !newCategoryGroup || creatingCategory) return;
    setCreatingCategory(true);
    const created = await onCreateCategory(value, newCategoryGroup, newCategoryDesc.trim());
    setCreatingCategory(false);
    if (!created) return;
    setCategoryId(created.id);
    setNewCategory("");
    setNewCategoryDesc("");
    setNewCategoryGroup("");
    setAddingCategory(false);
    setErrors((e) => ({ ...e, category: "" }));
  };

  const handleAddUnit = () => {
    const u = newUnit.trim();
    if (!u) return;
    setCustomUnits((prev) => (prev.includes(u) ? prev : [...prev, u]));
    setUnit(u);
    setNewUnit("");
    setAddingUnit(false);
    setErrors((e) => ({ ...e, unit: "" }));
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (saving) return;
    const next: Record<string, string> = {};
    if (!name.trim()) next.name = "اسم المنتج مطلوب";
    if (!categoryId) next.category = "اختر تصنيفاً أو أضف تصنيفاً جديداً";
    if (!unit.trim()) next.unit = "وحدة القياس مطلوبة";
    const minN = toNum(min);
    if (!Number.isFinite(minN) || minN < 0) next.min = "أدخل رقماً صحيحاً (0 أو أكثر)";
    const priceN = toNum(unitPrice);
    if (!Number.isFinite(priceN) || priceN < 0) next.unitPrice = "أدخل سعراً صحيحاً (0 أو أكثر)";
    const initN = toNum(initial);
    if (!editing && (!Number.isFinite(initN) || initN < 0)) next.initial = "أدخل رقماً صحيحاً (0 أو أكثر)";
    setErrors(next);
    if (Object.keys(next).length > 0) return;

    setSaving(true);
    const payload: InventoryItemInput = {
      name: name.trim(),
      categoryId,
      attachments: images,
      unit: unit.trim(),
      minQuantity: minN,
      unitPrice: priceN,
      notes: notes.trim(),
      ...(editing
        ? {
            isActive,
            ...(skuEditable ? { sku: sku.trim() === "" ? null : sku.trim() } : {}),
          }
        : {
            sku: sku.trim() === "" ? null : sku.trim(),
            initialQuantity: initN,
          }),
    };

    const ok = await onSubmit(payload);
    setSaving(false);
    if (ok) {
      sessionKeys.current.clear();
      onClose();
    }
  };

  return (
    <Modal
      open={open}
      onClose={close}
      title={editing ? "تعديل منتج المخزون" : "إضافة منتج إلى المخزون"}
      description="بيانات المنتج المستقلة في المخزون (الصورة، الكود، التصنيف، السعر، والكمية)"
      size="lg"
    >
      <form onSubmit={(e) => void submit(e)} noValidate>
        <FieldWrap label="1. صورة المنتج (معاينة قبل الحفظ وإمكانية التغيير أو الحذف)">
          <ImageAttachmentsField value={images} onChange={setImages} scope="inventory" sessionKeys={sessionKeys} />
        </FieldWrap>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <FieldWrap label="2. اسم المنتج" htmlFor="inv-name" error={errors.name}>
            <Input
              id="inv-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={150}
              placeholder="مثال: خشب MDF 3مم"
              autoFocus
            />
          </FieldWrap>

          <FieldWrap label="3. كود المنتج" htmlFor="inv-sku" error={errors.sku}>
            <div className="flex items-stretch gap-1.5">
              <Input
                id="inv-sku"
                value={sku}
                onChange={(e) => setSku(e.target.value)}
                maxLength={64}
                dir="ltr"
                readOnly={!skuEditable}
                placeholder="مثال: INV-0001"
                className={!skuEditable ? "opacity-75 cursor-not-allowed" : ""}
              />
              {editing && (
                <button
                  type="button"
                  onClick={() => setSkuEditable((v) => !v)}
                  title={skuEditable ? "قفل تعديل الكود" : "فتح تعديل الكود بطلب المستخدم"}
                  aria-label="تبديل قفل الكود"
                  className="task-icon-btn !h-auto !w-10 shrink-0"
                >
                  {skuEditable ? <Unlock size={15} /> : <Lock size={15} />}
                </button>
              )}
              {skuEditable && (
                <button
                  type="button"
                  onClick={() => void handleGenerateSku()}
                  disabled={generatingSku}
                  title="توليد كود تلقائي فريد"
                  aria-label="توليد كود تلقائي"
                  className="task-icon-btn !h-auto !w-10 shrink-0 text-primary-deep"
                >
                  <Sparkles size={15} />
                </button>
              )}
            </div>
          </FieldWrap>
        </div>

        <FieldWrap label="4. التصنيف" htmlFor="inv-category" error={errors.category}>
          <div className="flex items-stretch gap-2">
            <div className="relative flex-1">
              <select
                id="inv-category"
                value={categoryId}
                onChange={(e) => setCategoryId(e.target.value)}
                className="pp-input pp-input--select cursor-pointer appearance-none"
              >
                <option value="">اختر التصنيف…</option>
                <CategoryOptions categories={categories} />
              </select>
              <ChevronDown size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
            </div>
            <button
              type="button"
              onClick={() => setAddingCategory((v) => !v)}
              aria-label="إضافة تصنيف جديد"
              aria-expanded={addingCategory}
              title="إضافة تصنيف جديد دون مغادرة النموذج"
              className="task-icon-btn !h-auto !w-11 shrink-0"
            >
              {addingCategory ? <X size={16} /> : <Plus size={16} />}
            </button>
          </div>
          {addingCategory && (
            <div className="mt-2 rounded-control border border-border bg-background/60 p-3">
              <p className="mb-2 text-xs font-semibold text-text">إضافة تصنيف مخزون جديد</p>
              <select
                value={newCategoryGroup}
                onChange={(e) => setNewCategoryGroup(e.target.value)}
                aria-label="المجموعة الرئيسية للتصنيف الجديد"
                data-testid="item-new-category-group"
                className="pp-input pp-input--select mb-2 cursor-pointer"
              >
                <option value="">المجموعة الرئيسية (إلزامي)…</option>
                {groups.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name}
                  </option>
                ))}
              </select>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <input
                  value={newCategory}
                  maxLength={60}
                  onChange={(e) => setNewCategory(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      void handleAddCategory();
                    }
                  }}
                  placeholder="اسم التصنيف الجديد"
                  aria-label="اسم التصنيف الجديد"
                  className="pp-input"
                />
                <input
                  value={newCategoryDesc}
                  maxLength={500}
                  onChange={(e) => setNewCategoryDesc(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      void handleAddCategory();
                    }
                  }}
                  placeholder="وصف التصنيف (اختياري)"
                  aria-label="وصف التصنيف الجديد"
                  className="pp-input"
                />
              </div>
              <div className="mt-2 flex justify-end">
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  icon={<Check size={15} />}
                  disabled={!newCategory.trim() || !newCategoryGroup || creatingCategory}
                  onClick={() => void handleAddCategory()}
                >
                  {creatingCategory ? "جارٍ الحفظ..." : "إضافة واختيار"}
                </Button>
              </div>
            </div>
          )}
        </FieldWrap>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <FieldWrap label="5. وحدة القياس" htmlFor="inv-unit" error={errors.unit}>
            <div className="flex items-stretch gap-2">
              <div className="relative flex-1">
                <select
                  id="inv-unit"
                  value={unit}
                  onChange={(e) => setUnit(e.target.value)}
                  className="pp-input pp-input--select cursor-pointer appearance-none"
                >
                  {availableUnits.map((u) => (
                    <option key={u} value={u}>
                      {u}
                    </option>
                  ))}
                </select>
                <ChevronDown size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
              </div>
              <button
                type="button"
                onClick={() => setAddingUnit((v) => !v)}
                title="إضافة وحدة قياس مخصصة"
                aria-label="إضافة وحدة قياس مخصصة"
                className="task-icon-btn !h-auto !w-11 shrink-0"
              >
                {addingUnit ? <X size={16} /> : <Plus size={16} />}
              </button>
            </div>
            {addingUnit && (
              <div className="mt-2 flex items-stretch gap-2">
                <input
                  value={newUnit}
                  maxLength={30}
                  onChange={(e) => setNewUnit(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      handleAddUnit();
                    }
                  }}
                  placeholder="اسم الوحدة الجديدة (مثال: بكرة)"
                  className="pp-input flex-1"
                />
                <Button type="button" size="sm" variant="secondary" disabled={!newUnit.trim()} onClick={handleAddUnit}>
                  إضافة
                </Button>
              </div>
            )}
          </FieldWrap>

          {!editing ? (
            <FieldWrap label="6. الكمية الافتتاحية" htmlFor="inv-initial" error={errors.initial}>
              <Input
                id="inv-initial"
                type="number"
                inputMode="decimal"
                min={0}
                step="any"
                value={initial}
                onChange={(e) => setInitial(e.target.value)}
              />
            </FieldWrap>
          ) : (
            <FieldWrap label="6. الكمية الحالية (تتغير بالحركات فقط)">
              <div className="flex h-[42px] items-center rounded-control border border-border bg-background/50 px-3.5 text-sm font-semibold text-text">
                {fmtQty(editing.quantity)} {unit}
              </div>
            </FieldWrap>
          )}

          <FieldWrap label="7. سعر الوحدة (بالجنيه المصري)" htmlFor="inv-price" error={errors.unitPrice}>
            <Input
              id="inv-price"
              type="number"
              inputMode="decimal"
              min={0}
              step="any"
              value={unitPrice}
              onChange={(e) => setUnitPrice(e.target.value)}
              placeholder="0.00"
            />
          </FieldWrap>

          <FieldWrap label="8. الحد الأدنى للمخزون" htmlFor="inv-min" error={errors.min}>
            <Input
              id="inv-min"
              type="number"
              inputMode="decimal"
              min={0}
              step="any"
              value={min}
              onChange={(e) => setMin(e.target.value)}
            />
          </FieldWrap>
        </div>

        {/* معاينة الحساب التلقائي للقيمة */}
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-control border border-primary/25 bg-primary/10 px-4 py-2.5 text-sm">
          <span className="text-muted">
            إجمالي قيمة المنتج ({fmtQty(effectiveQty)} {unit} × {fmtMoney(effectivePrice)}):
          </span>
          <span className="text-base font-bold text-primary-deep">{fmtMoney(previewTotalValue)}</span>
        </div>

        <FieldWrap label="9. ملاحظات" htmlFor="inv-notes">
          <Textarea id="inv-notes" value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={1000} placeholder="أي تفاصيل أو مواصفات إضافية للمنتج..." />
        </FieldWrap>

        {editing && (
          <label className="mb-4 flex items-center gap-2 text-sm text-text">
            <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
            المنتج نشط (إلغاء التحديد يؤرشف المنتج ويخفيه من القوائم النشطة)
          </label>
        )}

        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={close}>
            إلغاء
          </Button>
          <Button type="submit" disabled={saving}>
            {saving ? "جارٍ الحفظ..." : editing ? "حفظ التعديلات" : "إضافة المنتج"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
