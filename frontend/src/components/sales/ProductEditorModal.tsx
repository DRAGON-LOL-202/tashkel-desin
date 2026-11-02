import { useMemo, useState, type FormEvent } from "react";
import { Plus, Search, Trash2 } from "lucide-react";
import type { InventoryItem, SalesProduct, SalesProductInput } from "../../types";
import { calcTotalValue, fmtMoney, fmtQty } from "../inventory/format";
import { Modal } from "../ui/Modal";
import { Button } from "../ui/Button";
import { FieldWrap, Input, Textarea } from "../ui/Field";

interface ProductEditorModalProps {
  open: boolean;
  onClose: () => void;
  /** null = منتج ثابت جديد */
  editing: SalesProduct | null;
  /** أصناف المخزون (المفعّلة) لاختيار المحتويات منها */
  items: InventoryItem[];
  onSubmit: (input: SalesProductInput) => Promise<boolean>;
}

interface Row {
  itemId: string;
  quantity: string;
}

// تعريف منتج ثابت: الاسم + محتوياته من المخزون. التكلفة وسعر البيع تُحسبان تلقائياً من سعر الوحدة وسعر البيع في المخزون.
export function ProductEditorModal({ open, onClose, editing, items, onSubmit }: ProductEditorModalProps) {
  const [name, setName] = useState(editing?.name ?? "");
  const [notes, setNotes] = useState(editing?.notes ?? "");
  const [rows, setRows] = useState<Row[]>(() => editing?.components.map((c) => ({ itemId: c.itemId, quantity: String(c.quantity) })) ?? []);
  const [search, setSearch] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const byId = useMemo(() => new Map(items.map((i) => [i.id, i])), [items]);
  const used = new Set(rows.map((r) => r.itemId));
  const results = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items
      .filter((i) => !used.has(i.id))
      .filter((i) => !q || `${i.name} ${i.sku ?? ""}`.toLowerCase().includes(q))
      .slice(0, 8);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, search, rows]);

  const totals = useMemo(() => {
    let cost = 0;
    let sell = 0;
    for (const r of rows) {
      const it = byId.get(r.itemId);
      const q = Number(r.quantity);
      if (!it || !Number.isFinite(q) || q <= 0) continue;
      cost += Math.round(calcTotalValue(q, it.unitPrice) * 100);
      sell += Math.round(calcTotalValue(q, it.sellPrice ?? 0) * 100);
    }
    return { cost: cost / 100, sell: sell / 100 };
  }, [rows, byId]);

  const setQty = (itemId: string, quantity: string) => setRows((rs) => rs.map((r) => (r.itemId === itemId ? { ...r, quantity } : r)));

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (saving) return;
    const next: Record<string, string> = {};
    if (!name.trim()) next.name = "اسم المنتج مطلوب";
    if (rows.length === 0) next.rows = "أضف مكوناً واحداً على الأقل من المخزون";
    else if (rows.some((r) => !Number.isFinite(Number(r.quantity)) || Number(r.quantity) <= 0)) next.rows = "كل مكوّن يحتاج كمية أكبر من صفر";
    setErrors(next);
    if (Object.keys(next).length > 0) return;
    setSaving(true);
    const ok = await onSubmit({ name: name.trim(), notes: notes.trim(), components: rows.map((r) => ({ itemId: r.itemId, quantity: Number(r.quantity) })) });
    setSaving(false);
    if (ok) onClose();
  };

  return (
    <Modal open={open} onClose={onClose} title={editing ? "تعديل منتج ثابت" : "منتج ثابت جديد"} description="التعديل لا يغيّر الأوردرات التي أُضيفت سابقاً" size="lg">
      <form onSubmit={submit} noValidate>
        <FieldWrap label="اسم المنتج (مثل: بوكس كبير)" htmlFor="sp-name" error={errors.name}>
          <Input id="sp-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={120} autoFocus />
        </FieldWrap>

        <FieldWrap label="محتويات المنتج من المخزون" error={errors.rows}>
          {rows.length > 0 && (
            <ul className="mb-2 flex flex-col gap-1.5">
              {rows.map((r) => {
                const it = byId.get(r.itemId);
                return (
                  <li key={r.itemId} className="flex flex-wrap items-center gap-2 rounded-control border border-border/60 px-3 py-2">
                    <span className="min-w-0 flex-1 truncate text-sm font-semibold text-text">{it?.name ?? "صنف غير متاح"}</span>
                    <span className="text-[11px] text-muted">{it ? `${fmtMoney(it.unitPrice)} ← ${fmtMoney(it.sellPrice ?? 0)}` : ""}</span>
                    <input
                      type="number"
                      inputMode="decimal"
                      min={0}
                      step="any"
                      value={r.quantity}
                      onChange={(e) => setQty(r.itemId, e.target.value)}
                      aria-label={`كمية ${it?.name ?? ""}`}
                      className="pp-input !h-8 w-20 px-2 text-center text-xs"
                    />
                    <span className="w-12 text-xs text-muted">{it?.unit ?? ""}</span>
                    <button type="button" onClick={() => setRows((rs) => rs.filter((x) => x.itemId !== r.itemId))} aria-label="إزالة المكوّن" className="task-icon-btn task-icon-btn--danger !h-7 !w-7">
                      <Trash2 size={13} />
                    </button>
                  </li>
                );
              })}
            </ul>
          )}

          <div className="relative">
            <Search size={16} className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-muted" />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="ابحث في المخزون لإضافة مكوّن (ساعة، عطر، وردة...)" aria-label="بحث في المخزون" className="pp-input pp-input--icon" />
          </div>
          {results.length > 0 ? (
            <ul className="mt-1.5 flex max-h-48 flex-col gap-1 overflow-y-auto">
              {results.map((i) => (
                <li key={i.id}>
                  <button
                    type="button"
                    onClick={() => {
                      setRows((rs) => [...rs, { itemId: i.id, quantity: "1" }]);
                      setSearch("");
                    }}
                    className="flex w-full items-center gap-2 rounded-control border border-border/50 px-3 py-2 text-right pp-hover-row"
                  >
                    <Plus size={14} className="shrink-0 text-primary-deep" />
                    <span className="min-w-0 flex-1 truncate text-sm text-text">{i.name}</span>
                    <span className="text-[11px] text-muted">
                      المتاح {fmtQty(i.quantity)} {i.unit} · {fmtMoney(i.unitPrice)} ← {fmtMoney(i.sellPrice ?? 0)}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-xs text-muted">{items.length === 0 ? "لا توجد أصناف مفعّلة في المخزون." : search ? "لا توجد نتائج مطابقة." : "كل أصناف المخزون أُضيفت."}</p>
          )}
        </FieldWrap>

        <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-control border border-border px-4 py-2.5 text-sm">
          <span className="text-muted">
            التكلفة (من سعر الوحدة): <strong className="text-text">{fmtMoney(totals.cost)}</strong>
          </span>
          <span className="text-muted">
            سعر البيع (من المخزون): <strong className="text-primary-deep">{fmtMoney(totals.sell)}</strong>
          </span>
        </div>

        <FieldWrap label="ملاحظات" htmlFor="sp-notes">
          <Textarea id="sp-notes" value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={1000} />
        </FieldWrap>

        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
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
