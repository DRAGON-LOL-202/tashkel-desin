// تنزيل التقرير اليومي كملف Excel من المتصفح (يُنشأ محلياً بدون أي طلب للخادم).
import type { Task, TeamMember } from "../types";
import { buildDailyReportSheets } from "./dailyReport";
import { buildXlsx, XLSX_MIME } from "./xlsx";

export function downloadDailyReport(tasks: Task[], members: Pick<TeamMember, "id" | "name" | "role">[], date: string): void {
  const bytes = buildXlsx(buildDailyReportSheets(tasks, members, date));
  const url = URL.createObjectURL(new Blob([bytes], { type: XLSX_MIME }));
  const link = document.createElement("a");
  link.href = url;
  link.download = `تقرير-المهام-${date}.xlsx`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  // تأخير بسيط حتى يبدأ المتصفح التنزيل قبل تحرير الرابط
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
