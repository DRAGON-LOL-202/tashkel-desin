import { useMemo, useState } from "react";
import { ChevronDown, ChevronUp, Minus, Plus, RotateCcw, Trash2, X } from "lucide-react";
import { Modal } from "../ui/Modal";
import { Button } from "../ui/Button";
import { FieldWrap, Input, Select, Textarea } from "../ui/Field";
import { fmtMoney, fmtQty } from "../inventory/format";
import { calcAdjustedBoxPrice } from "../../lib/boxPricing";
import { todayISO } from "../../lib/date";
import type { AgentComponent, AgentItem, AgentOrder, AgentOrderInput, AgentProduct } from "../../types";

interface AgentOrderModalProps {
  open: boolean;
  onClose: () => void;
  products: AgentProduct[];
  /** أصناف المخزون المتاحة لإضافتها إلى محتويات البوكس (الاسم والوحدة وأسعار الإضافة/الحذف فقط) */
  items: AgentItem[];
  /** عند وجوده: تعديل مسودة */
  editing?: AgentOrder;
  /** رقم البوليصة المتوقع للعرض الإرشادي */
  nextWaybill?: number | null;
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
  /** محفوظ فقط عند تعديل مسودة قديمة لبوكس بلا سعر ثابت */
  legacyBoxPrice: number | null;
  /** محتويات البوكس القابلة للتعديل (للوحدة الواحدة) */
  components: CompDraft[];
  open: boolean;
  itemQuery: string;
}

const toDraft = (c: AgentComponent): CompDraft => ({ itemId: c.itemId, itemName: c.itemName, unit: c.unit, quantity: String(c.quantity) });
const sig = (cs: { itemId: string; quantity: string | number }[]) =>
  cs
    .map((c) => `${c.itemId}:${Number(c.quantity)}`)
    .sort()
    .join(",");

const validMoney = (s: string) => {
  const n = Number(s);
  return s.trim() !== "" && Number.isFinite(n) && n >= 0 && n <= 10_000_000 && Math.abs(n * 100 - Math.round(n * 100)) < 1e-6;
};

let lineKey = 0;
const newLine = (
  productId = "",
  quantity = "1",
  legacyBoxPrice: number | null = null,
  components: CompDraft[] = [],
  open = false
): LineDraft => ({ key: ++lineKey, productId, quantity, legacyBoxPrice, components, open, itemQuery: "" });

