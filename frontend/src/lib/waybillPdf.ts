import type { AgentOrder, FollowOrder } from "../types";
import { todayISO } from "./date";

export interface WaybillLine {
  quantity: number;
  productName: string;
  unitPrice: number | null;
  lineTotal: number | null;
}

export interface WaybillData {
  id: string;
  waybill: string;
  seq?: number;
  date: string;
  customerName: string;
  customerAddress: string;
  customerPhone: string;
  notes: string;
  lines: WaybillLine[];
  shippingPrice: number | null;
  grossTotal: number;
  deposit: number;
  grandTotal: number;
}

export const COMPLAINT_PHONES = "01006694969 / 01203293766";

/** تنسيق التاريخ بالشكل 11/22/2026 المطابق للفاتورة المرجعية */
export function formatWaybillDate(dateStr: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(dateStr.trim());
  if (m) return `${m[2]}/${m[3]}/${m[1]}`;
  return dateStr || "—";
}

export function fmtUnitPrice(n: number | null): string {
  if (n === null || !Number.isFinite(n)) return "—";
  return n.toFixed(2);
}

export function fmtInvoiceAmount(n: number | null): string {
  if (n === null || !Number.isFinite(n)) return "—";
  return Number.isInteger(n) ? String(n) : n.toFixed(2);
}

export function waybillFromAgentOrder(o: AgentOrder): WaybillData {
  const ship = o.shippingPrice ?? null;
  const deposit = o.deposit ?? 0;
  const grossTotal = o.totalWithShipping ?? Math.round((o.sellPrice + (ship ?? 0)) * 100) / 100;
  const grandTotal = o.remainingTotal ?? Math.max(0, Math.round((grossTotal - deposit) * 100) / 100);
  const lines: WaybillLine[] =
    o.lines.length > 0
      ? o.lines.map((l) => {
          if (l.boxPrice != null) {
            return {
              quantity: l.quantity,
              productName: l.productName,
              unitPrice: l.boxPrice,
              lineTotal: l.lineTotal ?? Math.round(l.quantity * l.boxPrice * 100) / 100,
            };
          }
          if (o.lines.length === 1) {
            const qty = Math.max(1, l.quantity);
            return {
              quantity: l.quantity,
              productName: l.productName,
              unitPrice: Math.round((o.sellPrice / qty) * 100) / 100,
              lineTotal: o.sellPrice,
            };
          }
          return { quantity: l.quantity, productName: l.productName, unitPrice: null, lineTotal: null };
        })
      : [{ quantity: 1, productName: "أوردر", unitPrice: o.sellPrice, lineTotal: o.sellPrice }];

  return {
    id: o.id,
    waybill: o.waybill,
    seq: o.seq,
    date: o.date,
    customerName: o.customerName,
    customerAddress: o.customerAddress,
    customerPhone: o.customerPhone,
    notes: o.notes,
    lines,
    shippingPrice: ship,
    grossTotal,
    deposit,
    grandTotal,
  };
}

export function waybillFromFollowOrder(o: FollowOrder): WaybillData {
  const sell = o.sellPrice ?? 0;
  const ship = o.shippingPrice ?? null;
  const deposit = o.totalDeposit ?? Math.round(((o.deposit ?? 0) + (o.extraDeposit ?? 0)) * 100) / 100;
  const grossTotal = Math.round((sell + (ship ?? 0)) * 100) / 100;
  const grandTotal = o.remainingTotal ?? Math.max(0, Math.round((grossTotal - deposit) * 100) / 100);
  const lines: WaybillLine[] =
    o.lines.length > 0
      ? o.lines.map((l) => {
          if (l.boxPrice != null) {
            return {
              quantity: l.quantity,
              productName: l.productName,
              unitPrice: l.boxPrice,
              lineTotal: l.lineTotal ?? Math.round(l.quantity * l.boxPrice * 100) / 100,
            };
          }
          if (o.lines.length === 1 && o.sellPrice !== null) {
            const qty = Math.max(1, l.quantity);
            return {
              quantity: l.quantity,
              productName: l.productName,
              unitPrice: Math.round((o.sellPrice / qty) * 100) / 100,
              lineTotal: o.sellPrice,
            };
          }
          return { quantity: l.quantity, productName: l.productName, unitPrice: null, lineTotal: null };
        })
      : [{ quantity: 1, productName: o.boxName || "أوردر مبيعات", unitPrice: o.sellPrice, lineTotal: o.sellPrice }];

  return {
    id: o.id,
    waybill: o.waybill || "—",
    date: o.date,
    customerName: o.customerName || (o.source === "MANUAL" ? o.closerName || "—" : "—"),
    customerAddress: o.customerAddress,
    customerPhone: o.customerPhone,
    notes: o.notes,
    lines,
    shippingPrice: ship,
    grossTotal,
    deposit,
    grandTotal,
  };
}

