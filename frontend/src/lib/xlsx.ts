// كاتب ملفات Excel (.xlsx) بدون أي مكتبة خارجية.
// الملف عبارة عن ZIP (بدون ضغط) يحوي ملفات XML. يدعم: عدة أوراق، اتجاه من اليمين لليسار،
// تجميد الصف الأول، فلتر تلقائي، دمج خلايا، وعدة أنماط جاهزة (عنوان/رأس/نص/مدة/نسبة...).
// النصوص تُكتب كنص صرف (inlineStr) فلا تُفسَّر أبداً كصيغ حتى لو بدأت بـ = أو + أو -.

export type CellStyle =
  | "title"
  | "header"
  | "text"
  | "center"
  | "boldText"
  | "number"
  | "duration"
  | "percent"
  | "total"
  | "totalNumber"
  | "totalDuration"
  | "totalPercent";

export interface XlsxCell {
  v: string | number | null;
  s?: CellStyle;
}
export type XlsxRow = (XlsxCell | string | number | null)[];

export interface XlsxSheet {
  name: string;
  rows: XlsxRow[];
  /** عرض الأعمدة بوحدة عدد الأحرف */
  widths?: number[];
  /** الورقة من اليمين لليسار */
  rtl?: boolean;
  /** عدد الصفوف العلوية المجمَّدة */
  freezeRows?: number;
  /** فلتر تلقائي على نطاق (مثل A3:G10) */
  autoFilter?: string;
  /** نطاقات مدموجة (مثل A1:G1) */
  merges?: string[];
}

// ترتيب الأنماط هنا = رقمها داخل cellXfs في styles.xml
const STYLE_INDEX: Record<CellStyle | "default", number> = {
  default: 0,
  title: 1,
  header: 2,
  text: 3,
  center: 4,
  number: 5,
  duration: 6,
  percent: 7,
  total: 8,
  totalNumber: 9,
  totalDuration: 10,
  totalPercent: 11,
  boldText: 12,
};

const MAX_CELL_CHARS = 32000; // حد Excel 32767 حرفاً للخلية

// ---------- XML ----------

