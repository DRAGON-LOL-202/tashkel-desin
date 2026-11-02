import { useMemo, useState, type FormEvent } from "react";
import { Minus, Plus } from "lucide-react";
import type { SalesOrderCreateInput, SalesProduct } from "../../types";
import { fmtMoney, fmtQty } from "../inventory/format";
import { Modal } from "../ui/Modal";
import { Button } from "../ui/Button";
import { FieldWrap, Input } from "../ui/Field";

interface NewOrderModalProps {
  open: boolean;
  onClose: () => void;
  date: string;
  products: SalesProduct[];
  closers: string[];
  onSubmit: (input: SalesOrderCreateInput) => Promise<boolean>;
}

// أوردر جديد: اضغط على المنتج الثابت فيُضاف بمحتوياته (الضغط مجدداً يزيد العدد)، ثم رقم البوليصة والمقفل.
export function NewOrderModal({ open, onClose, date, products, closers, onSubmit }: NewOrderModalProps) {
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [waybill, setWaybill] = useState("");
  const [closer, setCloser] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const active = useMemo(() => products.filter((p) => p.isActive && p.components.length > 0), [products]);
  const chosen = active.filter((p) => (counts[p.id] ?? 0) > 0);
  const totals = useMemo(() => {
    let cost = 0;
    let sell = 0;
    for (const p of chosen) {
      const n = counts[p.id] ?? 0;
      cost += Math.round(p.costPerUnit * 100) * n;
      sell += Math.round(p.sellPerUnit * 100) * n;
    }
    return { cost: cost / 100, sell: sell / 100 };
  }, [chosen, counts]);

  const bump = (id: string, d: number) => setCounts((c) => ({ ...c, [id]: Math.max(0, Math.min(1000, (c[id] ?? 0) + d)) }));

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (saving) return;
    if (chosen.length === 0) {
      setError("اختر منتجاً واحداً على الأقل");
      return;
    }
    setError("");
    setSaving(true);
    const ok = await onSubmit({
      date,
      waybill: waybill.trim(),
      closerName: closer.trim(),
      lines: chosen.map((p) => ({ productId: p.id, quantity: counts[p.id] ?? 1 })),
    });
    setSaving(false);
    if (ok) {
      setCounts({});
      setWaybill("");
      setCloser("");
      onClose();
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="أوردر جديد" description="اضغط على المنتج ليُضاف بمحتوياته، ثم أدخل رقم البوليصة" size="lg">
      <form onSubmit={submit} noValidate>
        {active.length === 0 ? (
          <p className="mb-4 rounded-control border border-border px-3 py-4 text-center text-sm text-muted">لا توجد منتجات ثابتة بعد. أضف منتجاً ثابتاً (مثل «بوكس كبير») من زر «المنتجات الثابتة» أولاً.</p>
        ) : (
          <div className="mb-4 grid gap-2 sm:grid-cols-2">
            {active.map((p) => {
              const n = counts[p.id] ?? 0;
              return (
                <div key={p.id} className="rounded-control border p-3 transition-colors" style={{ borderColor: n > 0 ? "var(--primary-deep)" : "var(--border)" }}>
                  <button type="button" onClick={() => bump(p.id, 1)} className="w-full text-right" aria-label={`إضافة ${p.name}`}>
                    <span className="block text-sm font-bold text-text">{p.name}</span>
                    <span className="mt-1 block text-[11px] leading-5 text-muted">{p.components.map((c) => `${c.itemName} × ${fmtQty(c.quantity)}`).join(" · ")}</span>
                    <span className="mt-1 block text-xs text-muted">
                      {fmtMoney(p.costPerUnit)} ← <strong className="text-text">{fmtMoney(p.sellPerUnit)}</strong>
                    </span>
                  </button>
                  {n > 0 && (
                    <div className="mt-2 flex items-center gap-2">
                      <button type="button" onClick={() => bump(p.id, -1)} className="task-stepper-btn" aria-label="إنقاص">
                        <Minus size={14} />
                      </button>
                      <span dir="ltr" className="min-w-8 text-center font-mono text-sm font-bold tabular-nums text-text">
                        {n}
                      </span>
                      <button type="button" onClick={() => bump(p.id, 1)} className="task-stepper-btn" aria-label="زيادة">
                        <Plus size={14} />
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        <div className="grid gap-x-3 sm:grid-cols-2">
          <FieldWrap label="رقم البوليصة" htmlFor="so-waybill">
            <Input id="so-waybill" value={waybill} onChange={(e) => setWaybill(e.target.value)} maxLength={60} dir="ltr" className="text-right" placeholder="اختياري الآن ويمكن إدخاله لاحقاً" />
          </FieldWrap>
          <FieldWrap label="اسم المقفل" htmlFor="so-closer">
            <Input id="so-closer" value={closer} onChange={(e) => setCloser(e.target.value)} maxLength={80} list="so-closers" placeholder="من أغلق الأوردر؟" />
            <datalist id="so-closers">
              {closers.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
          </FieldWrap>
        </div>

        {chosen.length > 0 && (
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-control border border-border px-4 py-2.5 text-sm">
            <span className="text-muted">
              التكلفة: <strong className="text-text">{fmtMoney(totals.cost)}</strong>
            </span>
            <span className="text-muted">
              سعر البيع: <strong className="text-primary-deep">{fmtMoney(totals.sell)}</strong>
            </span>
          </div>
        )}
        {error && <p className="mb-3 text-xs text-problem">{error}</p>}

        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            إلغاء
          </Button>
          <Button type="submit" disabled={saving || active.length === 0}>
            {saving ? "جارٍ الحفظ..." : "إضافة الأوردر"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