function escapeHtml(raw: string): string {
  return raw
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

let cachedLogoDataUrl: string | null = null;

/** تحميل شعار الشركة مرة واحدة وتحويله إلى PNG رمادي واضح للطباعة وhtml2canvas */
async function loadLogoDataUrl(): Promise<string> {
  if (cachedLogoDataUrl) return cachedLogoDataUrl;
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.crossOrigin = "anonymous";
      el.onload = () => resolve(el);
      el.onerror = reject;
      el.src = "/tashkeel-cnc-logo.svg";
    });
    const canvas = document.createElement("canvas");
    canvas.width = 320;
    canvas.height = 180;
    const ctx = canvas.getContext("2d");
    if (!ctx) return "";
    ctx.filter = "grayscale(100%) brightness(55%) contrast(150%)";
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    cachedLogoDataUrl = canvas.toDataURL("image/png");
    return cachedLogoDataUrl;
  } catch {
    return "";
  }
}

function buildWaybillMarkup(w: WaybillData, logoSrc: string): string {
  const rows = w.lines
    .map(
      (l) => `
      <tr>
        <td class="val num">${escapeHtml(String(l.quantity))}</td>
        <td class="val">${escapeHtml(l.productName)}</td>
        <td class="val num" dir="ltr">${escapeHtml(fmtUnitPrice(l.unitPrice))}</td>
        <td class="val num red">${escapeHtml(fmtInvoiceAmount(l.lineTotal))}</td>
      </tr>`
    )
    .join("");

  const logoHtml = logoSrc
    ? `<img src="${logoSrc}" alt="TASHKEEL.CNC" class="logo" />`
    : `<div class="logo-fallback">TASHKEEL.CNC</div>`;

  return `
  <div class="sheet" dir="rtl">
    <div class="head">
      <div class="head-right">
        <div class="title">فاتورة</div>
        <div class="sub" dir="ltr">#${escapeHtml(w.waybill || "—")}</div>
      </div>
      ${logoHtml}
    </div>
    <div class="complaint">رقم الشكوى : (<span dir="ltr">${escapeHtml(COMPLAINT_PHONES)}</span>)</div>
    <table class="grid">
      <colgroup>
        <col style="width:21%" />
        <col style="width:37%" />
        <col style="width:17%" />
        <col style="width:25%" />
      </colgroup>
      <tbody>
        <tr>
          <th class="lbl">التاريخ</th>
          <td class="val num" dir="ltr">${escapeHtml(formatWaybillDate(w.date))}</td>
          <th class="lbl">بوليصه</th>
          <td class="val num" dir="ltr">${escapeHtml(w.waybill || "—")}</td>
        </tr>
        <tr>
          <th class="lbl">إسم العميل</th>
          <td class="val" colspan="3">${escapeHtml(w.customerName || "—")}</td>
        </tr>
        <tr>
          <th class="lbl">العنوان</th>
          <td class="val addr" colspan="3">${escapeHtml(w.customerAddress || "—")}</td>
        </tr>
        <tr>
          <th class="lbl">تليفون</th>
          <td class="val num" colspan="3" dir="ltr">${escapeHtml(w.customerPhone || "—")}</td>
        </tr>
        <tr>
          <th class="lbl">الكمية</th>
          <th class="lbl">إسم الصنف</th>
          <th class="lbl">السعر</th>
          <th class="lbl">الإجمالى</th>
        </tr>
        ${rows}
        <tr>
          <th class="lbl">م شحن</th>
          <td class="val num" dir="ltr">${escapeHtml(w.shippingPrice === null ? "—" : fmtInvoiceAmount(w.shippingPrice))}</td>
          <th class="lbl tight">الاجمالى بالشحن</th>
          <td class="val num ${w.deposit > 0 ? "" : "red lg"}" dir="ltr">${escapeHtml(fmtInvoiceAmount(w.grossTotal))}</td>
        </tr>
        ${
          w.deposit > 0
            ? `<tr>
          <th class="lbl">العربون</th>
          <td class="val num" dir="ltr">${escapeHtml(fmtInvoiceAmount(w.deposit))}</td>
          <th class="lbl">المتبقى</th>
          <td class="val num red lg" dir="ltr">${escapeHtml(fmtInvoiceAmount(w.grandTotal))}</td>
        </tr>`
            : ""
        }
      </tbody>
    </table>
    <div class="notes-wrap">
      <div class="notes-lbl">الملاحظات</div>
      <div class="notes-val">${escapeHtml(w.notes || "—")}</div>
    </div>
  </div>`;
}

