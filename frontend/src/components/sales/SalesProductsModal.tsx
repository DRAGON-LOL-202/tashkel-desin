import { Archive, ArchiveRestore, Pencil, Plus, Trash2 } from "lucide-react";
import type { SalesProduct } from "../../types";
import { fmtMoney, fmtQty } from "../inventory/format";
import { Modal } from "../ui/Modal";
import { Button } from "../ui/Button";
import { Badge } from "../ui/Badge";

interface SalesProductsModalProps {
  open: boolean;
  onClose: () => void;
  products: SalesProduct[];
  onCreate: () => void;
  onEdit: (product: SalesProduct) => void;
  onToggleActive: (product: SalesProduct) => void;
  onDelete: (product: SalesProduct) => void;
  /** صفحة الأوردرات: بدون تكلفة وسعر بيع */
  hideMoney?: boolean;
}

// إدارة المنتجات الثابتة (البوكسات): عرض محتوياتها وأسعارها، وتعديلها وإيقافها وحذفها.
export function SalesProductsModal({ open, onClose, products, onCreate, onEdit, onToggleActive, onDelete, hideMoney }: SalesProductsModalProps) {
  return (
    <Modal open={open} onClose={onClose} title="المنتجات الثابتة" description="بوكسات بمحتويات ثابتة من المخزون؛ اضغط على أي منها عند إضافة أوردر" size="xl">
      <div className="mb-3 flex justify-end">
        <Button size="sm" icon={<Plus size={14} />} onClick={onCreate}>
          منتج ثابت جديد
        </Button>
      </div>
      {products.length === 0 ? (
        <p className="rounded-control border border-border px-3 py-8 text-center text-sm text-muted">لم تُضف منتجات ثابتة بعد.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {products.map((p) => (
            <li key={p.id} className={`rounded-control border border-border/70 p-3 ${p.isActive ? "" : "opacity-60"}`}>
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-bold text-text">{p.name}</span>
                {!p.isActive && <Badge>موقوف</Badge>}
                {hideMoney ? (
                  <span className="mr-auto" />
                ) : (
                  <span className="mr-auto text-xs text-muted">
                    التكلفة <strong className="text-text">{fmtMoney(p.costPerUnit)}</strong> · البيع <strong className="text-primary-deep">{fmtMoney(p.sellPerUnit)}</strong>
                  </span>
                )}
                <button type="button" onClick={() => onEdit(p)} aria-label={`تعديل ${p.name}`} title="تعديل" className="task-icon-btn">
                  <Pencil size={15} />
                </button>
                <button type="button" onClick={() => onToggleActive(p)} aria-label={p.isActive ? `إيقاف ${p.name}` : `تفعيل ${p.name}`} title={p.isActive ? "إيقاف (يختفي من الإضافة السريعة)" : "تفعيل"} className="task-icon-btn">
                  {p.isActive ? <Archive size={15} /> : <ArchiveRestore size={15} />}
                </button>
                <button type="button" onClick={() => onDelete(p)} aria-label={`حذف ${p.name}`} title="حذف" className="task-icon-btn task-icon-btn--danger">
                  <Trash2 size={15} />
                </button>
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {p.components.map((c) => (
                  <span key={c.id} className={`rounded-full border px-2 py-0.5 text-[11px] ${c.itemActive ? "border-border text-muted" : "border-problem/50 text-problem"}`} title={c.itemActive ? undefined : "مؤرشف في المخزون"}>
                    {c.itemName} × {fmtQty(c.quantity)}
                  </span>
                ))}
              </div>
            </li>
          ))}
        </ul>
      )}
    </Modal>
  );
}
