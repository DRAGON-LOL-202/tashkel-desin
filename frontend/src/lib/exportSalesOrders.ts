import { buildXlsx, XLSX_MIME, type XlsxCell, type XlsxRow, type XlsxSheet } from "./xlsx";
import type { FollowOrder } from "../types";

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

/**
 * تصدير أوردرات المبيعات لملف Excel بالترتيب والتصميم المعتمدين لمتابعة الشحن:
 * الصف 1: لافتة «عام» (أصفر / أحمر)
 * الصف 2: م | بوليصه | الاسم | العنوان | رقم التليفون | السعر | م شحن | الاجمالي | الملاحظات | العدد | المنتج
 */
export function exportSalesOrdersExcel(orders: FollowOrder[], opts: { mode: "day" | "month"; date: string }) {
  const bannerRow: XlsxRow = [
    { v: "عام", s: "salesBanner" },
    ...Array.from({ length: 10 }, () => ({ v: null, s: "salesBanner" as const })),
  ];

  const headers: XlsxRow = [
    { v: "م", s: "salesHeader" },
    { v: "بوليصه", s: "salesHeader" },
    { v: "الاسم", s: "salesHeader" },
    { v: "العنوان", s: "salesHeader" },
    { v: "رقم التليفون", s: "salesHeader" },
    { v: "السعر", s: "salesHeader" },
    { v: "م شحن", s: "salesHeader" },
    { v: "الاجمالي", s: "salesHeader" },
    { v: "الملاحظات", s: "salesHeader" },
    { v: "العدد", s: "salesHeader" },
    { v: "المنتج", s: "salesHeader" },
  ];

  const dataRows: XlsxRow[] = orders.map((o, idx) => {
    const customer = o.customerName || (o.source === "MANUAL" ? o.closerName || "—" : "—");
    const qty = o.totalQuantity || o.lines.reduce((s, l) => s + l.quantity, 0);
    const productSummary =
      o.lines
        .map((l) => (l.quantity > 1 ? `${l.quantity} ${l.productName}` : l.productName))
        .join(" + ") ||
      o.boxName ||
      "—";
    const totalDeposit = o.totalDeposit ?? Math.round(((o.deposit ?? 0) + (o.extraDeposit ?? 0)) * 100) / 100;
    const netTotal =
      o.remainingTotal ??
      Math.max(0, Math.round(((o.sellPrice ?? 0) + (o.shippingPrice ?? 0) - totalDeposit) * 100) / 100);
    const notesParts = [
      o.notes.trim(),
      totalDeposit > 0 ? `عربون: ${totalDeposit} ج.م` : "",
      o.cancelled ? `(ملغي${o.cancelReason ? `: ${o.cancelReason}` : ""})` : "",
    ].filter(Boolean);
    const waybillVal: XlsxCell = {
      v: o.waybill && /^\d+$/.test(o.waybill.trim()) ? Number(o.waybill.trim()) : o.waybill || "—",
      s: "salesWaybill",
    };

    return [
      { v: idx + 1, s: "salesSerial" },
      waybillVal,
      { v: customer, s: "salesCell" },
      { v: o.customerAddress || "—", s: "salesCell" },
      { v: o.customerPhone || "—", s: "salesCell" },
      { v: o.sellPrice ?? 0, s: "salesCell" },
      { v: o.shippingPrice === null ? "" : o.shippingPrice, s: "salesCell" },
      { v: netTotal, s: "salesTotalCol" },
      { v: notesParts.join("\n") || "—", s: "salesCell" },
      { v: qty, s: "salesCell" },
      { v: productSummary, s: "salesCell" },
    ];
  });

  const sheet: XlsxSheet = {
    name: "عام",
    rtl: true,
    freezeRows: 2,
    merges: ["A1:K1"],
    autoFilter: `A2:K${Math.max(2, orders.length + 2)}`,
    rowHeights: { 1: 28, 2: 24 },
    widths: [7, 13, 22, 34, 24, 11, 11, 12, 34, 9, 26],
    rows: [bannerRow, headers, ...dataRows],
  };

  const bytes = buildXlsx([sheet]);
  downloadBlob(bytes, `orders-${opts.mode}-${opts.date}.xlsx`);
}
