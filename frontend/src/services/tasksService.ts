import { api } from "../lib/api";
import { toAttachmentPayload } from "../lib/attachments";
import type { CreateTaskInput, Task, TeamMemberId } from "../types";

interface TaskResponse {
  task: Task;
}

export function isTaskTreeCompleted(tasks: Task[], task: Task): boolean {
  const subtasks = tasks.filter((candidate) => candidate.parentId === task.id);
  return subtasks.length > 0 ? subtasks.every((subtask) => isTaskTreeCompleted(tasks, subtask)) : task.status === "completed";
}

function getTaskTreeIds(tasks: Task[], rootId: string): Set<string> {
  const ids = new Set([rootId]);
  let hasNewDescendant = true;
  while (hasNewDescendant) {
    hasNewDescendant = false;
    tasks.forEach((task) => {
      if (task.parentId && ids.has(task.parentId) && !ids.has(task.id)) {
        ids.add(task.id);
        hasNewDescendant = true;
      }
    });
  }
  return ids;
}

/**
 * تحديث فوري (optimistic) لإعادة الترتيب أثناء السحب. الـ backend هو المصدر الحقيقي؛
 * تُعاد المزامنة من الخادم بعد كل عملية، وتُسترجع الحالة الحقيقية إن فشل الطلب.
 */
export function applyReorder(tasks: Task[], orderedIds: string[]): Task[] {
  const orderMap = new Map(orderedIds.map((id, index) => [id, index]));
  return tasks.map((task) => (orderMap.has(task.id) ? { ...task, sortOrder: orderMap.get(task.id)! } : task));
}

export function applyMoveToMember(tasks: Task[], id: string, assigneeId: TeamMemberId, beforeTaskId?: string): Task[] {
  const moving = tasks.find((task) => task.id === id);
  if (!moving) return tasks;
  const movingTreeIds = getTaskTreeIds(tasks, id);

  const targetTasks = tasks
    .filter(
      (task) =>
        task.date === moving.date &&
        task.assigneeId === assigneeId &&
        !movingTreeIds.has(task.id) &&
        task.parentId === moving.parentId
    )
    .sort((a, b) => a.sortOrder - b.sortOrder);
  const insertIndex = beforeTaskId ? targetTasks.findIndex((task) => task.id === beforeTaskId) : -1;
  const movedTask = { ...moving, assigneeId };
  if (insertIndex >= 0) targetTasks.splice(insertIndex, 0, movedTask);
  else targetTasks.push(movedTask);

  const orderMap = new Map(targetTasks.map((task, index) => [task.id, index]));
  return tasks.map((task) => {
    if (task.id === id) return { ...task, assigneeId, sortOrder: orderMap.get(id) ?? task.sortOrder };
    if (movingTreeIds.has(task.id)) return { ...task, assigneeId };
    if (orderMap.has(task.id)) return { ...task, sortOrder: orderMap.get(task.id)! };
    return task;
  });
}

function taskBody(input: CreateTaskInput) {
  return {
    title: input.title,
    description: input.description ?? "",
    attachments: (input.attachments ?? []).map(toAttachmentPayload),
    target: input.target,
    current: input.current,
    priority: input.priority,
  };
}

export const tasksService = {
  /** المصمم يحصل من الـ backend على مهامه فقط؛ الإدارة على كل المهام */
  async list(): Promise<Task[]> {
    const { tasks } = await api<{ tasks: Task[] }>("/tasks");
    return tasks;
  },

  async create(input: CreateTaskInput): Promise<Task> {
    const { task } = await api<TaskResponse>("/tasks", {
      method: "POST",
      body: {
        ...taskBody(input),
        date: input.date,
        assigneeId: input.assigneeId,
        parentId: input.parentId,
      },
    });
    return task;
  },

  async update(id: string, input: CreateTaskInput): Promise<Task> {
    const { task } = await api<TaskResponse>(`/tasks/${id}`, { method: "PATCH", body: taskBody(input) });
    return task;
  },

  async setCurrent(id: string, current: number): Promise<Task> {
    const { task } = await api<TaskResponse>(`/tasks/${id}/progress`, { method: "PATCH", body: { current } });
    return task;
  },

  async start(id: string): Promise<Task> {
    const { task } = await api<TaskResponse>(`/tasks/${id}/start`, { method: "POST" });
    return task;
  },

  async stop(id: string, note: string): Promise<Task> {
    const { task } = await api<TaskResponse>(`/tasks/${id}/stop`, { method: "POST", body: { note: note.trim() } });
    return task;
  },

  async finish(id: string): Promise<Task> {
    const { task } = await api<TaskResponse>(`/tasks/${id}/end`, { method: "POST" });
    return task;
  },

  async reopen(id: string): Promise<Task> {
    const { task } = await api<TaskResponse>(`/tasks/${id}/reopen`, { method: "POST" });
    return task;
  },

  async remove(id: string): Promise<void> {
    await api<{ ok: true }>(`/tasks/${id}`, { method: "DELETE" });
  },

  async addComment(id: string, text: string): Promise<Task> {
    const { task } = await api<TaskResponse>(`/tasks/${id}/comments`, { method: "POST", body: { text: text.trim() } });
    return task;
  },

  async removeComment(id: string, commentId: string): Promise<Task> {
    const { task } = await api<TaskResponse>(`/tasks/${id}/comments/${commentId}`, { method: "DELETE" });
    return task;
  },

  /** للإدارة فقط */
  async moveToMember(id: string, assigneeId: TeamMemberId, beforeTaskId?: string): Promise<Task> {
    const { task } = await api<TaskResponse>(`/tasks/${id}/move`, { method: "POST", body: { assigneeId, beforeTaskId } });
    return task;
  },

  async reorder(orderedIds: string[]): Promise<void> {
    await api<{ ok: true }>("/tasks/reorder", { method: "POST", body: { orderedIds } });
  },

  /** للإدارة فقط. يعيد عدد الجذور المنقولة */
  async moveUnfinishedToNextDay(date: string): Promise<number> {
    const { moved } = await api<{ moved: number }>("/tasks/move-unfinished", { method: "POST", body: { date } });
    return moved;
  },
};
