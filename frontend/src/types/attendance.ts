/** جلسة حضور: من حضور/عودة إلى انصراف. الأوقات بالميلي ثانية، و endTime = null تعني جلسة مفتوحة. */
export interface AttendanceSession {
  id: string;
  userId: string;
  /** يوم بداية الجلسة (yyyy-MM-dd): تُنسب إليه كلها حتى لو عبرت منتصف الليل */
  workDate: string;
  startTime: number;
  endTime: number | null;
}

export interface AttendanceToday {
  /** اليوم الحالي بتوقيت الخادم (Africa/Cairo افتراضياً) */
  today: string;
  sessions: AttendanceSession[];
}

export interface AttendanceMonth {
  month: string;
  today: string;
  sessions: AttendanceSession[];
}
