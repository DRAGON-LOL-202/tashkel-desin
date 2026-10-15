import { useRef, useState, type FormEvent } from "react";
import { ChevronDown, Check, Plus, Trash2, X } from "lucide-react";
import type { ImageAttachment, Product, ProductCategory, ProductInput } from "../../types";
import { discardUpload } from "../../services/filesService";
import { Button } from "../ui/Button";
import { FieldWrap, Input } from "../ui/Field";
import { Modal } from "../ui/Modal";
import { ProductImageField } from "./ProductImageField";

interface ProductModalProps {
  open: boolean;
  onClose: () => void;
  editing: Product | null;
  categories: ProductCategory[];
  /** ينشئ التصنيف ويعيده (أو الموجود مسبقاً بنفس الاسم). null عند الفشل. */
  onCreateCategory: (name: string) => Promise<ProductCategory | null>;
  /** true عند النجاح فيُغلق النموذج */
  onSubmit: (input: ProductInput) => Promise<boolean>;
}

interface VariantRow {
  key: number;
  label: string;
  cost: string;
  price: string;
}

const MAX_VARIANTS = 20; // نفس حد الـ backend
const MAX_PRICE = 10_000_000;

let rowKey = 0;
const emptyRow = (): VariantRow => ({ key: ++rowKey, label: "", cost: "", price: "" });

const parsePrice = (raw: string): number | null => {
  const n = Number(raw.trim().replace(",", "."));
  return raw.trim() !== "" && Number.isFinite(n) && n >= 0 && n <= MAX_PRICE ? n : null;
};

export function ProductModal({ open, onClose, editing, categories, onCreateCategory, onSubmit }: ProductModalProps) {
  const [name, setName] = useState(editing?.name ?? "");
  const [categoryId, setCategoryId] = useState(editing?.categoryId ?? "");
  const [rows, setRows] = useState<VariantRow[]>(() =>
    editing && editing.variants.length > 0
      ? editing.variants.map((v) => ({ key: ++rowKey, label: v.label, cost: String(v.cost), price: String(v.price) }))
      : [emptyRow()]
  );
  const [image, setImage] = useState<ImageAttachment | null>(editing?.attachments[0] ?? null);
  const [addingCategory, setAddingCategory] = useState(categories.length === 0);
  const [newCategory, setNewCategory] = useState("");
  const [creatingCategory, setCreatingCategory] = useState(false);
  const [errors, setErrors] = useState<{ name?: string; category?: string; variants?: string }>({});
  const [saving, setSaving] = useState(false);
  const sessionKeys = useRef(new Set<string>());

  const close = () => {
    // صورة رُفعت في هذه الجلسة ولم تُحفظ: تُحذف من R2
    sessionKeys.current.forEach((key) => void discardUpload(key));
    sessionKeys.current.clear();
    onClose();
  };

  const updateRow = (key: number, patch: Partial<VariantRow>) =>
    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, ...patch } : r)));

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
    setErrors((e) => ({ ...e, category: undefined }));
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (saving) return;
    const next: typeof errors = {};
    if (!name.trim()) next.name = "اسم المنتج مطلوب";
    if (!categoryId) next.category = "اختر تصنيفاً أو أضف تصنيفاً جديداً";
    const variants: ProductInput["variants"] = [];
    for (const row of rows) {
      const cost = parsePrice(row.cost);
      const price = parsePrice(row.price);
      if (cost === null || price === null) {
        next.variants = "أدخل سعر التكلفة وسعر البيع لكل خامة (أرقام صحيحة غير سالبة).";
        break;
      }
      variants.push({ label: row.label.trim(), cost, price });
    }
    setErrors(next);
    if (Object.keys(next).length > 0) return;

    setSaving(true);
    const ok = await onSubmit({ name: name.trim(), categoryId, variants, attachments: image ? [image] : [] });
    setSaving(false);
    if (ok) {
      sessionKeys.current.clear(); // الصورة صارت محفوظة
      onClose();
    }
  };

  return (
    <Modal open={open} onClose={close} title={editing ? "تعديل المنتج" : "إضافة منتج"} description="الصورة والتصنيف والأسعار (يمكن إضافة أكثر من خامة)" size="lg">
      <form onSubmit={(e) => void handleSubmit(e)} noValidate>
        <FieldWrap label="صورة المنتج">
          <ProductImageField value={image} onChange={setImage} sessionKeys={sessionKeys} />
        </FieldWrap>

        <FieldWrap label="اسم المنتج" htmlFor="product-name" error={errors.name}>
          <Input id="product-name" value={name} maxLength={200} onChange={(e) => setName(e.target.value)} placeholder="مثال: ميدالية خشب" autoFocus />
        </FieldWrap>

        <FieldWrap label="التصنيف" htmlFor="product-category" error={errors.category}>
          <div className="flex items-stretch gap-2">
            <div className="relative flex-1">
              <select
                id="product-category"
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

        <FieldWrap label="الخامات والأسعار">
          <div className="flex flex-col gap-3">
            {rows.map((row, index) => (
              <div key={row.key} className="pp-box p-3">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <input
                    value={row.label}
                    maxLength={100}
                    onChange={(e) => updateRow(row.key, { label: e.target.value })}
                    placeholder={`اسم الخامة (اختياري) — مثال: خشب`}
                    aria-label={`اسم الخامة ${index + 1}`}
                    className="pp-input"
                  />
                  {rows.length > 1 && (
                    <button
                      type="button"
                      onClick={() => setRows((prev) => prev.filter((r) => r.key !== row.key))}
                      aria-label={`حذف الخامة ${index + 1}`}
                      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-control text-muted pp-hover-danger"
                    >
                      <Trash2 size={16} />
                    </button>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <label className="block">
                    <span className="mb-1 block text-xs text-muted">سعر التكلفة</span>
                    <input
                      value={row.cost}
                      inputMode="decimal"
                      onChange={(e) => updateRow(row.key, { cost: e.target.value })}
                      placeholder="0.00"
                      className="pp-input pp-price text-right"
                    />
                  </label>
                  <label className="block">
                    <span className="mb-1 block text-xs text-muted">سعر البيع</span>
                    <input
                      value={row.price}
                      inputMode="decimal"
                      onChange={(e) => updateRow(row.key, { price: e.target.value })}
                      placeholder="0.00"
                      className="pp-input pp-price text-right"
                    />
                  </label>
                </div>
              </div>
            ))}
          </div>
          {errors.variants && <p className="mt-1 text-xs text-problem">{errors.variants}</p>}
          <button
            type="button"
            disabled={rows.length >= MAX_VARIANTS}
            onClick={() => setRows((prev) => [...prev, emptyRow()])}
            className="task-btn task-btn--ghost mt-2 !h-9 disabled:opacity-50"
          >
            <Plus size={16} /> إضافة خامة أخرى
          </button>
        </FieldWrap>

        <div className="mt-2 flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={close}>
            إلغاء
          </Button>
          <Button type="submit" disabled={saving}>
            {saving ? "جارٍ الحفظ…" : editing ? "حفظ التعديلات" : "إضافة المنتج"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
