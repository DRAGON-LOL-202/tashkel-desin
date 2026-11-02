import { useState } from "react";
import { AlertTriangle, Calendar, CalendarDays, ChevronDown, CircleHelp, Coins, Eye, LayoutGrid, Minus, PackageCheck, Pencil, Play, Plus, RefreshCw, ScanBarcode, Tag, Trash2, TrendingDown, TrendingUp, Undo2, User } from "lucide-react";
import type { ReactNode } from "react";
import type { InventoryItem, SalesOrder, SalesOrderPatch, SalesOrderStatus, SalesProduct } from "../../types";
import { fmtMoney, fmtQty } from "../inventory/format";
import { formatArabicDate } from "../../lib/date";
import { OrderComponentsEditor } from "./OrderComponentsEditor";
import { MoveOrderModal } from "./MoveOrderModal";
import { OrderEditModal } from "./OrderEditModal";
import { ReturnOrderModal } from "./ReturnOrderModal";
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
  /** مرتجع مع تحديد المكونات التالفة (لأوردر خُصمت مكوناته) */
  onReturn: (order: SalesOrder, damagedComponentIds: string[]) => Promise<boolean>;
  /** نقل الأوردر إلى يوم آخر؛ يرجع true عند النجاح */
  onMove: (order: SalesOrder, date: string) => Promise<boolean>;
  onDelete: (order: SalesOrder) => void;
  onAddLine: (order: SalesOrder, productId: string) => Promise<void>;
  onSetLineQty: (order: SalesOrder, lineId: string, quantity: number) => Promise<void>;
  onRemoveLine: (order: SalesOrder, lineId: string) => Promise<void>;
  /** أصناف المخزون المفعّلة (لإضافة مكوّن لأوردر واحد) */
  items: InventoryItem[];
  /** تعديل مكوّنات هذا الأوردر فقط (قبل التنفيذ) */
  onAddComponent: (order: SalesOrder, lineId: string, itemId: string) => Promise<void>;
  onSetComponentQty: (order: SalesOrder, lineId: string, componentId: string, quantity: number) => Promise<void>;
  onRemoveComponent: (order: SalesOrder, lineId: string, componentId: string) => Promise<void>;
}

// أيقونة كل حالة على زر الحالة
const STATUS_ICON: Record<SalesOrderStatus, ReactNode> = {
  REGISTERED: <Play size={13} className="fill-current" />,
  EXECUTED: <ScanBarcode size={15} />,
  SHIPPED: <RefreshCw size={14} />,
  DELIVERED: <Eye size={15} />,
  RETURNED: <Undo2 size={15} />,
};

const GREEN_FILL = "linear-gradient(180deg, #0f7a45 0%, #0a5a33 100%)";
const GREEN_SHADOW = "0 10px 18px -10px rgba(10, 90, 51, 0.7)";
// أقصى عدد لشرائح المكونات في الشريط المختصر قبل «عرض الكل»
const PREVIEW_CHIPS = 3;

