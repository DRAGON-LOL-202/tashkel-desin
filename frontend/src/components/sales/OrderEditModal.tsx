import { Minus, Plus, Trash2 } from "lucide-react";
import type { InventoryItem, SalesOrder, SalesProduct } from "../../types";
import { fmtMoney } from "../inventory/format";
import { Button } from "../ui/Button";
import { Modal } from "../ui/Modal";
import { OrderComponentsEditor } from "./OrderComponentsEditor";

interface OrderEditModalProps {
  open: boolean;
  onClose: () => void;
  /** يُمرَّر الأوردر الحيّ من الأب فتتحدّث الأرقام بعد كل تعديل */
  order: SalesOrder;
  products: SalesProduct[];
  items: InventoryItem[];
  busy: boolean;
  hideMoney?: boolean;
  act: (fn: () => Promise<unknown>) => Promise<void>;
  onAddLine: (order: SalesOrder, productId: string) => Promise<void>;
  onSetLineQty: (order: SalesOrder, lineId: string, quantity: number) => Promise<void>;
  onRemoveLine: (order: SalesOrder, lineId: string) => Promise<void>;
  onAddComponent: (order: SalesOrder, lineId: string, itemId: string) => Promise<void>;
  onSetComponentQty: (order: SalesOrder, lineId: string, componentId: string, quantity: number) => Promise<void>;
  onRemoveComponent: (order: SalesOrder, lineId: string, componentId: string) => Promise<void>;
}

// قائمة تعديل الأوردر (قبل التنفيذ): عدد كل منتج، مكوناته (كمية/حذف/إضافة)، وإضافة منتج، لهذا الأوردر فقط.
export function OrderEditModal({ open, onClose, order, products, items, busy, hideMoney, act, onAddLine, onSetLineQty, onRemoveLine, onAddComponent, onSetComponentQty, onRemoveComponent }: OrderEditModalProps) {
  const activeProducts = products.filter((p) => p.isActive && p.components.length > 0);
  const shortItems = new Set(order.shortages.map((s) => s.itemId));

  return (
    <Modal open={open} onClose={onClose} title="تعديل الأوردر" description="التعديل يخص هذا الأوردر فقط ولا يغيّر المنتج الثابت" size="lg">
      <div className="flex max-h-[65vh] flex-col gap-3 overflow-y-auto pe-1">
        {order.lines.map((line) => (
          <section key={line.id} className="rounded-control border border-border/60 p-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-bold text-text">{line.productName}</span>
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
              {hideMoney ? (
                <span className="mr-auto" />
              ) : (
                <span className="mr-auto text-xs text-muted">
                  {fmtMoney(line.totalCost ?? 0)} ← <strong className="text-text">{fmtMoney(line.totalSell ?? 0)}</strong>
                </span>
              )}
              {order.lines.length > 1 && (
                <button type="button" disabled={busy} onClick={() => void act(() => onRemoveLine(order, line.id))} aria-label={`إزالة ${line.productName}`} title="إزالة المنتج من الأوردر" className="task-icon-btn task-icon-btn--danger !h-7 !w-7">
                  <Trash2 size={13} />
                </button>
              )}
            </div>
            <OrderComponentsEditor
              line={line}
              items={items}
              busy={busy}
              shortItems={shortItems}
              onSetQty={(componentId, q) => act(() => onSetComponentQty(order, line.id, componentId, q))}
              onRemove={(componentId) => act(() => onRemoveComponent(order, line.id, componentId))}
              onAdd={(itemId) => act(() => onAddComponent(order, line.id, itemId))}
            />
          </section>
        ))}

        {activeProducts.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-xs text-muted">أضف للأوردر:</span>
            {activeProducts.map((p) => (
              <button key={p.id} type="button" disabled={busy} onClick={() => void act(() => onAddLine(order, p.id))} className="task-btn task-btn--secondary !px-2.5 !py-1 !text-xs">
                <Plus size={12} /> {p.name}
              </button>
            ))}
          </div>
        )}

        {!hideMoney && (
        <div className="grid grid-cols-3 rounded-xl border border-border bg-background/50 py-1.5 text-center text-xs">
          <div><span className="text-muted">التكلفة</span><div className="text-sm font-extrabold text-text">{fmtMoney(order.costTotal ?? 0)}</div></div>
          <div className="border-s border-border"><span className="text-muted">سعر البيع</span><div className="text-sm font-extrabold text-[#1E8E5A]">{fmtMoney(order.sellTotal ?? 0)}</div></div>
          <div className="border-s border-border"><span className="text-muted">الربح</span><div className={`text-sm font-extrabold ${(order.profit ?? 0) < 0 ? "text-[#D64545]" : "text-[#1E8E5A]"}`}>{fmtMoney(order.profit ?? 0)}</div></div>
        </div>
        )}
      </div>
      <div className="mt-4 flex justify-end">
        <Button type="button" onClick={onClose}>
          تم
        </Button>
      </div>
    </Modal>
  );
}