// نموذج الفاتورة للفتاة: التاريخ، العميل، الصنف، الكمية، والسعر يُحسب تلقائياً من السعر الثابت + أسعار الإضافة والحذف (غير قابل للتعديل يدوياً).
export function AgentOrderModal({ open, onClose, products, items, editing, nextWaybill, onSubmit }: AgentOrderModalProps) {
  const [date, setDate] = useState(editing?.date ?? todayISO());
  const [customerName, setCustomerName] = useState(editing?.customerName ?? "");
  const [customerPhone, setCustomerPhone] = useState(editing?.customerPhone ?? "");
  const [customerAddress, setCustomerAddress] = useState(editing?.customerAddress ?? "");
  const [shippingPrice, setShippingPrice] = useState(editing?.shippingPrice != null ? String(editing.shippingPrice) : "");
  const [notes, setNotes] = useState(editing?.notes ?? "");
  const [lines, setLines] = useState<LineDraft[]>(() =>
    editing && editing.lines.length > 0
      ? editing.lines.map((l) => newLine(l.productId ?? "", String(l.quantity), l.boxPrice ?? null, l.components.map(toDraft)))
      : [newLine()]
  );
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const itemPrices = useMemo(() => {
    const map = new Map<string, { addPrice: number; removePrice: number }>();
    for (const p of products) {
      for (const c of p.components) map.set(c.itemId, { addPrice: c.addPrice, removePrice: c.removePrice });
    }
    for (const it of items) {
      map.set(it.id, { addPrice: it.addPrice, removePrice: it.removePrice });
    }
    return map;
  }, [products, items]);

  const setLine = (key: number, patch: Partial<LineDraft>) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));

  const defaultsOf = (productId: string): CompDraft[] => (products.find((p) => p.id === productId)?.components ?? []).map(toDraft);
  const isCustom = (l: LineDraft) => l.productId !== "" && sig(l.components) !== sig(defaultsOf(l.productId));
  const pickProduct = (key: number, productId: string) =>
    setLine(key, { productId, legacyBoxPrice: null, components: defaultsOf(productId) });
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
  const restoreDefaultComp = (key: number, dc: { itemId: string; itemName: string; unit: string; quantity: number }) =>
    setLines((ls) =>
      ls.map((l) =>
        l.key === key && !l.components.some((c) => c.itemId === dc.itemId)
          ? { ...l, components: [...l.components, { itemId: dc.itemId, itemName: dc.itemName, unit: dc.unit, quantity: String(dc.quantity) }] }
          : l
      )
    );

  const resolveLinePricing = (l: LineDraft) => {
    const product = products.find((p) => p.id === l.productId);
    if (!product) {
      return {
        product: undefined,
        unitPrice: null as number | null,
        unitCents: 0,
        delta: 0,
      };
    }
    if (product.fixedPrice != null) {
      const calc = calcAdjustedBoxPrice(product.fixedPrice, product.components, l.components, itemPrices);
      return {
        product,
        unitPrice: calc.unitPrice,
        unitCents: calc.unitCents,
        delta: calc.delta,
      };
    }
    if (l.legacyBoxPrice != null) {
      return {
        product,
        unitPrice: l.legacyBoxPrice,
        unitCents: Math.round(l.legacyBoxPrice * 100),
        delta: 0,
      };
    }
    return {
      product,
      unitPrice: null as number | null,
      unitCents: 0,
      delta: 0,
    };
  };

  // حساب المجاميع المباشرة في الفاتورة (سعر الخروج التلقائي + م شحن = الإجمالي بالشحن)
  const boxesTotalCents = lines.reduce((acc, l) => {
    const qty = Number(l.quantity);
    if (!l.productId || !Number.isInteger(qty) || qty < 1) return acc;
    const { unitPrice, unitCents } = resolveLinePricing(l);
    return unitPrice !== null ? acc + qty * unitCents : acc;
  }, 0);
  const shippingCents = validMoney(shippingPrice) ? Math.round(Number(shippingPrice) * 100) : 0;
  const boxesTotal = Math.round(boxesTotalCents) / 100;
  const grandTotal = Math.round(boxesTotalCents + shippingCents) / 100;

  const submit = async () => {
    if (!customerName.trim()) return setError("اسم العميل مطلوب");
    const filled = lines.filter((l) => l.productId);
    if (filled.length === 0) return setError("اختر صنفاً / بوكساً واحداً على الأقل");
    for (const l of filled) {
      const name = products.find((p) => p.id === l.productId)?.name ?? "البوكس";
      const qNum = Number(l.quantity);
      if (!Number.isInteger(qNum) || qNum < 1) return setError(`الكمية لـ «${name}» يجب أن تكون عدداً صحيحاً ≥ 1`);
      if (l.components.length === 0) return setError(`«${name}» يحتاج محتوى واحداً على الأقل`);
      if (l.components.some((c) => !(Number(c.quantity) > 0) || Math.abs(Number(c.quantity) * 1000 - Math.round(Number(c.quantity) * 1000)) > 1e-6)) {
        return setError(`كمية أحد محتويات «${name}» غير صالحة (رقم أكبر من صفر، حتى 3 خانات عشرية)`);
      }
    }
    if (shippingPrice.trim() !== "" && !validMoney(shippingPrice)) {
      return setError("مصاريف الشحن غير صالحة");
    }

    const parsedLines = filled.map((l) => {
      const product = products.find((p) => p.id === l.productId);
      return {
        productId: l.productId,
        quantity: Number(l.quantity),
        ...(product?.fixedPrice == null && l.legacyBoxPrice != null ? { boxPrice: l.legacyBoxPrice } : {}),
        components: l.components.map((c) => ({ itemId: c.itemId, quantity: Number(c.quantity) })),
      };
    });
    const parsedShipping = shippingPrice.trim() === "" ? (editing ? null : undefined) : Math.round(Number(shippingPrice) * 100) / 100;

    setError("");
    setSaving(true);
    try {
      const ok = await onSubmit({
        date,
        customerName: customerName.trim(),
        customerPhone: customerPhone.trim(),
        customerAddress: customerAddress.trim(),
        notes: notes.trim(),
        ...(parsedShipping !== undefined ? { shippingPrice: parsedShipping } : {}),
        lines: parsedLines,
      });
      if (ok) onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={editing ? `تعديل الأوردر ${editing.waybill}` : "أوردر جديد (فاتورة عميل)"}
      description={
        editing
          ? `تاريخ الأوردر: ${date}`
          : nextWaybill
            ? `رقم البوليصة التالي: ${nextWaybill} (يُحجز تلقائياً عند الحفظ)`
            : "رقم البوليصة يُحجز تلقائياً عند الحفظ"
      }
      size="lg"
    >
      <div className="grid grid-cols-1 gap-x-4 sm:grid-cols-2">
        <FieldWrap label="التاريخ" htmlFor="ao-date">
          <Input id="ao-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </FieldWrap>
        <FieldWrap label="إسم العميل" htmlFor="ao-name">
          <Input id="ao-name" value={customerName} onChange={(e) => setCustomerName(e.target.value)} maxLength={120} placeholder="اسم العميل ثلاثي" />
        </FieldWrap>
        <FieldWrap label="تليفون" htmlFor="ao-phone">
          <Input id="ao-phone" dir="ltr" inputMode="tel" value={customerPhone} onChange={(e) => setCustomerPhone(e.target.value)} maxLength={60} placeholder="01097457278 / 01029793559" />
        </FieldWrap>
        <FieldWrap label="العنوان" htmlFor="ao-address">
          <Input id="ao-address" value={customerAddress} onChange={(e) => setCustomerAddress(e.target.value)} maxLength={300} placeholder="المحافظة / المركز / العنوان" />
        </FieldWrap>
      </div>

      {/* الأصناف / البوكسات بالكمية وسعر كل بوكس التلقائي والإجمالي */}
      <div className="mb-4">
        <div className="mb-1.5 hidden grid-cols-12 gap-2 px-1 text-xs font-semibold text-muted sm:grid">
          <span className="col-span-5">إسم الصنف (البوكس)</span>
          <span className="col-span-3 text-center">الكمية</span>
          <span className="col-span-2 text-center">السعر (تلقائي)</span>
          <span className="col-span-2 text-center">الإجمالي</span>
        </div>
        <div className="flex flex-col gap-2.5">
          {lines.map((l) => {
            const qNum = Number(l.quantity);
            const { product, unitPrice, unitCents, delta } = resolveLinePricing(l);
            const hasLineTotal = l.productId !== "" && Number.isInteger(qNum) && qNum >= 1 && unitPrice !== null;
            const lineSum = hasLineTotal ? Math.round(qNum * unitCents) / 100 : null;
            const removedDefaults = product ? product.components.filter((dc) => !l.components.some((c) => c.itemId === dc.itemId)) : [];
            return (
              <div key={l.key} className="rounded-control border border-border/70 bg-background/40 p-2">
                <div className="grid grid-cols-1 items-center gap-2 sm:grid-cols-12">
                  <div className="sm:col-span-5">
                    <Select aria-label="إسم الصنف" value={l.productId} onChange={(e) => pickProduct(l.key, e.target.value)}>
                      <option value="">اختر البوكس…</option>
                      {products.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.fixedPrice != null ? `${p.name} — ${fmtMoney(p.fixedPrice)}` : p.name}
                        </option>
                      ))}
                    </Select>
                  </div>
                  <div className="flex items-center justify-center gap-1 sm:col-span-3">
                    <button type="button" aria-label="إنقاص" onClick={() => setLine(l.key, { quantity: String(Math.max(1, (Number(l.quantity) || 1) - 1)) })} className="flex h-9 w-8 shrink-0 items-center justify-center rounded-control border border-border text-muted hover:text-text">
                      <Minus size={13} />
                    </button>
                    <Input aria-label="الكمية" dir="ltr" inputMode="numeric" value={l.quantity} onChange={(e) => setLine(l.key, { quantity: e.target.value })} className="!w-14 !px-1.5 text-center tabular-nums" />
                    <button type="button" aria-label="زيادة" onClick={() => setLine(l.key, { quantity: String((Number(l.quantity) || 0) + 1) })} className="flex h-9 w-8 shrink-0 items-center justify-center rounded-control border border-border text-muted hover:text-text">
                      <Plus size={13} />
                    </button>
                  </div>
                  <div className="flex items-center justify-between gap-1 sm:col-span-2 sm:flex-col sm:justify-center">
                    <span className="text-xs text-muted sm:hidden">السعر (تلقائي):</span>
                    <div className="flex min-h-[38px] w-full flex-col items-center justify-center rounded-control border border-border/70 bg-surface/60 px-2 py-1 text-center">
                      {!l.productId ? (
                        <span className="text-xs text-muted">—</span>
                      ) : unitPrice === null ? (
                        <span className="text-xs text-muted">تلقائي</span>
                      ) : (
                        <>
                          <span className="text-sm font-bold tabular-nums text-text">{fmtMoney(unitPrice)}</span>
                          {delta !== 0 && (
                            <span className={`text-[10px] font-semibold tabular-nums ${delta > 0 ? "text-primary-deep" : "text-problem"}`}>
                              {delta > 0 ? `+${fmtMoney(delta)}` : `-${fmtMoney(Math.abs(delta))}`}
                            </span>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center justify-between gap-1 sm:col-span-2 sm:justify-center">
                    <span className="text-xs text-muted sm:hidden">الإجمالي:</span>
                    <span className="font-bold tabular-nums text-primary-deep">
                      {lineSum !== null ? fmtMoney(lineSum) : "—"}
                    </span>
                    {lines.length > 1 && (
                      <button type="button" aria-label="حذف البند" onClick={() => setLines((ls) => ls.filter((x) => x.key !== l.key))} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-control text-problem hover:bg-problem/10">
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>
                </div>
                {l.productId && (
                  <div className="mt-2">
                    <button type="button" aria-expanded={l.open} onClick={() => setLine(l.key, { open: !l.open })} className="flex items-center gap-1 text-xs font-medium text-primary-deep hover:underline">
                      {l.open ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                      محتويات البوكس ({l.components.length}){isCustom(l) && <span className="rounded-full bg-primary/15 px-2 py-0.5 text-[11px]">معدّل</span>}
                    </button>
                    {l.open && (
                      <div className="mt-2 rounded-control border border-border bg-surface/60 p-2.5">
                        {product?.fixedPrice != null ? (
                          <p className="mb-2 text-xs text-muted">
                            السعر الثابت للبوكس: <strong className="text-text">{fmtMoney(product.fixedPrice)}</strong> — الإضافة تضيف «سعر الإضافة» والحذف يخصم «سعر الحذف» تلقائياً. التعديل يخص هذا الأوردر فقط.
                          </p>
                        ) : (
                          <p className="mb-2 text-xs text-muted">الكميات لبوكس واحد. التعديل يخص هذا الأوردر فقط ولا يغيّر البوكس الأصلي.</p>
                        )}
                        <div className="flex flex-col gap-1.5">
                          {l.components.map((c) => {
                            const prices = itemPrices.get(c.itemId);
                            const priceHint =
                              prices && (prices.addPrice > 0 || prices.removePrice > 0)
                                ? [prices.addPrice > 0 ? `+${fmtMoney(prices.addPrice)}` : "", prices.removePrice > 0 ? `-${fmtMoney(prices.removePrice)}` : ""].filter(Boolean).join(" / ")
                                : "";
                            return (
                              <div key={c.itemId} className="flex items-center gap-2">
                                <span className="min-w-0 flex-1 truncate text-sm text-text">
                                  {c.itemName}
                                  {priceHint && <span className="ms-1.5 text-[11px] text-muted">({priceHint})</span>}
                                </span>
                                <Input aria-label={`كمية ${c.itemName}`} dir="ltr" inputMode="decimal" value={c.quantity} onChange={(e) => setComp(l.key, c.itemId, { quantity: e.target.value })} className="!w-20 !px-2 text-center" />
                                <span className="w-12 truncate text-xs text-muted">{c.unit}</span>
                                <button type="button" aria-label={`حذف ${c.itemName}`} onClick={() => removeComp(l.key, c.itemId)} className="flex h-8 w-8 items-center justify-center rounded-control text-problem hover:bg-problem/10">
                                  <X size={15} />
                                </button>
                              </div>
                            );
                          })}
                          {l.components.length === 0 && <p className="text-xs text-problem">أضف صنفاً واحداً على الأقل</p>}
                        </div>
                        {removedDefaults.length > 0 && (
                          <div className="mt-2 flex flex-wrap items-center gap-1.5">
                            {removedDefaults.map((dc) => (
                              <button
                                key={dc.itemId}
                                type="button"
                                onClick={() => restoreDefaultComp(l.key, dc)}
                                className="inline-flex items-center gap-1 rounded-full border border-problem/40 bg-problem/5 px-2.5 py-0.5 text-[11px] text-problem hover:bg-problem/15"
                                title="اضغط لإعادة المكوّن إلى البوكس"
                              >
                                <RotateCcw size={11} />
                                محذوف: {dc.itemName} × {fmtQty(dc.quantity)}
                                {dc.removePrice > 0 && ` (-${fmtMoney(Math.round(dc.removePrice * dc.quantity * 100) / 100)})`}
                              </button>
                            ))}
                          </div>
                        )}
                        <div className="mt-2 flex flex-col gap-1.5">
                          {items.length > 8 && (
                            <Input
                              aria-label="بحث عن صنف لإضافته"
                              placeholder="ابحث عن صنف لإضافته..."
                              value={l.itemQuery}
                              onChange={(e) => setLine(l.key, { itemQuery: e.target.value })}
                              className="!h-8 text-xs"
                            />
                          )}
                          <div className="flex items-center gap-2">
                            <Select aria-label="إضافة صنف للبوكس" value="" onChange={(e) => { addComp(l.key, e.target.value); if (l.itemQuery) setLine(l.key, { itemQuery: "" }); }} className="flex-1">
                              <option value="">+ إضافة صنف…</option>
                              {items
                                .filter((it) => !l.itemQuery.trim() || it.name.toLowerCase().includes(l.itemQuery.trim().toLowerCase()))
                                .map((it) => (
                                  <option key={it.id} value={it.id}>
                                    {it.addPrice > 0 ? `${it.name} (+${fmtMoney(it.addPrice)})` : it.name}
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
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
        <Button type="button" variant="ghost" size="sm" icon={<Plus size={14} />} className="mt-2" onClick={() => setLines((ls) => [...ls, newLine()])}>
          إضافة بوكس آخر
        </Button>
      </div>

      {/* م شحن + ملخص الفاتورة */}
      <div className="mb-4 grid grid-cols-1 gap-3 rounded-control border border-border bg-background/60 p-3 sm:grid-cols-12 sm:items-end">
        <div className="sm:col-span-4">
          <label htmlFor="ao-shipping" className="mb-1.5 block text-sm font-medium text-text">
            م شحن (اختياري)
          </label>
          <Input
            id="ao-shipping"
            dir="ltr"
            inputMode="decimal"
            placeholder="مثال: 70"
            value={shippingPrice}
            onChange={(e) => setShippingPrice(e.target.value)}
            className="text-center font-semibold tabular-nums"
          />
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3 sm:col-span-8 sm:justify-end">
          <div className="text-center sm:text-end">
            <p className="text-[11px] text-muted">سعر الخروج</p>
            <p className="font-bold tabular-nums text-text">{fmtMoney(boxesTotal)}</p>
          </div>
          <div className="text-center sm:text-end">
            <p className="text-[11px] text-muted">م شحن</p>
            <p className="font-semibold tabular-nums text-muted">
              {validMoney(shippingPrice) ? fmtMoney(Number(shippingPrice)) : "—"}
            </p>
          </div>
          <div className="rounded-control border border-primary-deep/30 bg-primary/10 px-3 py-1.5 text-center sm:text-end">
            <p className="text-[11px] font-medium text-primary-deep">الإجمالي بالشحن</p>
            <p className="text-base font-bold tabular-nums text-primary-deep">{fmtMoney(grandTotal)}</p>
          </div>
        </div>
      </div>

      <FieldWrap label="الملاحظات" htmlFor="ao-notes">
        <Textarea id="ao-notes" value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={1000} placeholder="الاسم على الميدالية / تفاصيل المحتويات..." className="!min-h-[72px]" />
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