// كرت أوردر: رقم وحالة ومن أضافه، ثم رقم البوليصة والمقفل، شريط المنتجات، التكلفة وسعر البيع والربح، وأزرار الحالة.
export function SalesOrderCard({ order, index, showDate, products, closers, onPatch, onStatus, onReturn, onMove, onDelete, onAddLine, onSetLineQty, onRemoveLine, items, onAddComponent, onSetComponentQty, onRemoveComponent }: SalesOrderCardProps) {
  const meta = SALES_STATUS_META[order.status];
  const [waybill, setWaybill] = useState(order.waybill);
  const [closer, setCloser] = useState(order.closerName);
  const [notes, setNotes] = useState(order.notes);
  const [busy, setBusy] = useState(false);
  const [returning, setReturning] = useState(false); // نافذة المرتجع وتحديد التالف
  const [moving, setMoving] = useState(false); // نافذة نقل الأوردر ليوم آخر
  const [editing, setEditing] = useState(false); // قائمة تعديل الأوردر
  const [showAll, setShowAll] = useState(false); // تفاصيل كل المنتجات ومكوناتها
  const [more, setMore] = useState(order.notes !== ""); // الملاحظات والحذف

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

  // شرائح المكونات المجمّعة من كل البنود (للشريط المختصر)
  const allChips = order.lines.flatMap((line) => line.components.map((c) => ({ key: `${line.id}-${c.id}`, name: c.itemName, qty: c.quantity * line.quantity, damaged: c.damaged })));
  const previewChips = allChips.slice(0, PREVIEW_CHIPS);

  return (
    <article
      className="pp-card relative flex flex-col gap-2 !rounded-2xl p-3"
      style={{ borderInlineEnd: `4px solid ${meta.color}` }}
      data-status={order.status}
      aria-label={`أوردر ${index}`}
    >
      {/* الصف العلوي: الرقم + الحالة ... من أضافه */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="flex h-8 min-w-8 items-center justify-center rounded-full border border-border bg-background/60 px-2 text-sm font-bold text-text">{index}</span>
        <span
          className="inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-sm font-bold"
          style={{ backgroundColor: `${meta.color}1F`, color: meta.color, border: `1px solid ${meta.color}55` }}
        >
          {meta.label}
          <span className="h-2 w-2 rounded-full" style={{ backgroundColor: meta.color }} aria-hidden />
        </span>
        {order.stockDeducted && (
          <span className="flex items-center gap-1 text-xs font-medium text-primary-deep">
            <PackageCheck size={14} /> خُصم من المخزون
          </span>
        )}
        <span className="me-auto" />
        {showDate && (
          <span className="inline-flex h-8 items-center gap-1.5 rounded-full border border-border bg-background/60 px-2.5 text-xs font-medium text-muted">
            <Calendar size={16} className="text-primary-deep" />
            {formatArabicDate(order.date, "d MMMM yyyy")}
          </span>
        )}
        <button
          type="button"
          onClick={() => setMoving(true)}
          title="نقل الأوردر إلى يوم آخر"
          className="inline-flex h-8 items-center gap-1.5 rounded-full border border-border bg-background/60 px-3 text-xs font-semibold text-text transition-colors hover:border-primary-deep"
        >
          <CalendarDays size={16} className="text-primary-deep" />
          نقل ليوم
        </button>
        <span className="inline-flex h-8 items-center gap-1.5 rounded-full border border-border bg-background/60 px-3 text-xs font-medium text-text">
          <User size={16} className="text-[#2a3f7a]" />
          أضافه: {order.createdByName}
        </span>
      </div>

      {/* رقم البوليصة واسم المقفل */}
      <div className="grid grid-cols-2">
        <label className="flex min-w-0 flex-col pe-3">
          <span className="flex items-center gap-1.5 text-xs font-medium text-muted">
            <Calendar size={16} className="text-primary-deep" /> رقم البوليصة
          </span>
          <input
            value={waybill}
            onChange={(e) => setWaybill(e.target.value)}
            onBlur={() => saveField("waybill", waybill, order.waybill, setWaybill)}
            onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
            placeholder="أدخل رقم البوليصة"
            maxLength={60}
            className="w-full min-w-0 bg-transparent text-sm font-bold text-text outline-none placeholder:text-text/70"
          />
        </label>
        <label className="flex min-w-0 flex-col border-s border-border ps-3">
          <span className="flex items-center gap-1.5 text-xs font-medium text-muted">
            <CircleHelp size={16} className="text-text" /> اسم المُقفل
          </span>
          <input
            value={closer}
            onChange={(e) => setCloser(e.target.value)}
            onBlur={() => saveField("closerName", closer, order.closerName, setCloser)}
            onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
            placeholder="من أغلق الأوردر؟"
            maxLength={80}
            list={`closers-${order.id}`}
            className="w-full min-w-0 bg-transparent text-sm font-bold text-text outline-none placeholder:text-text/70"
          />
          <datalist id={`closers-${order.id}`}>
            {closers.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
        </label>
      </div>

      {/* شريط المنتجات: شريحة خضراء لكل منتج + مكوناتها + عرض الكل */}
      <div className="flex flex-wrap items-center gap-1.5 rounded-xl border border-border bg-background/50 p-1.5">
        {order.lines.map((line) => (
          <span key={line.id} className="inline-flex h-9 items-center gap-2 rounded-xl px-3 text-sm font-bold text-white" style={{ background: GREEN_FILL, boxShadow: GREEN_SHADOW }}>
            {line.productName}
            <span dir="ltr" className="text-xs">× {line.quantity}</span>
          </span>
        ))}
        {previewChips.map((c) => (
          <span key={c.key} className={`inline-flex h-7 max-w-[8rem] items-center gap-1 rounded-lg border px-2 text-[11px] font-medium ${c.damaged ? "border-problem/60 bg-problem/10 text-problem" : "border-border bg-surface text-muted"}`} title={`${c.name} × ${fmtQty(c.qty)}`}>
            <span className="truncate">{c.name}</span>
            <span dir="ltr" className="shrink-0 font-bold text-text">× {fmtQty(c.qty)}</span>
          </span>
        ))}
        {editable && (
          <button
            type="button"
            onClick={() => setEditing(true)}
            title="تعديل المنتجات والمكونات"
            className="me-auto inline-flex h-7 items-center gap-1.5 rounded-lg border border-border bg-surface px-3 text-xs font-semibold text-text transition-colors hover:border-primary-deep"
          >
            <Pencil size={14} className="text-primary-deep" />
            تعديل
          </button>
        )}
        <button
          type="button"
          onClick={() => setShowAll((v) => !v)}
          aria-expanded={showAll}
          className={`${editable ? "" : "me-auto "}inline-flex h-7 items-center gap-1.5 rounded-lg border border-border bg-surface px-3 text-xs font-semibold text-text transition-colors hover:border-primary-deep`}
        >
          <LayoutGrid size={14} className="text-primary-deep" />
          {showAll ? "إخفاء" : "عرض الكل"}
          {!showAll && allChips.length > PREVIEW_CHIPS && <span className="text-xs text-muted">(+{allChips.length - PREVIEW_CHIPS})</span>}
        </button>
      </div>

      {/* تفاصيل المنتجات بالمكونات والتعديل (قبل التنفيذ فقط) */}
      {showAll && (
        <div className="flex flex-col gap-2">
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
                {editable ? (
                  <OrderComponentsEditor
                    line={line}
                    items={items}
                    busy={busy}
                    shortItems={shortItems}
                    onSetQty={(componentId, q) => act(() => onSetComponentQty(order, line.id, componentId, q))}
                    onRemove={(componentId) => act(() => onRemoveComponent(order, line.id, componentId))}
                    onAdd={(itemId) => act(() => onAddComponent(order, line.id, itemId))}
                  />
                ) : (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {line.components.map((c) => {
                      const short = !order.stockDeducted && shortItems.has(c.itemId);
                      return (
                        <span
                          key={c.id}
                          className={`rounded-full border px-2 py-0.5 text-[11px] ${short || c.damaged ? "border-problem/50 text-problem" : "border-border text-muted"}`}
                          title={order.stockDeducted ? undefined : `المتاح في المخزون: ${fmtQty(c.available)} ${c.unit}`}
                        >
                          {c.itemName} × {fmtQty(c.quantity * line.quantity)}
                          {c.damaged && " (تالف)"}
                        </span>
                      );
                    })}
                  </div>
                )}
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
      <div className="grid grid-cols-3 rounded-xl border border-border bg-background/50 py-1.5 text-center">
        <div className="flex flex-col items-center">
          <span className="flex items-center gap-1.5 text-xs font-medium text-muted">
            <Coins size={14} className="text-amber-500" /> سعر التكلفة
          </span>
          <span className="text-base font-extrabold text-text">{fmtMoney(order.costTotal)}</span>
        </div>
        <div className="flex flex-col items-center border-s border-border">
          <span className="flex items-center gap-1.5 text-xs font-medium text-muted">
            <Tag size={14} className="fill-[#1E8E5A] text-[#1E8E5A]" /> سعر البيع
          </span>
          <span className="text-base font-extrabold text-[#1E8E5A]">{fmtMoney(order.sellTotal)}</span>
        </div>
        <div className="flex flex-col items-center border-s border-border">
          <span className="flex items-center gap-1.5 text-xs font-medium text-muted">
            {profitNegative ? <TrendingDown size={14} className="text-[#D64545]" /> : <TrendingUp size={14} className="text-[#1E8E5A]" />} الربح
          </span>
          <span className={`text-base font-extrabold ${profitNegative ? "text-[#D64545]" : "text-[#1E8E5A]"}`}>{fmtMoney(order.profit)}</span>
        </div>
      </div>

      {/* الحالة + زر المزيد (ملاحظات / حذف) */}
      <div className="flex flex-wrap items-center gap-1" role="group" aria-label="حالة الأوردر">
        <button
          type="button"
          onClick={() => setMore((v) => !v)}
          aria-expanded={more}
          aria-label="المزيد"
          title="ملاحظات وحذف"
          className="flex h-8 w-8 items-center justify-center rounded-full border border-border bg-background/60 text-text transition-colors hover:border-primary-deep"
        >
          <ChevronDown size={16} className={`transition-transform ${more ? "rotate-180" : ""}`} />
        </button>
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
              onClick={() => {
                if (active) return;
                // مرتجع لأوردر خُصمت مكوناته: تُفتح نافذة المحتويات لتحديد التالف
                if (s === "RETURNED" && order.stockDeducted) setReturning(true);
                else void act(() => onStatus(order, s));
              }}
              className={`inline-flex items-center gap-1.5 rounded-full font-semibold transition-colors disabled:opacity-60 ${
                active ? "me-auto h-8 px-3.5 text-sm font-bold text-white" : "h-8 border border-border bg-background/60 px-2.5 text-xs text-text hover:border-primary-deep"
              }`}
              style={active ? { background: GREEN_FILL, boxShadow: GREEN_SHADOW } : undefined}
            >
              {!active && STATUS_ICON[s]}
              {m.label}
              {active && STATUS_ICON[s]}
            </button>
          );
        })}
      </div>

      {order.status === "RETURNED" && order.damagedTotal > 0 && (
        <div className="flex items-center justify-between gap-2 rounded-xl border border-problem/40 bg-problem/10 px-3 py-1.5 text-xs text-problem" role="status">
          <span className="flex items-center gap-1.5 font-semibold">
            <AlertTriangle size={14} /> تالف في هذا المرتجع
          </span>
          <strong>{fmtMoney(order.damagedTotal)}</strong>
        </div>
      )}

      {moving && <MoveOrderModal open order={order} onClose={() => setMoving(false)} onConfirm={(d) => onMove(order, d)} />}

      {editing && editable && (
        <OrderEditModal
          open
          onClose={() => setEditing(false)}
          order={order}
          products={products}
          items={items}
          busy={busy}
          act={act}
          onAddLine={onAddLine}
          onSetLineQty={onSetLineQty}
          onRemoveLine={onRemoveLine}
          onAddComponent={onAddComponent}
          onSetComponentQty={onSetComponentQty}
          onRemoveComponent={onRemoveComponent}
        />
      )}

      {returning && <ReturnOrderModal open order={order} onClose={() => setReturning(false)} onConfirm={(ids) => onReturn(order, ids)} />}

      {more && (
        <div className="flex flex-wrap items-center gap-2">
          <input
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            onBlur={() => saveField("notes", notes, order.notes, setNotes)}
            onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
            placeholder="ملاحظات (اختياري)"
            maxLength={1000}
            aria-label="ملاحظات الأوردر"
            className="pp-input !h-10 min-w-0 flex-1 text-sm"
          />
          <button type="button" onClick={() => onDelete(order)} disabled={busy} aria-label="حذف الأوردر" title="حذف الأوردر" className="task-icon-btn task-icon-btn--danger">
            <Trash2 size={16} />
          </button>
        </div>
      )}
    </article>
  );
}
