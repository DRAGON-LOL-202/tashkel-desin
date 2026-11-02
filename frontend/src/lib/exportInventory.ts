import { buildXlsx, XLSX_MIME, type XlsxRow, type XlsxSheet } from "./xlsx";
import { MOVEMENT_LABEL, STATUS_META, calcTotalValue, formatBatchCode } from "../components/inventory/format";
import type { InventoryItem, InventoryMovement, InventoryMovementType } from "../types";

export type InventoryReportType =
  | "all_items"
  | "valuation"
  | "shortages"
  | "in_movements"
  | "out_movements"
  | "item_movements"
  | "adjustments"
  | "all_movements";

export interface InventoryReportFilter {
  reportType: InventoryReportType;
  from?: string;
  to?: string;
  categoryId?: string;
  categoryName?: string;
  itemId?: string;
  itemName?: string;
  movementType?: InventoryMovementType | "ALL";
}

function downloadBlob(bytes: Uint8Array<ArrayBuffer>, filename: string) {
  const url = URL.createObjectURL(new Blob([bytes], { type: XLSX_MIME }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

function buildItemsSheet(title: string, sheetTitle: string, items: InventoryItem[], filterSummary: string): XlsxSheet {
  let totalQtyMilli = 0;
  let totalValueCents = 0;

  const headers: XlsxRow = [
    { v: "م", s: "header" },
    { v: "اسم المنتج", s: "header" },
    { v: "الكود", s: "header" },
    { v: "التصنيف", s: "header" },
    { v: "وحدة القياس", s: "header" },
    { v: "الكمية الحالية", s: "header" },
    { v: "الحد الأدنى", s: "header" },
    { v: "سعر الوحدة (ج.م)", s: "header" },
    { v: "سعر البيع (ج.م)", s: "header" },
    { v: "إجمالي القيمة (ج.م)", s: "header" },
    { v: "حالة المخزون", s: "header" },
    { v: "ملاحظات", s: "header" },
  ];

  const dataRows: XlsxRow[] = items.map((i, idx) => {
    const val = i.totalValue ?? calcTotalValue(i.quantity, i.unitPrice);
    totalQtyMilli += Math.round(i.quantity * 1000);
    totalValueCents += Math.round(val * 100);
    const statusLabel = !i.isActive ? "مؤرشف" : (STATUS_META[i.status]?.label ?? "متوفر");
    return [
      { v: idx + 1, s: "center" },
      { v: i.name, s: "boldText" },
      { v: i.sku ?? "—", s: "center" },
      { v: i.categoryName, s: "center" },
      { v: i.unit, s: "center" },
      { v: i.quantity, s: "number" },
      { v: i.minQuantity, s: "number" },
      { v: i.unitPrice, s: "number" },
      { v: i.sellPrice ?? 0, s: "number" },
      { v: val, s: "number" },
      { v: statusLabel, s: "center" },
      { v: i.notes || "—", s: "text" },
    ];
  });

  const totalRow: XlsxRow = [
    { v: "الإجمالي", s: "total" },
    { v: `${items.length} منتج`, s: "total" },
    { v: "", s: "total" },
    { v: "", s: "total" },
    { v: "", s: "total" },
    { v: Math.round(totalQtyMilli) / 1000, s: "totalNumber" },
    { v: "", s: "total" },
    { v: "", s: "total" },
    { v: "", s: "total" },
    { v: Math.round(totalValueCents) / 100, s: "totalNumber" },
    { v: "", s: "total" },
    { v: "", s: "total" },
  ];

  const rows: XlsxRow[] = [
    [{ v: title, s: "title" }, null, null, null, null, null, null, null, null, null, null, null],
    [{ v: filterSummary, s: "center" }, null, null, null, null, null, null, null, null, null, null, null],
    headers,
    ...dataRows,
    totalRow,
  ];

  return {
    name: sheetTitle,
    rtl: true,
    freezeRows: 3,
    merges: ["A1:L1", "A2:L2"],
    autoFilter: `A3:L${Math.max(3, 3 + dataRows.length)}`,
    widths: [6, 28, 16, 18, 12, 15, 14, 16, 16, 18, 14, 28],
    rows,
  };
}

function buildShortagesSheet(items: InventoryItem[], filterSummary: string): XlsxSheet {
  let totalSuggestedCents = 0;

  const headers: XlsxRow = [
    { v: "م", s: "header" },
    { v: "اسم المنتج", s: "header" },
    { v: "الكود", s: "header" },
    { v: "التصنيف", s: "header" },
    { v: "الوحدة", s: "header" },
    { v: "الكمية الحالية", s: "header" },
    { v: "الحد الأدنى", s: "header" },
    { v: "الحالة", s: "header" },
    { v: "الكمية المقترحة للطلب", s: "header" },
    { v: "سعر الوحدة (ج.م)", s: "header" },
    { v: "التكلفة التقديرية للطلب (ج.م)", s: "header" },
  ];

  const dataRows: XlsxRow[] = items.map((i, idx) => {
    const estCost = calcTotalValue(i.suggestedReorderQty, i.unitPrice);
    totalSuggestedCents += Math.round(estCost * 100);
    return [
      { v: idx + 1, s: "center" },
      { v: i.name, s: "boldText" },
      { v: i.sku ?? "—", s: "center" },
      { v: i.categoryName, s: "center" },
      { v: i.unit, s: "center" },
      { v: i.quantity, s: "number" },
      { v: i.minQuantity, s: "number" },
      { v: STATUS_META[i.status]?.label ?? "ناقص", s: "center" },
      { v: i.suggestedReorderQty, s: "number" },
      { v: i.unitPrice, s: "number" },
      { v: estCost, s: "number" },
    ];
  });

  const totalRow: XlsxRow = [
    { v: "الإجمالي", s: "total" },
    { v: `${items.length} منتج ناقص`, s: "total" },
    { v: "", s: "total" },
    { v: "", s: "total" },
    { v: "", s: "total" },
    { v: "", s: "total" },
    { v: "", s: "total" },
    { v: "", s: "total" },
    { v: "", s: "total" },
    { v: "", s: "total" },
    { v: Math.round(totalSuggestedCents) / 100, s: "totalNumber" },
  ];

  return {
    name: "نواقص المخزون",
    rtl: true,
    freezeRows: 3,
    merges: ["A1:K1", "A2:K2"],
    autoFilter: `A3:K${Math.max(3, 3 + dataRows.length)}`,
    widths: [6, 28, 16, 18, 12, 15, 14, 14, 18, 16, 22],
    rows: [
      [{ v: "تقرير نواقص المخزون", s: "title" }, null, null, null, null, null, null, null, null, null, null],
      [{ v: filterSummary, s: "center" }, null, null, null, null, null, null, null, null, null, null],
      headers,
      ...dataRows,
      totalRow,
    ],
  };
}

function buildMovementsSheet(title: string, sheetTitle: string, movements: InventoryMovement[], filterSummary: string): XlsxSheet {
  let totalAbsQtyMilli = 0;
  let totalValueCents = 0;

  const headers: XlsxRow = [
    { v: "م", s: "header" },
    { v: "التاريخ والوقت", s: "header" },
    { v: "نوع الحركة", s: "header" },
    { v: "رقم العملية", s: "header" },
    { v: "اسم المنتج", s: "header" },
    { v: "الكود", s: "header" },
    { v: "التصنيف", s: "header" },
    { v: "الوحدة", s: "header" },
    { v: "الرصيد السابق", s: "header" },
    { v: "الكمية / الفرق", s: "header" },
    { v: "الرصيد الجديد", s: "header" },
    { v: "سعر الوحدة (ج.م)", s: "header" },
    { v: "قيمة الحركة (ج.م)", s: "header" },
    { v: "السبب / المرجع", s: "header" },
    { v: "الملاحظات", s: "header" },
    { v: "المسؤول", s: "header" },
  ];

  const dataRows: XlsxRow[] = movements.map((m, idx) => {
    const val = m.movementValue ?? calcTotalValue(Math.abs(m.delta), m.unitPriceSnapshot);
    totalAbsQtyMilli += Math.round(Math.abs(m.delta) * 1000);
    totalValueCents += Math.round(val * 100);
    const reasonRef = [m.reason, m.referenceId ? `مرجع: ${m.referenceId}` : ""].filter(Boolean).join(" — ") || "—";
    return [
      { v: idx + 1, s: "center" },
      { v: new Date(m.createdAt).toLocaleString("ar-EG"), s: "center" },
      { v: MOVEMENT_LABEL[m.type] ?? m.type, s: "center" },
      { v: m.batchId ? formatBatchCode(m.batchId, m.id) : m.referenceId ?? "—", s: "center" },
      { v: m.itemName, s: "boldText" },
      { v: m.itemSku ?? "—", s: "center" },
      { v: m.categoryName ?? "—", s: "center" },
      { v: m.unit, s: "center" },
      { v: m.previousBalance, s: "number" },
      { v: m.delta, s: "number" },
      { v: m.balanceAfter, s: "number" },
      { v: m.unitPriceSnapshot, s: "number" },
      { v: val, s: "number" },
      { v: reasonRef, s: "text" },
      { v: m.note || "—", s: "text" },
      { v: m.createdByName, s: "center" },
    ];
  });

  const totalRow: XlsxRow = [
    { v: "الإجمالي", s: "total" },
    { v: `${movements.length} حركة`, s: "total" },
    { v: "", s: "total" },
    { v: "", s: "total" },
    { v: "", s: "total" },
    { v: "", s: "total" },
    { v: "", s: "total" },
    { v: "", s: "total" },
    { v: "", s: "total" },
    { v: Math.round(totalAbsQtyMilli) / 1000, s: "totalNumber" },
    { v: "", s: "total" },
    { v: "", s: "total" },
    { v: Math.round(totalValueCents) / 100, s: "totalNumber" },
    { v: "", s: "total" },
    { v: "", s: "total" },
    { v: "", s: "total" },
  ];

  const pad16 = Array.from({ length: 15 }, () => null);
  return {
    name: sheetTitle,
    rtl: true,
    freezeRows: 3,
    merges: ["A1:P1", "A2:P2"],
    autoFilter: `A3:P${Math.max(3, 3 + dataRows.length)}`,
    widths: [6, 20, 14, 15, 24, 14, 16, 11, 14, 14, 14, 15, 16, 22, 24, 16],
    rows: [
      [{ v: title, s: "title" }, ...pad16],
      [{ v: filterSummary, s: "center" }, ...pad16],
      headers,
      ...dataRows,
      totalRow,
    ],
  };
}

export function exportInventoryReport(
  filter: InventoryReportFilter,
  items: InventoryItem[],
  movements: InventoryMovement[]
): void {
  const today = new Date().toISOString().slice(0, 10);
  const summaryParts: string[] = [`تاريخ التصدير: ${new Date().toLocaleDateString("ar-EG")}`];
  if (filter.from || filter.to) summaryParts.push(`الفترة: ${filter.from || "البداية"} إلى ${filter.to || "الآن"}`);
  if (filter.categoryName) summaryParts.push(`التصنيف: ${filter.categoryName}`);
  if (filter.itemName) summaryParts.push(`المنتج: ${filter.itemName}`);
  const summary = summaryParts.join(" | ");

  let filteredItems = items.filter((i) => i.isActive);
  if (filter.categoryId && filter.categoryId !== "all") {
    filteredItems = filteredItems.filter((i) => i.categoryId === filter.categoryId);
  }
  if (filter.itemId && filter.itemId !== "all") {
    filteredItems = filteredItems.filter((i) => i.id === filter.itemId);
  }

  let sheet: XlsxSheet;
  let filename = `تقرير-المخزون-${today}.xlsx`;

  switch (filter.reportType) {
    case "all_items":
      sheet = buildItemsSheet("تقرير جميع منتجات المخزون", "جميع المنتجات", filteredItems, summary);
      filename = `تقرير-جميع-المنتجات-${today}.xlsx`;
      break;
    case "valuation": {
      const sorted = [...filteredItems].sort((a, b) => b.totalValue - a.totalValue);
      sheet = buildItemsSheet("تقرير قيمة المخزون بالجنيه المصري", "قيمة المخزون", sorted, summary);
      filename = `تقرير-قيمة-المخزون-${today}.xlsx`;
      break;
    }
    case "shortages": {
      const shortages = filteredItems.filter((i) => i.isShortage || i.quantity <= i.minQuantity);
      sheet = buildShortagesSheet(shortages, summary);
      filename = `تقرير-نواقص-المخزون-${today}.xlsx`;
      break;
    }
    case "in_movements":
      sheet = buildMovementsSheet("تقرير الوارد خلال فترة", "حركات الوارد", movements, summary);
      filename = `تقرير-الوارد-${today}.xlsx`;
      break;
    case "out_movements":
      sheet = buildMovementsSheet("تقرير السحب خلال فترة", "حركات السحب", movements, summary);
      filename = `تقرير-السحب-${today}.xlsx`;
      break;
    case "item_movements":
      sheet = buildMovementsSheet(
        `تقرير حركات منتج${filter.itemName ? `: ${filter.itemName}` : ""}`,
        "حركات المنتج",
        movements,
        summary
      );
      filename = `تقرير-حركات-منتج-${today}.xlsx`;
      break;
    case "adjustments":
      sheet = buildMovementsSheet("تقرير الجرد والتسويات", "الجرد والتسويات", movements, summary);
      filename = `تقرير-الجرد-والتسويات-${today}.xlsx`;
      break;
    default:
      sheet = buildMovementsSheet("تقرير حركات المخزون", "حركات المخزون", movements, summary);
      filename = `تقرير-حركات-المخزون-${today}.xlsx`;
      break;
  }

  const bytes = buildXlsx([sheet]);
  downloadBlob(bytes, filename);
}
