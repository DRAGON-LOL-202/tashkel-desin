import { useState } from "react";
import { ChevronDown, ChevronUp, Minus, Plus, RotateCcw, Trash2, X } from "lucide-react";
import { Modal } from "../ui/Modal";
import { Button } from "../ui/Button";
import { FieldWrap, Input, Select, Textarea } from "../ui/Field";
import { todayISO } from "../../lib/date";
import type { AgentComponent, AgentItem, AgentOrder, AgentOrderInput, AgentProduct } from "../../types";

interface AgentOrderModalProps {
  open: boolean;
  onClose: () => void;
  products: AgentProduct[];
  /** أصناف المخزون المتاحة لإضافتها إلى محتويات البوكس (اسم ووحدة فقط) */
  items: AgentItem[];
  /** عند وجوده: تعديل مسودة */
  editing?: AgentOrder;
  /** تُرجع true عند النجاح لإغلاق النافذة */
  onSubmit: (input: AgentOrderInput) => Promise<boolean>;
}

interface CompDraft {
  itemId: string;
  itemName: string;
  unit: string;
  quantity: string;
}

interface LineDraft {
  key: number;
  productId: string;
  quantity: string;
  /** محتويات البوكس القابلة للتعديل (للوحدة الواحدة) */
  components: CompDraft[];
  open: boolean;
}

const toDraft = (c: AgentComponent): CompDraft => ({ itemId: c.itemId, itemName: c.itemName, unit: c.unit, quantity: String(c.quantity) });
const sig = (cs: { itemId: string; quantity: string | number }[]) =>
  cs
    .map((c) => `${c.itemId}:${Number(c.quantity)}`)
    .sort()
    .join(",");

let lineKey = 0;
const newLine = (productId = "", quantity = "1", components: CompDraft[] = [], open = false): LineDraft => ({ key: ++lineKey, productId, quantity, components, open });

