export type TaskPriority = "low" | "medium" | "high";
export type TeamMemberId = "abdelrahman" | "amr" | "abdullah";
export type TaskStatus = "not_started" | "running" | "paused" | "completed";

export interface StopNote {
  note: string;
  time: number;
}

export interface TaskComment {
  text: string;
  time: number;
}

export interface Task {
  id: string;
  title: string;
  description?: string;
  assigneeId: TeamMemberId;
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
  role: string;
}

export interface CreateTaskInput {
  title: string;
  description?: string;
  assigneeId: TeamMemberId;
  priority: TaskPriority;
  date: string;
}
