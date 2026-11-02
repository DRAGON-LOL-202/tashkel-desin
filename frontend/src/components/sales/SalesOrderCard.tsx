import { useState } from "react";
import { AlertTriangle, Check, Minus, PackageCheck, Plus, Trash2 } from "lucide-react";
import type { SalesOrder, SalesOrderPatch, SalesOrderStatus, SalesProduct } from "../../types";
import { fmtMoney, fmtQty } from "../inventory/format";
import { Badge } from "../ui/Badge";
import { formatArabicDate } from "../../lib/date";
import { SALES_STATUS_META, SALES_STATUS_ORDER } from "./status";

interface SalesOrderCardProps {
  order: SalesOrder;
  /** رقم الأوردر في اليوم (بترتيب الإضافة) */
  index: number;
  /** يظهر تاريخ الأوردر عند البحث عبر كل الأيام */
  showDate?: boolean;
  products: SalesProduct[];
  closers: string[];
  onPatch: (order: SalesOrder, patch: SalesOrderPatch) => Promise<boolean>;
  onStatus: (order: SalesOrder, status: SalesOrderStatus) => Promise<void>;
  onDelete: (order: SalesOrder) => void;
  onAddLine: (order: SalesOrder, productId: string) => Promise<void>;
  onSetLineQty: (order: SalesOrder, lineId: string, quantity: number) => Promise<void>;
  onRemoveLine: (order: SalesOrder, lineId: string) => Promise<void>;
}

