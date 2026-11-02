import { buildXlsx, XLSX_MIME, type XlsxRow, type XlsxSheet } from "./xlsx";
import { calcTotalValue } from "../components/inventory/format";
import { SALES_STATUS_META } from "../components/sales/status";
import { formatArabicDate } from "./date";
import type { SalesOrder } from "../types";

// تصدير المبيعات الإلكترونية إلى Excel: يومي (أوردرات + مكونات) وشهري (ملخص يومي + أوردرات + مكونات).
// الإجماليات مثل ملخص الصفحة: المرتجع لا يدخل في التكلفة والبيع والربح، أما التالف فيُحسب من المرتجعات.

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

const cents = (n: number) => Math.round(n * 100);
const pad = (n: number) => Array.from({ length: n }, () => null);
const blank = (n: number): XlsxRow => Array.from({ length: n }, () => ({ v: "", s: "total" as const }));

interface Totals {
  count: number;
  returned: number;
  cost: number;
  sell: number;
  damaged: number;
}

function totalsOf(orders: SalesOrder[]): Totals {
  let cost = 0;
  let sell = 0;
  let damaged = 0;
  let count = 0;
  let returned = 0;
  for (const o of orders) {
    damaged += cents(o.damagedTotal);
    if (o.status === "RETURNED") {
      returned += 1;
      continue;
    }
    count += 1;
    cost += cents(o.costTotal);
    sell += cents(o.sellTotal);
  }
  return { count, returned, cost: cost / 100, sell: sell / 100, damaged: damaged / 100 };
}

const productsText = (o: SalesOrder) => o.lines.map((l) => `${l.productName} × ${l.quantity}`).join("، ");

/** ورقة الأوردرات: صف لكل أوردر مع رقمه في يومه */
function ordersSheet(title: string, subtitle: string, orders: SalesOrder[]): XlsxSheet {
  const headers: XlsxRow = ["رقم الأوردر باليوم", "التاريخ", "رقم البوليصة", "اسم المقفل", "أضافه", "الحالة", "المنتجات", "التكلفة (ج.م)", "سعر البيع (ج.م)", "الربح (ج.م)", "التالف (ج.م)", "ملاحظات"].map((v) => ({ v, s: "header" as const }));

  const seq = new Map<string, number>();
  const rows: XlsxRow[] = orders.map((o) => {
    const n = (seq.get(o.date) ?? 0) + 1;
    seq.set(o.date, n);
    const returned = o.status === "RETURNED";
    return [
      { v: n, s: "center" },
      { v: o.date, s: "center" },
      { v: o.waybill || "—", s: "center" },
      { v: o.closerName || "—", s: "center" },
      { v: o.createdByName, s: "center" },
      { v: SALES_STATUS_META[o.status].label, s: "center" },
      { v: productsText(o), s: "boldText" },
      { v: o.costTotal, s: "number" },
      { v: o.sellTotal, s: "number" },
      { v: o.profit, s: "number" },
      { v: returned ? o.damagedTotal : 0, s: "number" },
      { v: o.notes || "—", s: "text" },
    ];
  });

  const t = totalsOf(orders);
  const total: XlsxRow = [
    { v: "الإجمالي", s: "total" },
    { v: `${t.count} أوردر${t.returned ? ` + ${t.returned} مرتجع` : ""}`, s: "total" },
    ...blank(5),
    { v: t.cost, s: "totalNumber" },
    { v: t.sell, s: "totalNumber" },
    { v: (cents(t.sell) - cents(t.cost)) / 100, s: "totalNumber" },
    { v: t.damaged, s: "totalNumber" },
    { v: "", s: "total" },
  ];

  return {
    name: "الأوردرات",
    rtl: true,
    freezeRows: 3,
    merges: ["A1:L1", "A2:L2"],
    autoFilter: `A3:L${Math.max(3, 3 + rows.length)}`,
    widths: [12, 13, 16, 16, 16, 13, 44, 15, 15, 15, 15, 26],
    rows: [[{ v: title, s: "title" }, ...pad(11)], [{ v: subtitle, s: "center" }, ...pad(11)], headers, ...rows, total],
  };
}

