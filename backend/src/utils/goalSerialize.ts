import type { Prisma } from "../generated/prisma/client.ts";

export const goalInclude = {
  createdBy: { select: { id: true, name: true } },
} satisfies Prisma.GoalInclude;

export type GoalWithRefs = Prisma.GoalGetPayload<{ include: typeof goalInclude }>;

// نفس معادلة الواجهة (getGoalProgress): نسبة مئوية مقرَّبة بين 0 و100.
export function goalProgress(g: { current: number; target: number }): number {
  if (!g.target) return 0;
  return Math.min(100, Math.max(0, Math.round((g.current / g.target) * 100)));
}

const DEFAULT_SPAN_DAYS = { WEEKLY: 6, MONTHLY: 29, QUARTERLY: 89 } as const;

export function addDaysISO(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function defaultEndDate(type: keyof typeof DEFAULT_SPAN_DAYS, startDate: string): string {
  return addDaysISO(startDate, DEFAULT_SPAN_DAYS[type]);
}

type GoalStatusValue = "NOT_STARTED" | "IN_PROGRESS" | "COMPLETED" | "PAUSED";

// القواعد: current >= target ← COMPLETED دائماً. حالة صريحة (غير COMPLETED) تُحترم.
// COMPLETED يدوياً وهو أقل من الهدف ← IN_PROGRESS. بدون حالة صريحة: PAUSED تبقى PAUSED،
// وغير ذلك تُشتق من التقدّم (>0 ← IN_PROGRESS، وإلا NOT_STARTED).
export function resolveGoalStatus(opts: {
  current: number;
  target: number;
  requested?: GoalStatusValue;
  previous?: GoalStatusValue;
}): GoalStatusValue {
  const { current, target, requested, previous } = opts;
  if (current >= target) return "COMPLETED";
  if (requested === "COMPLETED") return "IN_PROGRESS";
  if (requested) return requested;
  if (previous === "PAUSED") return "PAUSED";
  return current > 0 ? "IN_PROGRESS" : "NOT_STARTED";
}

export function serializeGoal(g: GoalWithRefs) {
  return {
    id: g.id,
    title: g.title,
    description: g.description ?? undefined,
    type: g.type.toLowerCase() as "weekly" | "monthly" | "quarterly",
    target: g.target,
    current: g.current,
    progress: goalProgress(g),
    startDate: g.startDate,
    endDate: g.endDate,
    status: g.status.toLowerCase() as "not_started" | "in_progress" | "completed" | "paused",
    createdById: g.createdById,
    createdByName: g.createdBy.name,
    createdAt: g.createdAt.getTime(),
    updatedAt: g.updatedAt.toISOString(),
  };
}
