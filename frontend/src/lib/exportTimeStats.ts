// تنزيل الإحصائيات طويلة الأمد كملف Excel من المتصفح (يُنشأ محلياً بدون أي طلب للخادم).
import { buildXlsx, XLSX_MIME } from "./xlsx";
import { buildTimeStatsSheets, type TimeMatrix } from "./timeStats";

export function downloadTimeStats(matrix: TimeMatrix): void {
  const bytes = buildXlsx(buildTimeStatsSheets(matrix));
  const url = URL.createObjectURL(new Blob([bytes], { type: XLSX_MIME }));
  const link = document.createElement("a");
  link.href = url;
  link.download = `وقت-العمل-اليومي-${matrix.from}-إلى-${matrix.to}.xlsx`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