// حذف المحارف غير المسموحة في XML 1.0 ثم الهروب من الرموز الخاصة
// eslint-disable-next-line no-control-regex
const INVALID_XML = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]/g;
function esc(text: string): string {
  return text
    .replace(INVALID_XML, "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function columnLetter(index: number): string {
  let n = index + 1;
  let out = "";
  while (n > 0) {
    const rem = (n - 1) % 26;
    out = String.fromCharCode(65 + rem) + out;
    n = Math.floor((n - 1) / 26);
  }
  return out;
}

function sheetName(raw: string, used: Set<string>): string {
  let base = raw.replace(/[[\]:*?/\\]/g, " ").trim().slice(0, 31) || "Sheet";
  let name = base;
  let i = 2;
  while (used.has(name.toLowerCase())) {
    const suffix = ` ${i++}`;
    name = base.slice(0, 31 - suffix.length) + suffix;
  }
  used.add(name.toLowerCase());
  base = name;
  return base;
}

function cellXml(ref: string, cell: XlsxRow[number]): string {
  const obj: XlsxCell = cell !== null && typeof cell === "object" ? cell : { v: cell };
  const style = STYLE_INDEX[obj.s ?? "default"];
  const s = style ? ` s="${style}"` : "";
  const v = obj.v;
  if (v === null || v === undefined || v === "") return style ? `<c r="${ref}"${s}/>` : "";
  if (typeof v === "number") {
    return Number.isFinite(v) ? `<c r="${ref}"${s}><v>${v}</v></c>` : `<c r="${ref}"${s}/>`;
  }
  const text = esc(v.length > MAX_CELL_CHARS ? v.slice(0, MAX_CELL_CHARS) : v);
  return `<c r="${ref}"${s} t="inlineStr"><is><t xml:space="preserve">${text}</t></is></c>`;
}

function sheetXml(sheet: XlsxSheet): string {
  const freeze = sheet.freezeRows ?? 0;
  const pane = freeze > 0 ? `<pane ySplit="${freeze}" topLeftCell="A${freeze + 1}" activePane="bottomLeft" state="frozen"/>` : "";
  const view = `<sheetViews><sheetView workbookViewId="0"${sheet.rtl ? ' rightToLeft="1"' : ""}>${pane}</sheetView></sheetViews>`;
  const cols = sheet.widths?.length
    ? `<cols>${sheet.widths.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join("")}</cols>`
    : "";
  const rows = sheet.rows
    .map((row, r) => {
      const cells = row.map((cell, c) => cellXml(`${columnLetter(c)}${r + 1}`, cell)).join("");
      return `<row r="${r + 1}">${cells}</row>`;
    })
    .join("");
  const filter = sheet.autoFilter ? `<autoFilter ref="${sheet.autoFilter}"/>` : "";
  const merges = sheet.merges?.length
    ? `<mergeCells count="${sheet.merges.length}">${sheet.merges.map((m) => `<mergeCell ref="${m}"/>`).join("")}</mergeCells>`
    : "";
  return (
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">` +
    `${view}<sheetFormatPr defaultRowHeight="15"/>${cols}<sheetData>${rows}</sheetData>${filter}${merges}` +
    `</worksheet>`
  );
}

const BORDER = 1;
const STYLES_XML =
  `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
  `<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">` +
  `<numFmts count="1"><numFmt numFmtId="164" formatCode="[h]:mm:ss"/></numFmts>` +
  `<fonts count="4">` +
  `<font><sz val="11"/><name val="Calibri"/><family val="2"/></font>` + // 0 عادي
  `<font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/><family val="2"/></font>` + // 1 رأس
  `<font><b/><sz val="14"/><name val="Calibri"/><family val="2"/></font>` + // 2 عنوان
  `<font><b/><sz val="11"/><name val="Calibri"/><family val="2"/></font>` + // 3 عريض
  `</fonts>` +
  `<fills count="4">` +
  `<fill><patternFill patternType="none"/></fill>` +
  `<fill><patternFill patternType="gray125"/></fill>` +
  `<fill><patternFill patternType="solid"><fgColor rgb="FF148D72"/><bgColor indexed="64"/></patternFill></fill>` + // 2 أخضر
  `<fill><patternFill patternType="solid"><fgColor rgb="FFE3EEEA"/><bgColor indexed="64"/></patternFill></fill>` + // 3 رمادي فاتح
  `</fills>` +
  `<borders count="2">` +
  `<border><left/><right/><top/><bottom/><diagonal/></border>` +
  `<border>` +
  `<left style="thin"><color rgb="FFBFC9C5"/></left><right style="thin"><color rgb="FFBFC9C5"/></right>` +
  `<top style="thin"><color rgb="FFBFC9C5"/></top><bottom style="thin"><color rgb="FFBFC9C5"/></bottom><diagonal/>` +
  `</border>` +
  `</borders>` +
  `<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>` +
  `<cellXfs count="13">` +
  `<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>` + // 0 default
  `<xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>` + // 1 title
  `<xf numFmtId="0" fontId="1" fillId="2" borderId="${BORDER}" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>` + // 2 header
  `<xf numFmtId="0" fontId="0" fillId="0" borderId="${BORDER}" xfId="0" applyBorder="1" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf>` + // 3 text
  `<xf numFmtId="0" fontId="0" fillId="0" borderId="${BORDER}" xfId="0" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="top" wrapText="1"/></xf>` + // 4 center
  `<xf numFmtId="0" fontId="0" fillId="0" borderId="${BORDER}" xfId="0" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="top"/></xf>` + // 5 number
  `<xf numFmtId="164" fontId="0" fillId="0" borderId="${BORDER}" xfId="0" applyNumberFormat="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="top"/></xf>` + // 6 duration
  `<xf numFmtId="9" fontId="0" fillId="0" borderId="${BORDER}" xfId="0" applyNumberFormat="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="top"/></xf>` + // 7 percent
  `<xf numFmtId="0" fontId="3" fillId="3" borderId="${BORDER}" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf>` + // 8 total
  `<xf numFmtId="0" fontId="3" fillId="3" borderId="${BORDER}" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="top"/></xf>` + // 9 totalNumber
  `<xf numFmtId="164" fontId="3" fillId="3" borderId="${BORDER}" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="top"/></xf>` + // 10 totalDuration
  `<xf numFmtId="9" fontId="3" fillId="3" borderId="${BORDER}" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="top"/></xf>` + // 11 totalPercent
  `<xf numFmtId="0" fontId="3" fillId="0" borderId="${BORDER}" xfId="0" applyFont="1" applyBorder="1" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf>` + // 12 boldText
  `</cellXfs>` +
  `<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>` +
  `</styleSheet>`;

// ---------- ZIP (بدون ضغط) ----------

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(data: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < data.length; i++) c = CRC_TABLE[(c ^ data[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

interface ZipEntry {
  name: string;
  data: Uint8Array;
}

function zip(entries: ZipEntry[]): Uint8Array<ArrayBuffer> {
  const enc = new TextEncoder();
  const DOS_TIME = 0;
  const DOS_DATE = (0 << 9) | (1 << 5) | 1; // 1980-01-01
  const locals: Uint8Array[] = [];
  const centrals: Uint8Array[] = [];
  let offset = 0;

  for (const entry of entries) {
    const name = enc.encode(entry.name);
    const crc = crc32(entry.data);
    const size = entry.data.length;

    const local = new Uint8Array(30 + name.length);
    const lv = new DataView(local.buffer);
    lv.setUint32(0, 0x04034b50, true);
    lv.setUint16(4, 20, true); // version needed
    lv.setUint16(6, 0x0800, true); // UTF-8 names
    lv.setUint16(8, 0, true); // stored
    lv.setUint16(10, DOS_TIME, true);
    lv.setUint16(12, DOS_DATE, true);
    lv.setUint32(14, crc, true);
    lv.setUint32(18, size, true);
    lv.setUint32(22, size, true);
    lv.setUint16(26, name.length, true);
    lv.setUint16(28, 0, true);
    local.set(name, 30);

    const central = new Uint8Array(46 + name.length);
    const cv = new DataView(central.buffer);
    cv.setUint32(0, 0x02014b50, true);
    cv.setUint16(4, 20, true);
    cv.setUint16(6, 20, true);
    cv.setUint16(8, 0x0800, true);
    cv.setUint16(10, 0, true);
    cv.setUint16(12, DOS_TIME, true);
    cv.setUint16(14, DOS_DATE, true);
    cv.setUint32(16, crc, true);
    cv.setUint32(20, size, true);
    cv.setUint32(24, size, true);
    cv.setUint16(28, name.length, true);
    cv.setUint32(42, offset, true);
    central.set(name, 46);

    locals.push(local, entry.data);
    centrals.push(central);
    offset += local.length + size;
  }

  const centralSize = centrals.reduce((sum, c) => sum + c.length, 0);
  const end = new Uint8Array(22);
  const ev = new DataView(end.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(8, entries.length, true);
  ev.setUint16(10, entries.length, true);
  ev.setUint32(12, centralSize, true);
  ev.setUint32(16, offset, true);

  const parts = [...locals, ...centrals, end];
  const out = new Uint8Array(new ArrayBuffer(parts.reduce((sum, p) => sum + p.length, 0)));
  let pos = 0;
  for (const part of parts) {
    out.set(part, pos);
    pos += part.length;
  }
  return out;
}

// ---------- الواجهة العامة ----------

export const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

export function buildXlsx(sheets: XlsxSheet[]): Uint8Array<ArrayBuffer> {
  if (sheets.length === 0) throw new Error("لا توجد أوراق لكتابتها");
  const enc = new TextEncoder();
  const used = new Set<string>();
  const names = sheets.map((s) => sheetName(s.name, used));

  const contentTypes =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
    `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
    `<Default Extension="xml" ContentType="application/xml"/>` +
    `<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>` +
    `<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>` +
    sheets
      .map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`)
      .join("") +
    `</Types>`;

  const rootRels =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
    `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>` +
    `</Relationships>`;

  const workbook =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">` +
    `<bookViews><workbookView/></bookViews>` +
    `<sheets>${names.map((n, i) => `<sheet name="${esc(n)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join("")}</sheets>` +
    `</workbook>`;

  const workbookRels =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
    sheets
      .map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`)
      .join("") +
    `<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>` +
    `</Relationships>`;

  const entries: ZipEntry[] = [
    { name: "[Content_Types].xml", data: enc.encode(contentTypes) },
    { name: "_rels/.rels", data: enc.encode(rootRels) },
    { name: "xl/workbook.xml", data: enc.encode(workbook) },
    { name: "xl/_rels/workbook.xml.rels", data: enc.encode(workbookRels) },
    { name: "xl/styles.xml", data: enc.encode(STYLES_XML) },
    ...sheets.map((s, i) => ({ name: `xl/worksheets/sheet${i + 1}.xml`, data: enc.encode(sheetXml(s)) })),
  ];
  return zip(entries);
}