const SHEET_CSS = `
  * { box-sizing: border-box; }
  html, body {
    margin: 0;
    padding: 0;
    background: #ffffff;
    color: #000000;
    font-family: "IBM Plex Sans Arabic", "Segoe UI", Tahoma, Arial, sans-serif;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  .sheet {
    width: 397px;
    min-height: 552px;
    border: 2px solid #000000;
    background: #ffffff;
    color: #000000;
    padding: 10px;
    display: flex;
    flex-direction: column;
    margin: 0 auto;
    page-break-after: always;
    break-after: page;
  }
  .sheet:last-child { page-break-after: auto; break-after: auto; }
  .head { display: flex; justify-content: space-between; align-items: flex-start; padding-bottom: 4px; }
  .head-right { text-align: right; line-height: 1.2; padding-top: 2px; }
  .title { font-size: 22px; font-weight: 800; color: #000000; }
  .sub { font-size: 11px; font-weight: 600; color: #525252; margin-top: 2px; }
  .logo { width: 92px; height: 52px; object-fit: contain; }
  .logo-fallback { font-size: 12px; font-weight: 800; color: #333; padding-top: 8px; }
  .complaint { text-align: center; font-size: 12px; font-weight: 700; padding-bottom: 6px; color: #000000; }
  .grid { width: 100%; border-collapse: collapse; table-layout: fixed; border: 1px solid #000000; }
  .lbl, .val { border: 1px solid #000000; padding: 7px 6px; text-align: center; font-size: 13px; font-weight: 700; word-wrap: break-word; overflow-wrap: break-word; }
  .lbl { color: #b91c1c; }
  .lbl.tight { line-height: 1.25; }
  .val { color: #000000; }
  .val.addr { font-size: 12px; }
  .val.red { color: #b91c1c; font-weight: 800; }
  .val.lg { font-size: 14px; }
  .num { font-variant-numeric: tabular-nums; }
  .notes-wrap { flex: 1; display: flex; border-left: 1px solid #000000; border-right: 1px solid #000000; border-bottom: 1px solid #000000; }
  .notes-lbl { width: 21%; border-left: 1px solid #000000; display: flex; align-items: center; justify-content: center; padding: 10px 6px; text-align: center; font-size: 13px; font-weight: 700; color: #b91c1c; }
  .notes-val { flex: 1; display: flex; align-items: center; justify-content: center; padding: 12px; text-align: center; font-size: 13px; font-weight: 700; line-height: 1.6; white-space: pre-wrap; word-break: break-word; color: #000000; }
  @page { size: A6 portrait; margin: 3mm; }
  @media print {
    .sheet { width: 100%; min-height: 139mm; margin: 0; }
  }
`;

