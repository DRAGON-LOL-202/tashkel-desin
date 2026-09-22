import type { CreateGoalInput, Goal, GoalStatus, GoalType } from "../types";
import { generateId, readStorage, writeStorage } from "../lib/storage";
import { seedGoals } from "../data/seed";
import { addDaysISO, todayISO } from "../lib/date";

const KEY = "design_goals";

type LegacyGoal = Partial<Omit<Goal, "createdAt">> & {
  createdAt?: string | number;
};

const goalTypes = new Set<GoalType>(["weekly", "monthly", "quarterly"]);
const goalStatuses = new Set<GoalStatus>(["not_started", "in_progress", "completed", "paused"]);

function storageHas(key: string): boolean {
  try {
    return typeof localStorage !== "undefined" && localStorage.getItem(key) !== null;
  } catch {
    return false;
  }
}

function toCreatedAt(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Date.parse(value);
    if (!Number.isNaN(parsed)) return parsed;
  }
  return Date.now();
}

export function getGoalProgress(goal: Pick<Goal, "current" | "target">): number {
  if (!goal.target) return 0;
  return Math.min(100, Math.max(0, Math.round((goal.current / goal.target) * 100)));
}

function inferStatus(goal: LegacyGoal): GoalStatus {
  if (goal.status && goalStatuses.has(goal.status)) return goal.status;
  if ((goal.current ?? 0) >= (goal.target ?? 1)) return "completed";
  if ((goal.current ?? 0) > 0) return "in_progress";
  return "not_started";
}

function defaultEndDate(type: GoalType, startDate: string): string {
  if (type === "weekly") return addDaysISO(startDate, 6);
  if (type === "monthly") return addDaysISO(startDate, 29);
  return addDaysISO(startDate, 89);
}

function normalizeGoal(goal: LegacyGoal, index: number): Goal {
  const type = goal.type && goalTypes.has(goal.type) ? goal.type : "weekly";
  const target = Math.max(Number(goal.target) || 1, 1);
  const current = Math.max(Number(goal.current) || 0, 0);
  const startDate = goal.startDate || todayISO();
  const normalized: Goal = {
    id: goal.id ?? generateId(`goal_${index}`),
    title: goal.title?.trim() || "هدف بدون عنوان",
    description: goal.description?.trim() || undefined,
    type,
    target,
    current,
    startDate,
    endDate: goal.endDate || defaultEndDate(type, startDate),
    status: inferStatus({ ...goal, target, current }),
    createdAt: toCreatedAt(goal.createdAt),
  };

  if (normalized.current >= normalized.target) {
    normalized.status = "completed";
  }

  return normalized;
}

function getAll(): Goal[] {
  const goals = storageHas(KEY) ? readStorage<LegacyGoal[]>(KEY, []) : seedGoals;
  const normalized = goals.map(normalizeGoal);
  writeStorage(KEY, normalized);
  return normalized;
}

function saveAll(items: Goal[]): void {
  writeStorage(KEY, items);
}

function normalizeInput(input: CreateGoalInput): CreateGoalInput {
  const target = Math.max(Number(input.target) || 1, 1);
  const current = Math.max(Number(input.current) || 0, 0);
  return {
    ...input,
    target,
    current,
    status: current >= target ? "completed" : input.status,
  };
}

export const goalsService = {
  list(): Goal[] {
    return getAll();
  },

  create(input: CreateGoalInput): Goal[] {
    const normalized = normalizeInput(input);
    const item: Goal = {
      id: generateId("goal"),
      title: normalized.title,
      description: normalized.description,
      type: normalized.type,
      target: normalized.target,
      current: normalized.current,
      startDate: normalized.startDate,
      endDate: normalized.endDate,
      status: normalized.status,
      createdAt: Date.now(),
    };
    const all = [item, ...getAll()];
    saveAll(all);
    return all;
  },

  update(id: string, input: Partial<CreateGoalInput>): Goal[] {
    const all = getAll().map((goal) => {
      if (goal.id !== id) return goal;
      const next = normalizeGoal({ ...goal, ...input }, 0);
      return {
        ...next,
        id: goal.id,
        createdAt: goal.createdAt,
      };
    });
    saveAll(all);
    return all;
  },

  remove(id: string): Goal[] {
    const all = getAll().filter((goal) => goal.id !== id);
    saveAll(all);
    return all;
  },
};
