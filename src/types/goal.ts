export type GoalType = "weekly" | "monthly" | "quarterly";
export type GoalStatus = "not_started" | "in_progress" | "completed" | "paused";

export interface Goal {
  id: string;
  title: string;
  description?: string;
  type: GoalType;
  target: number;
  current: number;
  startDate: string;
  endDate: string;
  status: GoalStatus;
  createdAt: number;
}

export interface CreateGoalInput {
  title: string;
  description?: string;
  type: GoalType;
  target: number;
  current: number;
  startDate: string;
  endDate: string;
  status: GoalStatus;
}