/** طباعة بوليصة واحدة أو عدة بوالص بمقاس A6 عبر iframe مخفي */
export async function printWaybills(list: WaybillData[]): Promise<void> {
  if (list.length === 0) return;
  const logoSrc = await loadLogoDataUrl();
  const sheetsHtml = list.map((w) => buildWaybillMarkup(w, logoSrc)).join("");

  const iframe = document.createElement("iframe");
  iframe.setAttribute("aria-hidden", "true");
  iframe.style.position = "fixed";
  iframe.style.right = "0";
  iframe.style.bottom = "0";
  iframe.style.width = "0";
  iframe.style.height = "0";
  iframe.style.border = "0";
  document.body.appendChild(iframe);

  const doc = iframe.contentWindow?.document;
  if (!doc || !iframe.contentWindow) {
    iframe.remove();
    throw new Error("تعذّر فتح نافذة الطباعة");
  }

  doc.open();
  doc.write(`<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><title>طباعة البوالص</title><style>${SHEET_CSS}</style></head><body>${sheetsHtml}</body></html>`);
  doc.close();

  const win = iframe.contentWindow;
  const cleanup = () => {
    setTimeout(() => iframe.remove(), 500);
  };
  win.onafterprint = cleanup;

  await new Promise<void>((resolve) => {
    setTimeout(() => {
      win.focus();
      win.print();
      setTimeout(cleanup, 60_000);
      resolve();
    }, 150);
  });
}

/** تحميل بوليصة واحدة أو عدة بوالص في ملف PDF واحد بمقاس A6 (صفحة لكل بوليصة) */
export async function downloadWaybillsPdf(list: WaybillData[], filename?: string): Promise<void> {
  if (list.length === 0) return;
  const [{ jsPDF }, html2canvasMod, logoSrc] = await Promise.all([
    import("jspdf"),
    import("html2canvas"),
    loadLogoDataUrl(),
  ]);
  const html2canvas = html2canvasMod.default;

  const styleEl = document.createElement("style");
  styleEl.textContent = SHEET_CSS;
  const host = document.createElement("div");
  host.style.position = "fixed";
  host.style.left = "-99999px";
  host.style.top = "0";
  host.style.width = "397px";
  host.style.background = "#ffffff";
  host.style.zIndex = "-1";
  host.appendChild(styleEl);

  for (const w of list) {
    const holder = document.createElement("div");
    holder.innerHTML = buildWaybillMarkup(w, logoSrc);
    const sheet = holder.firstElementChild as HTMLElement | null;
    if (sheet) host.appendChild(sheet);
  }
  document.body.appendChild(host);

  try {
    if (document.fonts?.ready) await document.fonts.ready;
    const sheets = Array.from(host.querySelectorAll<HTMLElement>(".sheet"));
    const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a6" });

    for (let i = 0; i < sheets.length; i++) {
      if (i > 0) pdf.addPage("a6", "portrait");
      const canvas = await html2canvas(sheets[i], {
        scale: 2,
        backgroundColor: "#ffffff",
        useCORS: true,
        logging: false,
      });
      const imgData = canvas.toDataURL("image/png");
      const maxW = 99;
      const maxH = 142;
      const ratio = canvas.height / Math.max(1, canvas.width);
      let drawW = maxW;
      let drawH = drawW * ratio;
      if (drawH > maxH) {
        drawH = maxH;
        drawW = drawH / ratio;
      }
      const x = (105 - drawW) / 2;
      pdf.addImage(imgData, "PNG", x, 3, drawW, drawH, undefined, "FAST");
    }

    const outName =
      filename ??
      (list.length === 1
        ? `waybill-${(list[0].waybill || "order").replace(/[^\w\u0600-\u06FF-]+/g, "_")}.pdf`
        : `waybills-${todayISO()}-${list.length}.pdf`);
    pdf.save(outName);
  } finally {
    host.remove();
  }
}
