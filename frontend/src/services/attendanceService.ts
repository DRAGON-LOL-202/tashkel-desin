import { api } from "../lib/api";
import type { AttendanceMonth, AttendanceSession, AttendanceToday } from "../types";

export const attendanceService = {
  /** جلسات اليوم + أي جلسة مفتوحة (المصمم: جلساته فقط، الإدارة: الكل) */
  today: (): Promise<AttendanceToday> => api<AttendanceToday>("/attendance/today"),

  /** حضور أو عودة: يبدأ جلسة جديدة منفصلة */
  async checkIn(): Promise<AttendanceSession> {
    const { session } = await api<{ session: AttendanceSession }>("/attendance/check-in", { method: "POST" });
    return session;
  },

  async checkOut(): Promise<AttendanceSession> {
    const { session } = await api<{ session: AttendanceSession }>("/attendance/check-out", { method: "POST" });
    return session;
  },

  /** حذف جلسة: لمدير النظام فقط (403 لغيره) */
  async remove(id: string): Promise<void> {
    await api<{ ok: true }>(`/attendance/${id}`, { method: "DELETE" });
  },

  /** جلسات شهر كامل لكل المستخدمين (للإدارة فقط) */
  month: (month: string): Promise<AttendanceMonth> => api<AttendanceMonth>("/attendance/month", { query: { month } }),
};
