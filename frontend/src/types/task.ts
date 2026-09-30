export type TaskPriority = "low" | "medium" | "high";
// معرّفات المستخدمين تأتي من قاعدة البيانات (نصوص عشوائية)
export type TeamMemberId = string;
export type TaskStatus = "not_started" | "running" | "paused" | "completed";
export type UserRole = "admin" | "manager" | "designer";

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

export interface Task {
  id: string;
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
}
import type { ImageAttachment } from "./attachment";
