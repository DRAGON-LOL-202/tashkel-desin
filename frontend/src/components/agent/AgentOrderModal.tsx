import { useState } from "react";
import { Minus, Plus, Trash2 } from "lucide-react";
import { Modal } from "../ui/Modal";
import { Button } from "../ui/Button";
import { FieldWrap, Input, Select, Textarea } from "../ui/Field";
import { todayISO } from "../../lib/date";
import type { AgentOrder, AgentOrderInput, AgentProduct } from "../../types";

interface AgentOrderModalProps {
  open: boolean;
  onClose: () => void;
  products: AgentProduct[];
  /** عند وجوده: تعديل مسودة */
  editing?: AgentOrder;
  /** تُرجع true عند النجاح لإغلاق النافذة */
  onSubmit: (input: AgentOrderInput) => Promise<boolean>;
}

interface LineDraft {
  key: number;
  productId: string;
  quantity: string;
}

let lineKey = 0;
const newLine = (productId = "", quantity = "1"): LineDraft => ({ key: ++lineKey, productId, quantity });

// نموذج إضافة/تعديل أوردر فتاة. رقم البوليصة يُولَّد تلقائياً في الباكند (لا إدخال يدوي). سعر البيع تُدخله الفتاة.
export function AgentOrderModal({ open, onClose, products, editing, onSubmit }: AgentOrderModalProps) {
  const [date, setDate] = useState(editing?.date ?? todayISO());
  const [customerName, setCustomerName] = useState(editing?.customerName ?? "");
  const [customerPhone, setCustomerPhone] = useState(editing?.customerPhone ?? "");
  const [customerAddress, setCustomerAddress] = useState(editing?.customerAddress ?? "");
  const [notes, setNotes] = useState(editing?.notes ?? "");
  const [lines, setLines] = useState<LineDraft[]>(() =>
    editing && editing.lines.length > 0 ? editing.lines.map((l) => newLine(l.productId ?? "", String(l.quantity))) : [newLine()]
  );
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const setLine = (key: number, patch: Partial<LineDraft>) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));

  const submit = async () => {
    if (!customerName.trim()) return setError("اسم العميل مطلوب");
    const filled = lines.filter((l) => l.productId);
    if (filled.length === 0) return setError("اختر بوكساً واحداً على الأقل");
    const parsed = filled.map((l) => ({ productId: l.productId, quantity: Number(l.quantity) }));
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
            <div key={l.key} className="flex items-center gap-2">
              <Select aria-label="البوكس" value={l.productId} onChange={(e) => setLine(l.key, { productId: e.target.value })} className="flex-1">
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