// كرت أوردر (مستطيل مثل كرت المهمة): رقم البوليصة والمقفل والمنتجات بمحتوياتها والتكلفة وسعر البيع وأزرار الحالة.
export function SalesOrderCard({ order, index, showDate, products, closers, onPatch, onStatus, onDelete, onAddLine, onSetLineQty, onRemoveLine }: SalesOrderCardProps) {
  const meta = SALES_STATUS_META[order.status];
  const [waybill, setWaybill] = useState(order.waybill);
  const [closer, setCloser] = useState(order.closerName);
  const [notes, setNotes] = useState(order.notes);
  const [busy, setBusy] = useState(false);

  // مزامنة الحقول عند وصول قيمة جديدة من الخادم (مستخدم آخر أو بعد الحفظ) بدون effect
  const [seen, setSeen] = useState({ waybill: order.waybill, closer: order.closerName, notes: order.notes });
  if (seen.waybill !== order.waybill || seen.closer !== order.closerName || seen.notes !== order.notes) {
    if (seen.waybill !== order.waybill) setWaybill(order.waybill);
    if (seen.closer !== order.closerName) setCloser(order.closerName);
    if (seen.notes !== order.notes) setNotes(order.notes);
    setSeen({ waybill: order.waybill, closer: order.closerName, notes: order.notes });
  }

  const act = async (fn: () => Promise<unknown>) => {
    if (busy) return;
    setBusy(true);
    try {
      await fn();
    } finally {
      setBusy(false);
    }
  };

  const saveField = (key: "waybill" | "closerName" | "notes", value: string, current: string, reset: (v: string) => void) => {
    const next = value.trim();
    if (next === current) {
      reset(current);
      return;
    }
    void act(async () => {
      const ok = await onPatch(order, { [key]: next });
      if (!ok) reset(current); // مثلاً رقم بوليصة مكرر: نعيد القيمة القديمة
    });
  };

  const editable = order.status === "REGISTERED" && !order.stockDeducted;
  const activeProducts = products.filter((p) => p.isActive && p.components.length > 0);
  const shortItems = new Set(order.shortages.map((s) => s.itemId));
  const profitNegative = order.profit < 0;

  return (
    <article className="pp-card relative flex flex-col gap-3 p-4 sm:p-5" style={{ borderInlineStart: `4px solid ${meta.color}` }} data-status={order.status} aria-label={`أوردر ${index}`}>
      {/* الصف العلوي */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="flex h-9 min-w-9 items-center justify-center rounded-full border border-border px-2 text-sm font-bold text-text">{index}</span>
        <Badge color={meta.color} outlined>
          {meta.label}
        </Badge>
        {order.stockDeducted && (
          <span className="flex items-center gap-1 text-xs font-medium text-primary-deep">
            <PackageCheck size={14} /> خُصم من المخزون
          </span>
        )}
        {showDate && <span className="text-xs text-muted">{formatArabicDate(order.date, "d MMMM yyyy")}</span>}
        <span className="mr-auto text-[11px] text-muted">أضافه: {order.createdByName}</span>
        <button
          type="button"
          onClick={() => onDelete(order)}
          disabled={busy}
          aria-label="حذف الأوردر"
          title="حذف الأوردر"
          className="task-icon-btn task-icon-btn--danger"
        >
          <Trash2 size={16} />
        </button>
      </div>

      {/* رقم البوليصة واسم المقفل */}
      <div className="grid gap-2 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-xs font-medium text-muted">
          رقم البوليصة
          <input
            value={waybill}
            onChange={(e) => setWaybill(e.target.value)}
            onBlur={() => saveField("waybill", waybill, order.waybill, setWaybill)}
            onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
            placeholder="أدخل رقم البوليصة"
            maxLength={60}
            dir="ltr"
            className="pp-input text-right"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-muted">
          اسم المقفل
          <input
            value={closer}
            onChange={(e) => setCloser(e.target.value)}
            onBlur={() => saveField("closerName", closer, order.closerName, setCloser)}
            onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
            placeholder="من أغلق الأوردر؟"
            maxLength={80}
            list={`closers-${order.id}`}
            className="pp-input"
          />
          <datalist id={`closers-${order.id}`}>
            {closers.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
        </label>
      </div>

      {/* المنتجات بمحتوياتها */}
      <ul className="flex flex-col gap-2">
        {order.lines.map((line) => (
          <li key={line.id} className="rounded-control border border-border/60 p-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-bold text-text">{line.productName}</span>
              {editable ? (
                <div className="task-stepper" role="group" aria-label={`عدد ${line.productName}`}>
                  <button type="button" className="task-stepper-btn" disabled={busy || line.quantity <= 1} onClick={() => void act(() => onSetLineQty(order, line.id, line.quantity - 1))} aria-label="إنقاص">
                    <Minus size={14} />
                  </button>
                  <span dir="ltr" className="min-w-8 px-1 text-center font-mono text-sm font-bold tabular-nums text-text">
                    {line.quantity}
                  </span>
                  <button type="button" className="task-stepper-btn" disabled={busy || line.quantity >= 1000} onClick={() => void act(() => onSetLineQty(order, line.id, line.quantity + 1))} aria-label="زيادة">
                    <Plus size={14} />
                  </button>
                </div>
              ) : (
                <span className="rounded-full border border-border px-2 py-0.5 text-xs font-bold text-text">× {line.quantity}</span>
              )}
              <span className="mr-auto text-xs text-muted">
                {fmtMoney(line.totalCost)} ← <strong className="text-text">{fmtMoney(line.totalSell)}</strong>
              </span>
              {editable && order.lines.length > 1 && (
                <button type="button" disabled={busy} onClick={() => void act(() => onRemoveLine(order, line.id))} aria-label={`إزالة ${line.productName}`} title="إزالة المنتج من الأوردر" className="task-icon-btn task-icon-btn--danger !h-7 !w-7">
                  <Trash2 size={13} />
                </button>
              )}
            </div>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {line.components.map((c) => {
                const short = !order.stockDeducted && shortItems.has(c.itemId);
                return (
                  <span
                    key={c.id}
                    className={`rounded-full border px-2 py-0.5 text-[11px] ${short ? "border-problem/50 text-problem" : "border-border text-muted"}`}
                    title={order.stockDeducted ? undefined : `المتاح في المخزون: ${fmtQty(c.available)} ${c.unit}`}
                  >
                    {c.itemName} × {fmtQty(c.quantity * line.quantity)}
                  </span>
                );
              })}
            </div>
          </li>
        ))}
      </ul>

      {/* إضافة منتج ثابت لنفس الأوردر (قبل التنفيذ فقط) */}
      {editable && activeProducts.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs text-muted">أضف للأوردر:</span>
          {activeProducts.map((p) => (
            <button key={p.id} type="button" disabled={busy} onClick={() => void act(() => onAddLine(order, p.id))} className="task-btn task-btn--secondary !px-2.5 !py-1 !text-xs">
              <Plus size={12} /> {p.name}
            </button>
          ))}
        </div>
      )}

      {/* تحذيرات قبل التنفيذ */}
      {order.shortages.length > 0 && (
        <div className="flex items-start gap-2 rounded-control border border-problem/40 px-3 py-2 text-xs text-problem" role="alert">
          <AlertTriangle size={14} className="mt-0.5 shrink-0" />
          <span>
            المخزون لا يكفي لتنفيذ هذا الأوردر:{" "}
            {order.shortages.map((s) => `${s.itemName} (المطلوب ${fmtQty(s.needed)} والمتاح ${fmtQty(s.available)} ${s.unit})`).join("، ")}
          </span>
        </div>
      )}
      {order.archivedItems.length > 0 && (
        <div className="flex items-start gap-2 rounded-control border border-problem/40 px-3 py-2 text-xs text-problem" role="alert">
          <AlertTriangle size={14} className="mt-0.5 shrink-0" />
          <span>مكونات مؤرشفة في المخزون: {order.archivedItems.join("، ")}. استعدها أو عدّل المنتج قبل التنفيذ.</span>
        </div>
      )}

      {/* التكلفة وسعر البيع والربح (تُحسب تلقائياً من المخزون) */}
      <div className="grid grid-cols-3 gap-2 rounded-control border border-border/60 px-3 py-2.5 text-center">
        <div>
          <span className="block text-[11px] text-muted">سعر التكلفة</span>
          <span className="text-sm font-bold text-text">{fmtMoney(order.costTotal)}</span>
        </div>
        <div>
          <span className="block text-[11px] text-muted">سعر البيع</span>
          <span className="text-sm font-bold text-primary-deep">{fmtMoney(order.sellTotal)}</span>
        </div>
        <div>
          <span className="block text-[11px] text-muted">الربح</span>
          <span className={`text-sm font-bold ${profitNegative ? "text-problem" : "text-text"}`}>{fmtMoney(order.profit)}</span>
        </div>
      </div>

      {/* ملاحظات */}
      <input
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        onBlur={() => saveField("notes", notes, order.notes, setNotes)}
        onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
        placeholder="ملاحظات (اختياري)"
        maxLength={1000}
        aria-label="ملاحظات الأوردر"
        className="pp-input !h-9 text-xs"
      />

      {/* الحالة */}
      <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="حالة الأوردر">
        {SALES_STATUS_ORDER.map((s) => {
          const m = SALES_STATUS_META[s];
          const active = s === order.status;
          return (
            <button
              key={s}
              type="button"
              disabled={busy}
              aria-pressed={active}
              title={m.hint}
              onClick={() => !active && void act(() => onStatus(order, s))}
              className="inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-xs font-semibold transition-colors disabled:opacity-60"
              style={
                active
                  ? { backgroundColor: `${m.color}22`, color: m.color, border: `1px solid ${m.color}99` }
                  : { border: "1px solid var(--border)", color: "var(--muted)" }
              }
            >
              {active && <Check size={12} />}
              {m.label}
            </button>
          );
        })}
      </div>
    </article>
  );
}