/** ورقة تفاصيل المكونات: صف لكل مكوّن في كل بند (بالكمية الكلية للبند) */
function componentsSheet(orders: SalesOrder[]): XlsxSheet {
  const headers: XlsxRow = ["التاريخ", "رقم البوليصة", "الحالة", "المنتج", "عدد المنتج", "المكوّن", "الكمية الكلية", "الوحدة", "تكلفة الوحدة (ج.م)", "إجمالي التكلفة (ج.م)", "تالف"].map((v) => ({ v, s: "header" as const }));

  let sumCents = 0;
  let damagedCents = 0;
  const rows: XlsxRow[] = [];
  for (const o of orders) {
    for (const l of o.lines) {
      for (const c of l.components) {
        const qty = Math.round(c.quantity * l.quantity * 1000) / 1000;
        const cost = calcTotalValue(qty, c.unitCost);
        if (o.status !== "RETURNED") sumCents += cents(cost);
        if (c.damaged) damagedCents += cents(cost);
        rows.push([
          { v: o.date, s: "center" },
          { v: o.waybill || "—", s: "center" },
          { v: SALES_STATUS_META[o.status].label, s: "center" },
          { v: l.productName, s: "text" },
          { v: l.quantity, s: "center" },
          { v: c.itemName, s: "boldText" },
          { v: qty, s: "number" },
          { v: c.unit, s: "center" },
          { v: c.unitCost, s: "number" },
          { v: cost, s: "number" },
          { v: c.damaged ? "تالف" : "—", s: "center" },
        ]);
      }
    }
  }

  const total: XlsxRow = [{ v: "الإجمالي", s: "total" }, { v: `${rows.length} مكوّن`, s: "total" }, ...blank(7), { v: sumCents / 100, s: "totalNumber" }, { v: damagedCents ? `تالف: ${damagedCents / 100} ج.م` : "", s: "total" }];

  return {
    name: "المكونات",
    rtl: true,
    freezeRows: 3,
    merges: ["A1:K1", "A2:K2"],
    autoFilter: `A3:K${Math.max(3, 3 + rows.length)}`,
    widths: [13, 16, 13, 26, 11, 26, 14, 11, 16, 18, 10],
    rows: [
      [{ v: "تفاصيل مكونات الأوردرات", s: "title" }, ...pad(10)],
      [{ v: "إجمالي التكلفة لا يشمل المرتجع", s: "center" }, ...pad(10)],
      headers,
      ...rows,
      total,
    ],
  };
}

/** ورقة الملخص اليومي (للشهري): صف لكل يوم فيه أوردرات */
function dailySummarySheet(title: string, orders: SalesOrder[]): XlsxSheet {
  const byDate = new Map<string, SalesOrder[]>();
  for (const o of orders) byDate.set(o.date, [...(byDate.get(o.date) ?? []), o]);
  const days = [...byDate.keys()].sort();

  const headers: XlsxRow = ["التاريخ", "اليوم", "عدد الأوردرات", "عدد المرتجع", "إجمالي التكلفة (ج.م)", "إجمالي البيع (ج.م)", "الربح (ج.م)", "التالف (ج.م)"].map((v) => ({ v, s: "header" as const }));

  const rows: XlsxRow[] = days.map((d) => {
    const t = totalsOf(byDate.get(d)!);
    return [
      { v: d, s: "center" },
      { v: formatArabicDate(d, "EEEE"), s: "center" },
      { v: t.count, s: "center" },
      { v: t.returned, s: "center" },
      { v: t.cost, s: "number" },
      { v: t.sell, s: "number" },
      { v: (cents(t.sell) - cents(t.cost)) / 100, s: "number" },
      { v: t.damaged, s: "number" },
    ];
  });

  const all = totalsOf(orders);
  const total: XlsxRow = [
    { v: "إجمالي الشهر", s: "total" },
    { v: `${days.length} يوم`, s: "total" },
    { v: all.count, s: "total" },
    { v: all.returned, s: "total" },
    { v: all.cost, s: "totalNumber" },
    { v: all.sell, s: "totalNumber" },
    { v: (cents(all.sell) - cents(all.cost)) / 100, s: "totalNumber" },
    { v: all.damaged, s: "totalNumber" },
  ];

  return {
    name: "الملخص اليومي",
    rtl: true,
    freezeRows: 3,
    merges: ["A1:H1", "A2:H2"],
    autoFilter: `A3:H${Math.max(3, 3 + rows.length)}`,
    widths: [14, 14, 15, 14, 20, 20, 16, 16],
    rows: [[{ v: title, s: "title" }, ...pad(7)], [{ v: "المرتجع لا يدخل في التكلفة والبيع والربح، ويظهر تالفه في عمود التالف", s: "center" }, ...pad(7)], headers, ...rows, total],
  };
}

/** تصدير أوردرات يوم واحد */
export function downloadSalesDaily(date: string, orders: SalesOrder[]): void {
  const label = formatArabicDate(date, "EEEE d MMMM yyyy");
  const sheets = [ordersSheet(`مبيعات إلكترونية — ${label}`, "المرتجع لا يدخل في إجمالي التكلفة والبيع والربح، ويظهر تالفه في عمود التالف", orders), componentsSheet(orders)];
  downloadBlob(buildXlsx(sheets), `مبيعات-يومي-${date}.xlsx`);
}

/** تصدير شهر كامل (month بصيغة YYYY-MM) */
export function downloadSalesMonthly(month: string, orders: SalesOrder[]): void {
  const label = formatArabicDate(`${month}-01`, "MMMM yyyy");
  const sheets = [dailySummarySheet(`مبيعات إلكترونية — ${label}`, orders), ordersSheet(`أوردرات ${label}`, "مرتبة بالتاريخ ثم وقت الإضافة", orders), componentsSheet(orders)];
  downloadBlob(buildXlsx(sheets), `مبيعات-شهري-${month}.xlsx`);
}
