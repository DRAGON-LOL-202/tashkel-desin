import { serializeAttachments } from "./attachments.js";

// تحويل صف Task (مع العلاقات) إلى الشكل الذي تتوقعه الواجهة (src/types/task.ts).
// المدد بالميلي ثانية، والحالة/الأولوية بحروف صغيرة. totalDuration يُحسب من TaskTimeLog ولا يُخزَّن.

export const taskInclude = {
  timeLogs: { orderBy: { startTime: "asc" as const } },
  comments: { orderBy: { createdAt: "asc" as const }, include: { user: { select: { id: true, name: true } } } },
  assignedTo: { select: { id: true, name: true } },
  createdBy: { select: { id: true, name: true } },
};

interface TaskRow {
  id: string;
  parentId: string | null;
  title: string;
  description: string | null;
  attachments: unknown;
  target: number;
  current: number;
  priority: string;
  status: string;
  date: string;
  sortOrder: number;
  startedAt: Date | null;
  endTime: Date | null;
  createdAt: Date;
  createdById: string;
  assignedToId: string;
  timeLogs: { startTime: Date; stopTime: Date | null; stopReason: string | null }[];
  comments: { text: string; createdAt: Date; userId: string; id: string; user: { id: string; name: string } }[];
  assignedTo: { id: string; name: string };
  createdBy: { id: string; name: string };
}

export function serializeTask(t: TaskRow) {
  const logs = t.timeLogs;
  const totalDuration = logs.reduce((sum, l) => (l.stopTime ? sum + Math.max(l.stopTime.getTime() - l.startTime.getTime(), 0) : sum), 0);
  const openLog = logs.find((l) => !l.stopTime);

  // ملاحظات الإيقاف: كل سجل مُوقَف بسبب، و resumedAt = بداية السجل التالي
  const stopNotes = logs.flatMap((l, i) =>
    l.stopTime && l.stopReason
      ? [{ note: l.stopReason, time: l.stopTime.getTime(), ...(logs[i + 1] ? { resumedAt: logs[i + 1].startTime.getTime() } : {}) }]
      : []
  );

  return {
    id: t.id,
    parentId: t.parentId ?? undefined,
    title: t.title,
    description: t.description ?? undefined,
    attachments: serializeAttachments(t.attachments),
    target: t.target,
    current: t.current,
    assigneeId: t.assignedToId,
    assigneeName: t.assignedTo.name,
    createdById: t.createdById,
    createdByName: t.createdBy.name,
    date: t.date,
    priority: t.priority.toLowerCase(),
    status: t.status.toLowerCase(),
    startedAt: t.startedAt?.getTime(),
    startTime: t.status === "RUNNING" && openLog ? openLog.startTime.getTime() : undefined,
    endTime: t.endTime?.getTime(),
    totalDuration,
    stopNotes,
    comments: t.comments.map((c) => ({ id: c.id, text: c.text, time: c.createdAt.getTime(), userId: c.userId, userName: c.user.name })),
    sortOrder: t.sortOrder,
    createdAt: t.createdAt.toISOString(),
  };
}