// نموذج إضافة/تعديل أوردر فتاة. رقم البوليصة يُولَّد تلقائياً في الباكند (لا إدخال يدوي). سعر البيع تُدخله الفتاة.
export function AgentOrderModal({ open, onClose, products, items, editing, onSubmit }: AgentOrderModalProps) {
  const [date, setDate] = useState(editing?.date ?? todayISO());
  const [customerName, setCustomerName] = useState(editing?.customerName ?? "");
  const [customerPhone, setCustomerPhone] = useState(editing?.customerPhone ?? "");
  const [customerAddress, setCustomerAddress] = useState(editing?.customerAddress ?? "");
  const [notes, setNotes] = useState(editing?.notes ?? "");
  const [lines, setLines] = useState<LineDraft[]>(() =>
    editing && editing.lines.length > 0 ? editing.lines.map((l) => newLine(l.productId ?? "", String(l.quantity), l.components.map(toDraft))) : [newLine()]
  );
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const setLine = (key: number, patch: Partial<LineDraft>) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));

  const defaultsOf = (productId: string): CompDraft[] => (products.find((p) => p.id === productId)?.components ?? []).map(toDraft);
  const isCustom = (l: LineDraft) => l.productId !== "" && sig(l.components) !== sig(defaultsOf(l.productId));
  const pickProduct = (key: number, productId: string) => setLine(key, { productId, components: defaultsOf(productId) });
  const setComp = (key: number, itemId: string, patch: Partial<CompDraft>) =>
    setLines((ls) => ls.map((l) => (l.key === key ? { ...l, components: l.components.map((c) => (c.itemId === itemId ? { ...c, ...patch } : c)) } : l)));
  const removeComp = (key: number, itemId: string) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, components: l.components.filter((c) => c.itemId !== itemId) } : l)));
  const addComp = (key: number, itemId: string) => {
    const it = items.find((x) => x.id === itemId);
    if (!it) return;
    setLines((ls) =>
      ls.map((l) => {
        if (l.key !== key) return l;
        if (l.components.some((c) => c.itemId === itemId)) return { ...l, components: l.components.map((c) => (c.itemId === itemId ? { ...c, quantity: String((Number(c.quantity) || 0) + 1) } : c)) };
        return { ...l, components: [...l.components, { itemId: it.id, itemName: it.name, unit: it.unit, quantity: "1" }] };
      })
    );
  };

  const submit = async () => {
    if (!customerName.trim()) return setError("اسم العميل مطلوب");
    const filled = lines.filter((l) => l.productId);
    if (filled.length === 0) return setError("اختر بوكساً واحداً على الأقل");
    for (const l of filled) {
      const name = products.find((p) => p.id === l.productId)?.name ?? "البوكس";
      if (l.components.length === 0) return setError(`«${name}» يحتاج محتوى واحداً على الأقل`);
      if (l.components.some((c) => !(Number(c.quantity) > 0) || Math.abs(Number(c.quantity) * 1000 - Math.round(Number(c.quantity) * 1000)) > 1e-6)) return setError(`كمية أحد محتويات «${name}» غير صالحة (رقم أكبر من صفر، حتى 3 خانات عشرية)`);
    }
    const parsed = filled.map((l) => ({ productId: l.productId, quantity: Number(l.quantity), components: l.components.map((c) => ({ itemId: c.itemId, quantity: Number(c.quantity) })) }));
    if (parsed.some((l) => !Number.isInteger(l.quantity) || l.quantity < 1)) return setError("الكمية يجب أن تكون عدداً صحيحاً ≥ 1");
    setError("");
    setSaving(true);
    try {
      const ok = await onSubmit({ date, customerName: customerName.trim(), customerPhone: customerPhone.trim(), customerAddress: customerAddress.trim(), notes: notes.trim(), lines: parsed });
      if (ok) onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title={editing ? `تعديل الأوردر ${editing.waybill}` : "أوردر جديد"} description={editing ? "سعر البيع يُحسب تلقائياً من محتويات البوكسات" : "رقم البوليصة وسعر البيع يُحسبان تلقائياً عند الحفظ"} size="lg">
      <div className="grid grid-cols-1 gap-x-4 sm:grid-cols-2">
        <FieldWrap label="اسم العميل" htmlFor="ao-name">
          <Input id="ao-name" value={customerName} onChange={(e) => setCustomerName(e.target.value)} maxLength={120} />
        </FieldWrap>
        <FieldWrap label="رقم الهاتف" htmlFor="ao-phone">
          <Input id="ao-phone" dir="ltr" inputMode="tel" value={customerPhone} onChange={(e) => setCustomerPhone(e.target.value)} maxLength={30} />
        </FieldWrap>
      </div>
      <FieldWrap label="العنوان" htmlFor="ao-address">
        <Input id="ao-address" value={customerAddress} onChange={(e) => setCustomerAddress(e.target.value)} maxLength={300} />
      </FieldWrap>
      <FieldWrap label="تاريخ الأوردر" htmlFor="ao-date">
        <Input id="ao-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
      </FieldWrap>

      <div className="mb-4">
        <p className="mb-1.5 text-sm font-medium text-text">البوكسات</p>
        <div className="flex flex-col gap-2">
          {lines.map((l) => (
            <div key={l.key} className="rounded-control">
            <div className="flex items-center gap-2">
              <Select aria-label="البوكس" value={l.productId} onChange={(e) => pickProduct(l.key, e.target.value)} className="flex-1">
                <option value="">اختر البوكس…</option>
                {products.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </Select>
              <div className="flex items-center gap-1">
                <button type="button" aria-label="إنقاص" onClick={() => setLine(l.key, { quantity: String(Math.max(1, (Number(l.quantity) || 1) - 1)) })} className="flex h-9 w-9 items-center justify-center rounded-control border border-border text-muted hover:text-text">
                  <Minus size={14} />
                </button>
                <Input aria-label="الكمية" dir="ltr" inputMode="numeric" value={l.quantity} onChange={(e) => setLine(l.key, { quantity: e.target.value })} className="!w-14 !px-2 text-center" />
                <button type="button" aria-label="زيادة" onClick={() => setLine(l.key, { quantity: String((Number(l.quantity) || 0) + 1) })} className="flex h-9 w-9 items-center justify-center rounded-control border border-border text-muted hover:text-text">
                  <Plus size={14} />
                </button>
              </div>
              {lines.length > 1 && (
                <button type="button" aria-label="حذف البند" onClick={() => setLines((ls) => ls.filter((x) => x.key !== l.key))} className="flex h-9 w-9 items-center justify-center rounded-control text-problem hover:bg-problem/10">
                  <Trash2 size={15} />
                </button>
              )}
            </div>
            {l.productId && (
              <div className="mt-1.5">
                <button type="button" aria-expanded={l.open} onClick={() => setLine(l.key, { open: !l.open })} className="flex items-center gap-1 text-xs font-medium text-primary-deep hover:underline">
                  {l.open ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                  محتويات البوكس ({l.components.length}){isCustom(l) && <span className="rounded-full bg-primary/15 px-2 py-0.5 text-[11px]">معدّل</span>}
                </button>
                {l.open && (
                  <div className="mt-2 rounded-control border border-border bg-surface/50 p-2.5">
                    <p className="mb-2 text-xs text-muted">الكميات لبوكس واحد. التعديل يخص هذا الأوردر فقط ولا يغيّر البوكس الأصلي.</p>
                    <div className="flex flex-col gap-1.5">
                      {l.components.map((c) => (
                        <div key={c.itemId} className="flex items-center gap-2">
                          <span className="min-w-0 flex-1 truncate text-sm text-text">{c.itemName}</span>
                          <Input aria-label={`كمية ${c.itemName}`} dir="ltr" inputMode="decimal" value={c.quantity} onChange={(e) => setComp(l.key, c.itemId, { quantity: e.target.value })} className="!w-20 !px-2 text-center" />
                          <span className="w-12 truncate text-xs text-muted">{c.unit}</span>
                          <button type="button" aria-label={`حذف ${c.itemName}`} onClick={() => removeComp(l.key, c.itemId)} className="flex h-8 w-8 items-center justify-center rounded-control text-problem hover:bg-problem/10">
                            <X size={15} />
                          </button>
                        </div>
                      ))}
                      {l.components.length === 0 && <p className="text-xs text-problem">أضف صنفاً واحداً على الأقل</p>}
                    </div>
                    <div className="mt-2 flex items-center gap-2">
                      <Select aria-label="إضافة صنف للبوكس" value="" onChange={(e) => addComp(l.key, e.target.value)} className="flex-1">
                        <option value="">+ إضافة صنف…</option>
                        {items.map((it) => (
                          <option key={it.id} value={it.id}>
                            {it.name}
                          </option>
                        ))}
                      </Select>
                      {isCustom(l) && (
                        <Button type="button" variant="ghost" size="sm" icon={<RotateCcw size={14} />} onClick={() => setLine(l.key, { components: defaultsOf(l.productId) })}>
                          الأصلي
                        </Button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}
            </div>
          ))}
        </div>
        <Button type="button" variant="ghost" size="sm" icon={<Plus size={14} />} className="mt-2" onClick={() => setLines((ls) => [...ls, newLine()])}>
          إضافة بوكس آخر
        </Button>
      </div>

      <FieldWrap label="ملاحظات" htmlFor="ao-notes">
        <Textarea id="ao-notes" value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={1000} className="!min-h-[64px]" />
      </FieldWrap>

      {error && (
        <p className="mb-3 text-sm text-problem" role="alert">
          {error}
        </p>
      )}
      <div className="flex justify-end gap-2">
        <Button variant="secondary" onClick={onClose}>
          إلغاء
        </Button>
        <Button onClick={() => void submit()} disabled={saving}>
          {saving ? "جارٍ الحفظ…" : editing ? "حفظ التعديل" : "حفظ الأوردر"}
        </Button>
      </div>
    </Modal>
  );
}
