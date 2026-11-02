import { useState } from "react";
import {
  AlertTriangle,
  Archive,
  ArchiveRestore,
  ArrowDownToLine,
  ArrowUpFromLine,
  ClipboardCheck,
  History,
  Package,
  Pencil,
  RotateCcw,
} from "lucide-react";
import { Modal } from "../ui/Modal";
import { Badge } from "../ui/Badge";
import { Button } from "../ui/Button";
import { AttachmentImage, ImageAttachmentGallery } from "../ui/ImageAttachments";
import { STATUS_META, fmtMoney, fmtQty } from "./format";
import type { InventoryItem } from "../../types";

interface ItemDetailsModalProps {
  open: boolean;
  onClose: () => void;
  item: InventoryItem;
  canManage: boolean;
  onEdit: (item: InventoryItem) => void;
  onIn: (item: InventoryItem) => void;
  onOut: (item: InventoryItem) => void;
  onStocktake: (item: InventoryItem) => void;
  onReturn: (item: InventoryItem) => void;
  onHistory: (item: InventoryItem) => void;
  onToggleArchive: (item: InventoryItem) => void;
}

export function ItemDetailsModal({
  open,
  onClose,
  item,
  canManage,
  onEdit,
  onIn,
  onOut,
  onStocktake,
  onReturn,
  onHistory,
  onToggleArchive,
}: ItemDetailsModalProps) {
  const [selectedImgIdx, setSelectedImgIdx] = useState(0);
  const statusMeta = STATUS_META[item.status] ?? STATUS_META.AVAILABLE;
  const activeImg = item.attachments[selectedImgIdx] ?? item.attachments[0];

  return (
    <Modal open={open} onClose={onClose} title="تفاصيل منتج المخزون" description={item.name} size="lg">
      <div className="flex flex-col gap-5">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-5">
          {/* صورة أكبر أو صورة افتراضية */}
          <div className="flex flex-col gap-2 md:col-span-2">
            <div className="flex h-56 w-full items-center justify-center overflow-hidden rounded-card border border-border bg-background">
              {activeImg ? (
                <AttachmentImage attachment={activeImg} className="h-full w-full object-contain" />
              ) : (
                <div className="flex flex-col items-center gap-2 text-muted">
                  <Package size={48} className="opacity-40" />
                  <span className="text-xs">لا توجد صورة للمنتج</span>
                </div>
              )}
            </div>
            {item.attachments.length > 1 && (
              <div className="flex flex-wrap gap-1.5">
                {item.attachments.map((att, idx) => (
                  <button
                    key={att.id}
                    type="button"
                    onClick={() => setSelectedImgIdx(idx)}
                    className={`h-12 w-12 overflow-hidden rounded-control border transition-all ${
                      idx === selectedImgIdx ? "border-primary-deep ring-2 ring-primary/40" : "border-border opacity-70 hover:opacity-100"
                    }`}
                  >
                    <AttachmentImage attachment={att} className="h-full w-full object-cover" />
                  </button>
                ))}
              </div>
            )}
            {item.attachments.length > 0 && (
              <div className="mt-1">
                <ImageAttachmentGallery attachments={item.attachments} />
              </div>
            )}
          </div>

          {/* البيانات التفصيلية */}
          <div className="flex flex-col gap-3 md:col-span-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="text-lg font-bold text-text">{item.name}</h3>
                <p className="text-xs text-muted" dir="ltr">
                  {item.sku ? `الكود: ${item.sku}` : "بدون كود"}
                </p>
              </div>
              <div className="flex items-center gap-2">
                {!item.isActive ? (
                  <Badge>مؤرشف</Badge>
                ) : (
                  <Badge color={statusMeta.color}>
                    {item.status !== "AVAILABLE" && <AlertTriangle size={12} />} {statusMeta.label}
                  </Badge>
                )}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2.5 rounded-control border border-border bg-background/50 p-3.5 text-sm">
              <div>
                <span className="block text-xs text-muted">التصنيف</span>
                <span className="font-semibold text-text">{item.categoryName}</span>
              </div>
              <div>
                <span className="block text-xs text-muted">وحدة القياس</span>
                <span className="font-semibold text-text">{item.unit}</span>
              </div>
              <div>
                <span className="block text-xs text-muted">الكمية الحالية</span>
                <span className="text-base font-bold text-text">
                  {fmtQty(item.quantity)} <span className="text-xs font-normal text-muted">{item.unit}</span>
                </span>
              </div>
              <div>
                <span className="block text-xs text-muted">الحد الأدنى للتنبيه</span>
                <span className="font-semibold text-text">
                  {fmtQty(item.minQuantity)} {item.unit}
                </span>
              </div>
              <div>
                <span className="block text-xs text-muted">سعر الوحدة</span>
                <span className="font-semibold text-text">{fmtMoney(item.unitPrice)}</span>
              </div>
              <div>
                <span className="block text-xs text-muted">سعر البيع</span>
                <span className="font-semibold text-text">{fmtMoney(item.sellPrice ?? 0)}</span>
              </div>
              <div>
                <span className="block text-xs text-muted">إجمالي القيمة</span>
                <span className="text-base font-bold text-primary-deep">{fmtMoney(item.totalValue)}</span>
              </div>
            </div>

            {item.isShortage && item.isActive && (
              <div className="flex items-center justify-between rounded-control border border-problem/35 bg-problem/10 px-3.5 py-2.5 text-xs">
                <span className="text-text">
                  الكمية المقترحة لإعادة الطلب:{" "}
                  <strong className="text-problem">
                    {fmtQty(item.suggestedReorderQty)} {item.unit}
                  </strong>
                </span>
                <span className="text-muted">
                  بتكلفة تقديرية: <strong>{fmtMoney(item.suggestedReorderQty * item.unitPrice)}</strong>
                </span>
              </div>
            )}

            {item.notes && (
              <div className="rounded-control border border-border bg-background/40 p-3 text-sm">
                <span className="mb-1 block text-xs font-medium text-muted">ملاحظات</span>
                <p className="whitespace-pre-wrap text-text">{item.notes}</p>
              </div>
            )}

            <div className="text-[11px] text-muted">
              تاريخ الإضافة: {new Date(item.createdAt).toLocaleString("ar-EG")} · آخر تحديث:{" "}
              {new Date(item.updatedAt).toLocaleString("ar-EG")}
            </div>
          </div>
        </div>

        {/* أزرار الإجراءات السريعة */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-4">
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              variant="secondary"
              icon={<History size={15} />}
              onClick={() => {
                onClose();
                onHistory(item);
              }}
            >
              سجل الحركات
            </Button>
            {canManage && item.isActive && (
              <>
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  icon={<ArrowDownToLine size={15} />}
                  onClick={() => {
                    onClose();
                    onIn(item);
                  }}
                >
                  إضافة وارد
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  icon={<ArrowUpFromLine size={15} />}
                  onClick={() => {
                    onClose();
                    onOut(item);
                  }}
                >
                  سحب
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  icon={<ClipboardCheck size={15} />}
                  onClick={() => {
                    onClose();
                    onStocktake(item);
                  }}
                >
                  جرد
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  icon={<RotateCcw size={15} />}
                  onClick={() => {
                    onClose();
                    onReturn(item);
                  }}
                >
                  مرتجع
                </Button>
              </>
            )}
            {canManage && (
              <>
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  icon={<Pencil size={15} />}
                  onClick={() => {
                    onClose();
                    onEdit(item);
                  }}
                >
                  تعديل
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  icon={item.isActive ? <Archive size={15} /> : <ArchiveRestore size={15} />}
                  onClick={() => {
                    onClose();
                    onToggleArchive(item);
                  }}
                >
                  {item.isActive ? "أرشفة" : "إلغاء الأرشفة"}
                </Button>
              </>
            )}
          </div>
          <Button type="button" size="sm" variant="secondary" onClick={onClose}>
            إغلاق
          </Button>
        </div>
      </div>
    </Modal>
  );
}
