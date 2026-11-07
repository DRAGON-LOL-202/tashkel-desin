export type TaskPriority = "low" | "medium" | "high";
// معرّفات المستخدمين تأتي من قاعدة البيانات (نصوص عشوائية)
export type TeamMemberId = string;
/** لوحة المهام: التصميم (المهام اليومية) أو الإنتاج */
export type TaskBoard = "design" | "production";
export type TaskStatus = "not_started" | "running" | "paused" | "completed";
export type UserRole =
  | "admin"
  | "manager"
  | "designer"
  | "packer"
  | "operator"
  | "sales_flagger"
  | "sales_editor"
  | "sales_supervisor";
/** وصول المستخدم للمخزون: بلا وصول / السحب فقط / كامل (الإدارة كامل دائماً، وتعبئة/مشغل سحب فقط) */
export type InventoryAccessLevel = "none" | "withdraw" | "full";

export interface StopNote {
  note: string;
  time: number;
  resumedAt?: number;
}

export interface TaskComment {
  id?: string;
  text: string;
  time: number;
  userId?: string;
  userName?: string;
}

/** مؤقت تنازلي لمهمة. remainingMs محسوب عند serverNow؛ الواجهة تنقص منه ما مرّ منذ استلام الرد. */
export interface TaskTimerState {
  status: "pending" | "running" | "paused" | "expired";
  plannedMs: number;
  remainingMs: number;
  serverNow: number;
  expiresAt?: number;
}

export type TimerAction =
  | { type: "start"; minutes?: number }
  | { type: "pause" }
  | { type: "resume" }
  | { type: "extend"; minutes: number }
  | { type: "cancel" };

export interface Task {
  id: string;
  board?: TaskBoard;
  parentId?: string;
  title: string;
  description?: string;
  attachments?: ImageAttachment[];
  target: number;
  current: number;
  assigneeId: TeamMemberId;
  assigneeName?: string;
  createdById?: string;
  createdByName?: string;
  date: string;
  priority: TaskPriority;
  status: TaskStatus;
  startedAt?: number;
  startTime?: number;
  endTime?: number;
  totalDuration: number;
  stopNotes: StopNote[];
  comments: TaskComment[];
  sortOrder: number;
  createdAt: string;
  timer?: TaskTimerState;
}

export interface TeamMember {
  id: TeamMemberId;
  name: string;
  /** المسمى الوظيفي (jobTitle) للعرض */
  role: string;
  accessRole: UserRole;
  email: string;
  username: string;
  isActive: boolean;
  isSystemUser: boolean;
  inventoryAccess: InventoryAccessLevel;
  /** يظهر له كرت في لوحة المهام */
  showTaskCard: boolean;
  /** يظهر له كرت في لوحة «مهام إنتاج» */
  showProductionCard: boolean;
  /** المجموعات الرئيسية المسموح السحب منها (تعبئة/مشغل فقط) */
  allowedGroupIds?: string[];
}

export interface CreateTaskInput {
  parentId?: string;
  title: string;
  description?: string;
  attachments?: ImageAttachment[];
  target: number;
  current: number;
  assigneeId: TeamMemberId;
  priority: TaskPriority;
  date: string;
  /** مدة مخططة بالدقائق (إنشاء فقط): ينشئ مؤقتاً معلّقاً يبدأ مع تشغيل المهمة */
  plannedMinutes?: number;
  /** لوحة المهمة (الافتراضي: design) */
  board?: TaskBoard;
  /** الرقم المطلوب للمهمة بين أشقائها (يبدأ من 1)؛ يُعالَج في الواجهة عبر reorder */
  position?: number;
}
import type { ImageAttachment } from "./attachment";

/** لون يوم في التقويم: أحمر (يوجد أوردر غير مكتمل) أو أخضر (كل أوردرات اليوم مكتملة) */
export type CalendarDateState = "completed" | "pending";

/** وقت العمل في يوم لموظف واحد (من GET /tasks/stats/time) — المدة بالميلي ثانية */
export interface DailyTimeStat {
  date: string;
  assigneeId: TeamMemberId;
  durationMs: number;
}
