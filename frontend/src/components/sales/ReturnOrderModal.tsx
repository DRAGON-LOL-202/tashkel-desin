import { useMemo, useState } from "react";
import { AlertTriangle, Check, PackageCheck } from "lucide-react";
import type { SalesOrder } from "../../types";
import { calcTotalValue, fmtMoney, fmtQty } from "../inventory/format";
import { Modal } from "../ui/Modal";
import { Button } from "../ui/Button";

interface ReturnOrderModalProps {
  open: boolean;
  onClose: () => void;
  order: SalesOrder;
  /** يُرسل معرّفات المكونات التالفة؛ يرجع true عند النجاح */
  onConfirm: (damagedComponentIds: string[]) => Promise<boolean>;
  /** صفحة الأوردرات: بدون تكلفة التالف */
  hideMoney?: boolean;
}

// مرتجع أوردر: تظهر محتويات الأوردر ويضغط المستخدم على أي مكوّن تالف.
// التالف لا يعود للمخزون ويُحسب في إجمالي التالف لليوم؛ الباقي يعود للمخزون.
export function ReturnOrderModal({ open, onClose, order, onConfirm, hideMoney }: ReturnOrderModalProps) {
  const [damaged, setDamaged] = useState<Set<string>>(() => new Set());
  const [saving, setSaving] = useState(false);

  const toggle = (id: string) =>
    setDamaged((cur) => {
      const next = new Set(cur);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  // إجمالي تكلفة التالف وعدد المكوّنات (بدقة القروش)
  const totals = useMemo(() => {
    let cents = 0;
    let all = 0;
    for (const line of order.lines) {
      for (const c of line.components) {
        all += 1;
        if (damaged.has(c.id)) cents += Math.round(calcTotalValue(c.quantity * line.quantity, c.unitCost ?? 0) * 100);
      }
    }
    return { cost: cents / 100, all };
  }, [order.lines, damaged]);

  const submit = async () => {
    if (saving) return;
    setSaving(true);
    const ok = await onConfirm([...damaged]);
    setSaving(false);
    if (ok) onClose();
  };

  return (
    <Modal open={open} onClose={onClose} title="مرتجع الأوردر" description="اضغط على أي مكوّن تالف؛ التالف لا يعود للمخزون ويُحسب ضمن تالف اليوم، والباقي يعود تلقائياً" size="lg">
      <ul className="mb-4 flex flex-col gap-3">
        {order.lines.map((line) => (
          <li key={line.id} className="rounded-control border border-border/60 p-3">
            <p className="mb-2 text-sm font-bold text-text">
              {line.productName} <span dir="ltr" className="text-xs font-semibold text-muted">× {line.quantity}</span>
            </p>
            <div className="flex flex-wrap gap-2">
              {line.components.map((c) => {
                const isDamaged = damaged.has(c.id);
                const total = c.quantity * line.quantity;
                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => toggle(c.id)}
                    aria-pressed={isDamaged}
                    title={isDamaged ? "إلغاء تحديده كتالف" : "تحديده كتالف"}
                    className={`inline-flex min-h-10 items-center gap-2 rounded-xl border px-3 py-1.5 text-sm font-medium transition-colors ${
                      isDamaged ? "border-problem bg-problem/15 text-problem" : "border-border bg-background/60 text-text hover:border-primary-deep"
                    }`}
                  >
                    {isDamaged ? <AlertTriangle size={14} className="shrink-0" /> : <Check size={14} className="shrink-0 text-primary-deep" />}
                    <span>{c.itemName}</span>
                    <span dir="ltr" className="text-xs font-bold">
                      × {fmtQty(total)}
                    </span>
                    {isDamaged && <span className="text-xs font-bold">تالف</span>}
                  </button>
                );
              })}
            </div>
          </li>
        ))}
      </ul>

      <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-control border border-border px-4 py-2.5 text-sm">
        <span className="flex items-center gap-1.5 text-muted">
          <PackageCheck size={16} className="text-primary-deep" />
          يعود للمخزون: <strong className="text-text">{totals.all - damaged.size}</strong> من {totals.all}
        </span>
        {!hideMoney && (
          <span className="text-muted">
            تكلفة التالف: <strong className={damaged.size > 0 ? "text-problem" : "text-text"}>{fmtMoney(totals.cost)}</strong>
          </span>
        )}
      </div>

      <div className="flex justify-end gap-2">
        <Button type="button" variant="secondary" onClick={onClose}>
          إلغاء
        </Button>
        <Button type="button" onClick={() => void submit()} disabled={saving}>
          {saving ? "جارٍ الحفظ..." : damaged.size > 0 ? `تأكيد المرتجع (${damaged.size} تالف)` : "تأكيد المرتجع (بدون تالف)"}
        </Button>
      </div>
    </Modal>
  );
}
