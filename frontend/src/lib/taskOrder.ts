import type { Task } from "../types";

/** ترتيب الأشقاء (نفس اليوم + نفس المسؤول + نفس الأب) حسب sortOrder ثم وقت الإنشاء */
export function compareBySortOrder(a: Task, b: Task): number {
  const byOrder = a.sortOrder - b.sortOrder;
  if (byOrder !== 0) return byOrder;
  return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
}

export function getSiblings(tasks: Task[], scope: { date: string; assigneeId: string; parentId?: string }): Task[] {
  const parentId = scope.parentId || undefined;
  return tasks
    .filter((task) => task.date === scope.date && task.assigneeId === scope.assigneeId && (task.parentId || undefined) === parentId)
    .sort(compareBySortOrder);
}

/**
 * رقم كل مهمة داخل مجموعتها: المهام الرئيسية للمسؤول في اليوم تبدأ من 1،
 * وكل مهمة رئيسية لها ترقيم فرعي مستقل يبدأ من 1 أيضاً.
 * يُحسب من القائمة الكاملة (قبل الفلترة/البحث) حتى لا يتغير الرقم عند الفلترة.
 */
export function buildNumberMap(tasks: Task[]): Map<string, number> {
  const groups = new Map<string, Task[]>();
  tasks.forEach((task) => {
    const key = `${task.date}|${task.assigneeId}|${task.parentId ?? ""}`;
    const list = groups.get(key);
    if (list) list.push(task);
    else groups.set(key, [task]);
  });
  const numbers = new Map<string, number>();
  groups.forEach((list) => {
    list.sort(compareBySortOrder).forEach((task, index) => numbers.set(task.id, index + 1));
  });
  return numbers;
}

/** يُدخل المعرّف في الموضع المطلوب (يبدأ من 1) ويزيح ما بعده خطوة واحدة */
export function insertAtPosition(ids: string[], id: string, position: number): string[] {
  const result = ids.filter((existing) => existing !== id);
  const index = Math.min(Math.max(Math.floor(position) - 1, 0), result.length);
  result.splice(index, 0, id);
  return result;
}
