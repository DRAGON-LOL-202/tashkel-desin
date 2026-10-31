import { useState, type FormEvent } from "react";
import { FileSpreadsheet } from "lucide-react";
import { Modal } from "../ui/Modal";
import { Button } from "../ui/Button";
import { FieldWrap, Input, Select } from "../ui/Field";
import { useToast } from "../ui/ToastProvider";
import { errorMessage } from "../../lib/api";
import { exportInventoryReport, type InventoryReportType } from "../../lib/exportInventory";
import { inventoryService } from "../../services/inventoryService";
import type { InventoryCategory, InventoryItem, InventoryMovementType } from "../../types";

interface ReportsModalProps {
  open: boolean;
  onClose: () => void;
  items: InventoryItem[];
  categories: InventoryCategory[];
  defaultReportType?: InventoryReportType;
}

const REPORT_OPTIONS: Array<{ value: InventoryReportType; label: string; isMovementReport: boolean }> = [
  { value: "all_items", label: "1. تقرير جميع المنتجات", isMovementReport: false },
  { value: "valuation", label: "2. تقرير قيمة المخزون بالجنيه", isMovementReport: false },
  { value: "shortages", label: "3. تقرير نواقص المخزون", isMovementReport: false },
  { value: "in_movements", label: "4. تقرير الوارد خلال فترة", isMovementReport: true },
  { value: "out_movements", label: "5. تقرير السحب خلال فترة", isMovementReport: true },
  { value: "item_movements", label: "6. تقرير حركات منتج محدد", isMovementReport: true },
  { value: "adjustments", label: "7. تقرير الجرد والتسويات", isMovementReport: true },
  { value: "all_movements", label: "8. تقرير شامل لحركات المخزون", isMovementReport: true },
];

export function ReportsModal({ open, onClose, items, categories, defaultReportType = "all_items" }: ReportsModalProps) {
  const [reportType, setReportType] = useState<InventoryReportType>(defaultReportType);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [categoryId, setCategoryId] = useState("all");
  const [itemId, setItemId] = useState("all");
  const [movementType, setMovementType] = useState<InventoryMovementType | "ALL">("ALL");
  const [exporting, setExporting] = useState(false);
  const { show } = useToast();

  const currentMeta = REPORT_OPTIONS.find((r) => r.value === reportType) ?? REPORT_OPTIONS[0];
  const filteredItemsForSelect =
    categoryId === "all" ? items : items.filter((i) => i.categoryId === categoryId);

  const handleExport = async (e: FormEvent) => {
    e.preventDefault();
    if (exporting) return;
    if (reportType === "item_movements" && (itemId === "all" || !itemId)) {
      show("يرجى اختيار المنتج المطلوب لتقرير حركات منتج محدد", "error");
      return;
    }

    setExporting(true);
    try {
      let effectiveType: InventoryMovementType | undefined;
      if (reportType === "in_movements") effectiveType = "IN";
      else if (reportType === "out_movements") effectiveType = "OUT";
      else if (reportType === "adjustments") effectiveType = "ADJUST";
      else if (movementType !== "ALL") effectiveType = movementType;

      const movements = currentMeta.isMovementReport
        ? await inventoryService.queryMovements({
            from: from || undefined,
            to: to || undefined,
            categoryId: categoryId !== "all" ? categoryId : undefined,
            itemId: itemId !== "all" ? itemId : undefined,
            type: effectiveType,
            limit: 2000,
          })
        : [];

      const catObj = categories.find((c) => c.id === categoryId);
      const itemObj = items.find((i) => i.id === itemId);

      exportInventoryReport(
        {
          reportType,
          from: from || undefined,
          to: to || undefined,
          categoryId,
          categoryName: catObj?.name,
          itemId,
          itemName: itemObj?.name,
          movementType: effectiveType ?? "ALL",
        },
        items,
        movements
      );
      show("تم تصدير ملف Excel بنجاح");
      onClose();
    } catch (err) {
      show(errorMessage(err), "error");
    } finally {
      setExporting(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="تصدير تقارير المخزون إلى Excel"
      description="تقارير عربية منظمة ودقيقة مالياً من قاعدة البيانات الحقيقية"
      size="lg"
    >
      <form onSubmit={(e) => void handleExport(e)} className="flex flex-col gap-3">
        <FieldWrap label="نوع التقرير المطلوب" htmlFor="rep-type">
          <Select id="rep-type" value={reportType} onChange={(e) => setReportType(e.target.value as InventoryReportType)}>
            {REPORT_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </Select>
        </FieldWrap>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <FieldWrap label="التصنيف" htmlFor="rep-cat">
            <Select
              id="rep-cat"
              value={categoryId}
              onChange={(e) => {
                setCategoryId(e.target.value);
                setItemId("all");
              }}
            >
              <option value="all">جميع التصنيفات</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </FieldWrap>

          <FieldWrap label={reportType === "item_movements" ? "المنتج (مطلوب)" : "المنتج"} htmlFor="rep-item">
            <Select id="rep-item" value={itemId} onChange={(e) => setItemId(e.target.value)}>
              <option value="all">{reportType === "item_movements" ? "اختر المنتج..." : "جميع المنتجات"}</option>
              {filteredItemsForSelect.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.name} {i.sku ? `(${i.sku})` : ""}
                </option>
              ))}
            </Select>
          </FieldWrap>
        </div>

        {currentMeta.isMovementReport && (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <FieldWrap label="من تاريخ" htmlFor="rep-from">
              <Input id="rep-from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} dir="ltr" />
            </FieldWrap>

            <FieldWrap label="إلى تاريخ" htmlFor="rep-to">
              <Input id="rep-to" type="date" value={to} onChange={(e) => setTo(e.target.value)} dir="ltr" />
            </FieldWrap>

            {(reportType === "item_movements" || reportType === "all_movements") && (
              <FieldWrap label="نوع الحركة" htmlFor="rep-mv-type">
                <Select
                  id="rep-mv-type"
                  value={movementType}
                  onChange={(e) => setMovementType(e.target.value as InventoryMovementType | "ALL")}
                >
                  <option value="ALL">كل الحركات</option>
                  <option value="IN">الوارد (IN)</option>
                  <option value="OUT">السحب (OUT)</option>
                  <option value="ADJUST">الجرد والتسويات (ADJUST)</option>
                  <option value="RETURN">المرتجعات (RETURN)</option>
                </Select>
              </FieldWrap>
            )}
          </div>
        )}

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            إلغاء
          </Button>
          <Button type="submit" disabled={exporting} icon={<FileSpreadsheet size={16} />}>
            {exporting ? "جارٍ تجهيز الملف..." : "تصدير إلى Excel (.xlsx)"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
