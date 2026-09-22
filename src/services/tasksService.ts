import type { CreateTaskInput, Task, TaskStatus, TeamMember, TeamMemberId } from "../types";
import { generateId, readStorage, writeStorage } from "../lib/storage";
import { seedTasks } from "../data/seed";
import { addDaysISO, todayISO } from "../lib/date";

const KEY = "design_team_tasks";
const LEGACY_KEY = "design_tasks";

export const teamMembers: TeamMember[] = [
  { id: "abdelrahman", name: "عبدالرحمن", role: "مصمم" },
  { id: "amr", name: "عمرو", role: "مصمم" },
  { id: "abdullah", name: "بشمهندس عبدالله", role: "مشرف الفريق" },
];

const memberIds = new Set<TeamMemberId>(teamMembers.map((member) => member.id));

type LegacyTask = Partial<Omit<Task, "status" | "startTime" | "endTime" | "stopNotes" | "comments">> & {
  status?: TaskStatus | "pending";
  startedAt?: string | number;
  startTime?: string | number;
  endTime?: string | number;
  pausedAt?: string | number;
  accumulatedDuration?: number;
  totalDuration?: number;
  sortOrder?: number;
  stopNotes?: Array<{ note?: string; time?: string | number }>;
  comments?: Array<{ text?: string; time?: string | number }>;
};

function storageHas(key: string): boolean {
  try {
    return typeof localStorage !== "undefined" && localStorage.getItem(key) !== null;
  } catch {
    return false;
  }
}

function toTimestamp(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Date.parse(value);
    return Number.isNaN(parsed) ? undefined : parsed;
  }
  return undefined;
}

function normalizeStatus(status: LegacyTask["status"]): TaskStatus {
  if (status === "pending") return "not_started";
  if (status === "running" || status === "paused" || status === "completed") return status;
  return "not_started";
}

function normalizeAssignee(assigneeId: unknown): TeamMemberId {
  return typeof assigneeId === "string" && memberIds.has(assigneeId as TeamMemberId)
    ? (assigneeId as TeamMemberId)
    : "abdelrahman";
}

function normalizeTask(task: LegacyTask, index: number): Task {
  const status = normalizeStatus(task.status);
  const accumulated = typeof task.accumulatedDuration === "number" ? task.accumulatedDuration : 0;
  const totalDuration =
    typeof task.totalDuration === "number" ? task.totalDuration : Math.max(accumulated, 0);

  return {
    id: task.id ?? generateId(`task_${index}`),
    title: task.title?.trim() || "مهمة بدون عنوان",
    description: task.description?.trim() || undefined,
    assigneeId: normalizeAssignee(task.assigneeId),
    date: task.date || todayISO(),
    priority: task.priority === "low" || task.priority === "high" ? task.priority : "medium",
    status,
    startedAt: toTimestamp(task.startedAt) ?? toTimestamp(task.startTime),
    startTime: status === "running" ? toTimestamp(task.startTime) : undefined,
    endTime: status === "completed" ? toTimestamp(task.endTime) : undefined,
    totalDuration,
    stopNotes: (task.stopNotes ?? [])
      .filter((note) => note.note?.trim())
      .map((note) => ({
        note: note.note?.trim() ?? "",
        time: toTimestamp(note.time) ?? Date.now(),
      })),
    comments: (task.comments ?? [])
      .filter((comment) => comment.text?.trim())
      .map((comment) => ({
        text: comment.text?.trim() ?? "",
        time: toTimestamp(comment.time) ?? Date.now(),
      })),
    sortOrder: typeof task.sortOrder === "number" ? task.sortOrder : index,
    createdAt: task.createdAt ?? new Date().toISOString(),
  };
}

function getInitialTasks(): Task[] {
  if (storageHas(KEY)) {
    return readStorage<LegacyTask[]>(KEY, []).map(normalizeTask);
  }

  if (storageHas(LEGACY_KEY)) {
    const migrated = readStorage<LegacyTask[]>(LEGACY_KEY, []).map(normalizeTask);
    writeStorage(KEY, migrated);
    return migrated;
  }

  writeStorage(KEY, seedTasks);
  return seedTasks;
}

function getAll(): Task[] {
  const tasks = getInitialTasks().map(normalizeTask);
  writeStorage(KEY, tasks);
  return tasks;
}

function saveAll(tasks: Task[]): void {
  writeStorage(KEY, tasks);
}

function finishTask(task: Task, now = Date.now(), sortOrder = task.sortOrder): Task {
  const runningElapsed = task.status === "running" && task.startTime ? now - task.startTime : 0;
  return {
    ...task,
    status: "completed",
    endTime: now,
    startTime: undefined,
    totalDuration: task.totalDuration + Math.max(runningElapsed, 0),
    sortOrder,
  };
}

