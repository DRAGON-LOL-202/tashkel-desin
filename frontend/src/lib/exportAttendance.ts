// تنزيل جدول الحضور الشهري كملف Excel من المتصفح (يُنشأ محلياً بدون أي طلب للخادم).
import { buildXlsx, XLSX_MIME } from "./xlsx";
import { buildAttendanceSheets, type AttendanceMatrix } from "./attendance";

export function downloadAttendance(matrix: AttendanceMatrix, today: string): void {
  const bytes = buildXlsx(buildAttendanceSheets(matrix, today));
  const url = URL.createObjectURL(new Blob([bytes], { type: XLSX_MIME }));
  const link = document.createElement("a");
  link.href = url;
  link.download = `الحضور-والانصراف-${matrix.month}.xlsx`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
