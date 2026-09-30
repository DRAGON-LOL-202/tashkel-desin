import { api } from "../lib/api";
import type { CreateGoalInput, Goal } from "../types";

interface GoalResponse {
  goal: Goal;
}

/** نفس معادلة الـ backend (goalProgress) — تُستخدم للعرض السريع بدون طلب */
export function getGoalProgress(goal: Pick<Goal, "current" | "target">): number {
  if (!goal.target) return 0;
  return Math.min(100, Math.max(0, Math.round((goal.current / goal.target) * 100)));
}

// الأهداف للإدارة فقط (المصمم يحصل على 403 من الـ backend). قواعد الحالة تُطبَّق في الـ backend.
export const goalsService = {
  async list(): Promise<Goal[]> {
    const { goals } = await api<{ goals: Goal[] }>("/goals");
    return goals;
  },

  async create(input: CreateGoalInput): Promise<Goal> {
    const { goal } = await api<GoalResponse>("/goals", { method: "POST", body: input });
    return goal;
  },

  async update(id: string, input: Partial<CreateGoalInput>): Promise<Goal> {
    const { goal } = await api<GoalResponse>(`/goals/${id}`, { method: "PATCH", body: input });
    return goal;
  },

  async remove(id: string): Promise<void> {
    await api<{ ok: true }>(`/goals/${id}`, { method: "DELETE" });
  },
};