export const tasksService = {
  list(): Task[] {
    return getAll();
  },

  create(input: CreateTaskInput): Task {
    const task: Task = {
      id: generateId("task"),
      title: input.title,
      description: input.description,
      assigneeId: input.assigneeId,
      priority: input.priority,
      date: input.date,
      status: "not_started",
      startedAt: undefined,
      startTime: undefined,
      endTime: undefined,
      totalDuration: 0,
      stopNotes: [],
      comments: [],
      sortOrder: Math.min(0, ...getAll().map((existing) => existing.sortOrder)) - 1,
      createdAt: new Date().toISOString(),
    };
    const all = [task, ...getAll()];
    saveAll(all);
    return task;
  },

  start(id: string): Task[] {
    const now = Date.now();
    const all = getAll().map((task) =>
      task.id === id
        ? {
            ...task,
            status: "running" as const,
            startedAt: task.startedAt ?? now,
            startTime: now,
            endTime: undefined,
          }
        : task
    );
    saveAll(all);
    return all;
  },

  stop(id: string, note: string): Task[] {
    const now = Date.now();
    const all = getAll().map((task) => {
      if (task.id !== id) return task;
      const elapsed = task.startTime ? now - task.startTime : 0;
      return {
        ...task,
        status: "paused" as const,
        totalDuration: task.totalDuration + Math.max(elapsed, 0),
        startTime: undefined,
        stopNotes: note.trim()
          ? [...task.stopNotes, { note: note.trim(), time: now }]
          : task.stopNotes,
      };
    });
    saveAll(all);
    return all;
  },

  finish(id: string): Task[] {
    const now = Date.now();
    const current = getAll();
    const target = current.find((task) => task.id === id);
    const bottomOrder = target
      ? Math.max(
          target.sortOrder,
          ...current
            .filter(
              (task) =>
                task.id !== id &&
                task.assigneeId === target.assigneeId &&
                task.date === target.date
            )
            .map((task) => task.sortOrder)
        ) + 1
      : 0;
    const all = current.map((task) => (task.id === id ? finishTask(task, now, bottomOrder) : task));
    saveAll(all);
    return all;
  },

  remove(id: string): Task[] {
    const all = getAll().filter((task) => task.id !== id);
    saveAll(all);
    return all;
  },

  addComment(id: string, text: string): Task[] {
    const trimmed = text.trim();
    if (!trimmed) return getAll();

    const all = getAll().map((task) =>
      task.id === id
        ? {
            ...task,
            comments: [...task.comments, { text: trimmed, time: Date.now() }],
          }
        : task
    );
    saveAll(all);
    return all;
  },

  removeComment(id: string, commentTime: number): Task[] {
    const all = getAll().map((task) =>
      task.id === id
        ? {
            ...task,
            comments: task.comments.filter((comment) => comment.time !== commentTime),
          }
        : task
    );
    saveAll(all);
    return all;
  },

  moveToMember(id: string, assigneeId: TeamMemberId, beforeTaskId?: string): Task[] {
    const current = getAll();
    const moving = current.find((task) => task.id === id);
    if (!moving) return current;

    const targetTasks = current
      .filter((task) => task.date === moving.date && task.assigneeId === assigneeId && task.id !== id)
      .sort((a, b) => a.sortOrder - b.sortOrder);
    const movedTask = { ...moving, assigneeId };
    const insertIndex = beforeTaskId
      ? targetTasks.findIndex((task) => task.id === beforeTaskId)
      : -1;

    if (insertIndex >= 0) {
      targetTasks.splice(insertIndex, 0, movedTask);
    } else {
      targetTasks.push(movedTask);
    }

    const orderMap = new Map(targetTasks.map((task, index) => [task.id, index]));
    const all = current.map((task) => {
      if (task.id === id) {
        return { ...task, assigneeId, sortOrder: orderMap.get(id) ?? task.sortOrder };
      }

      if (orderMap.has(task.id)) {
        return { ...task, sortOrder: orderMap.get(task.id)! };
      }

      return task;
    });

    saveAll(all);
    return all;
  },

  reorder(orderedIds: string[]): Task[] {
    const orderMap = new Map(orderedIds.map((id, index) => [id, index]));
    const all = getAll().map((task) =>
      orderMap.has(task.id) ? { ...task, sortOrder: orderMap.get(task.id)! } : task
    );
    saveAll(all);
    return all;
  },

  moveUnfinishedToNextDay(date: string): Task[] {
    const all = getAll();
    const nextDate = addDaysISO(date, 1);
    const nextOrders = new Map<TeamMemberId, number>();

    teamMembers.forEach((member) => {
      const maxOrder = Math.max(
        -1,
        ...all
          .filter((task) => task.date === nextDate && task.assigneeId === member.id)
          .map((task) => task.sortOrder)
      );
      nextOrders.set(member.id, maxOrder);
    });

    const moved = all
      .filter((task) => task.date === date && task.status !== "completed")
      .sort((a, b) => a.sortOrder - b.sortOrder);
    const movedOrders = new Map(moved.map((task) => {
      const lastOrder = nextOrders.get(task.assigneeId) ?? -1;
      const nextOrder = lastOrder + 1;
      nextOrders.set(task.assigneeId, nextOrder);
      return [task.id, nextOrder];
    }));

    const updated = all.map((task) =>
      movedOrders.has(task.id)
        ? { ...task, date: nextDate, sortOrder: movedOrders.get(task.id)! }
        : task
    );

    saveAll(updated);
    return updated;
  },

  reset(): Task[] {
    saveAll(seedTasks);
    return seedTasks;
  },
};
