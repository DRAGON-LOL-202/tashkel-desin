import { format, isValid } from "date-fns";
import { ar } from "date-fns/locale";

export function formatArabicDate(dateStr?: string | number, pattern = "d MMMM yyyy"): string {
  if (!dateStr) return "--";
  const d = new Date(dateStr);
  if (!isValid(d)) return "--";
  return format(d, pattern, { locale: ar });
}

export function formatArabicTime(dateValue?: string | number): string {
  if (!dateValue) return "--";
  const d = new Date(dateValue);
  if (!isValid(d)) return "--";
  return format(d, "h:mm a", { locale: ar });
}

export function formatDuration(ms: number): string {
  if (!ms || ms < 0) ms = 0;
  const totalSeconds = Math.floor(ms / 1000);
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${pad(h)}:${pad(m)}:${pad(s)}`;
}

export function formatDurationShort(ms: number): string {
  if (!ms || ms < 0) ms = 0;
  const totalMinutes = Math.floor(ms / 60000);
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  if (h > 0) return `${h} ساعة${m ? ` و ${m} دقيقة` : ""}`;
  return `${m} دقيقة`;
}

export function todayISO(): string {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function addDaysISO(dateStr: string, days: number): string {
  const date = new Date(`${dateStr}T12:00:00`);
  date.setDate(date.getDate() + days);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
