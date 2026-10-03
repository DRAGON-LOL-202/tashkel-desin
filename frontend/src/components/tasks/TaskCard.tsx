import { CheckCircle2, ChevronDown, ChevronLeft, Clock, MessageSquarePlus, Minus, Pause, Pencil, Play, Plus, RotateCcw, Trash2 } from "lucide-react";
import { useState } from "react";
import type { Task } from "../../types";
import { calculateParentProgress, calculateTaskProgress } from "../../lib/taskProgress";
import { formatArabicTime, formatDuration } from "../../lib/date";
import { getTaskElapsed, useElapsed } from "../../hooks/useTaskTimer";
import { Button } from "../ui/Button";
import { IconButton } from "../ui/IconButton";
import { PriorityTag } from "../ui/Badge";
import { ProgressBar } from "../ui/ProgressBar";
import { ImageAttachmentGallery } from "../ui/ImageAttachments";
import { usePermissions } from "../../hooks/usePermissions";

interface TaskCardProps {
  task: Task;
  subtasks: Task[];
  getSubtasks: (parentId: string) => Task[];
  onStart: (id: string) => void;
  onRequestStop: (id: string) => void;
  onFinish: (id: string) => void;
  onReopen: (id: string) => void;
  onDelete: (task: Task) => void;
  onEdit: (task: Task) => void;
  onSetCurrent: (id: string, current: number) => void;
  onAddSubtask: (task: Task) => void;
  onAddComment: (id: string) => void;
  onDeleteComment: (id: string, commentTime: number) => void;
}

const statusLabels = {
  not_started: "لم تبدأ",
  running: "قيد التنفيذ",
  paused: "متوقفة",
  completed: "مكتملة",
};

function ProgressControls({ task, onSetCurrent }: { task: Task; onSetCurrent: (id: string, current: number) => void }) {
  return (
    <div className="flex items-center gap-1.5">
      <IconButton
        onClick={() => onSetCurrent(task.id, task.current - 1)}
        aria-label="تقليل الإنجاز"
        title="تقليل الإنجاز"
        className="h-7 w-7"
        disabled={task.current <= 0}
      >
        <Minus size={14} />
      </IconButton>
      <span className="min-w-16 text-center font-mono text-xs font-semibold tabular-nums text-text">
        {task.current} / {task.target}
      </span>
      <IconButton
        onClick={() => onSetCurrent(task.id, task.current + 1)}
        aria-label="زيادة الإنجاز"
        title="زيادة الإنجاز"
        className="h-7 w-7"
        disabled={task.current >= task.target}
      >
        <Plus size={14} />
      </IconButton>
    </div>
  );
}

function StopNotesHistory({ task }: { task: Task }) {
  if (task.stopNotes.length === 0) return null;
  const now = Date.now();
  // توقف لم يُستكمل: يستمر عدّه فقط والمهمة متوقفة؛ وإن أُنهيت المهمة يتوقف عند وقت الإنهاء
  const pauseEnd = (stopNote: Task["stopNotes"][number]) =>
    stopNote.resumedAt ?? (task.status === "paused" ? now : (task.endTime ?? now));
  const totalPauseDuration = task.stopNotes.reduce(
    (sum, stopNote) => sum + Math.max(0, pauseEnd(stopNote) - stopNote.time),
    0
  );

  return (
    <div className="mt-3 rounded-control bg-operational/10 px-3 py-2 text-xs text-text/80">
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <p className="font-semibold text-operational">سجل التوقفات ({task.stopNotes.length})</p>
        <span className="font-mono text-[10px] text-operational">إجمالي التوقف: {formatDuration(totalPauseDuration)}</span>
      </div>
      <div className="space-y-1.5">
        {[...task.stopNotes].reverse().map((stopNote) => (
          <div key={String(stopNote.time) + stopNote.note} className="border-t border-operational/15 pt-1.5 first:border-t-0 first:pt-0">
            <p className="font-medium text-text/90">{stopNote.note}</p>
            <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-muted">
              <span>توقف: {formatArabicTime(stopNote.time)}</span>
              <span>{stopNote.resumedAt
                  ? "استكمال: " + formatArabicTime(stopNote.resumedAt)
                  : task.status === "paused"
                    ? "متوقفة الآن"
                    : "أُنهيت المهمة"}</span>
              <span className="font-mono text-text/80">المدة: {formatDuration(Math.max(0, pauseEnd(stopNote) - stopNote.time))}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function getAllSubtasks(parentId: string, getSubtasks: (parentId: string) => Task[]): Task[] {
  const directSubtasks = getSubtasks(parentId);
  return directSubtasks.flatMap((subtask) => [subtask, ...getAllSubtasks(subtask.id, getSubtasks)]);
}

/** صياغة عربية صحيحة لعدد المهام الفرعية (1 ← مهمة فرعية واحدة، 2 ← مهمتان، 3-10 ← مهام، 11+ ← مهمة) */
function subtasksLabel(count: number): string {
  if (count === 1) return "مهمة فرعية واحدة";
  if (count === 2) return "مهمتان فرعيتان";
  if (count <= 10) return `${count} مهام فرعية`;
  return `${count} مهمة فرعية`;
}

function SubtaskRow({ task, getSubtasks, onStart, onRequestStop, onFinish, onReopen, onDelete, onEdit, onSetCurrent, onAddSubtask, onAddComment, onDeleteComment }: Pick<TaskCardProps, "getSubtasks" | "onStart" | "onRequestStop" | "onFinish" | "onReopen" | "onDelete" | "onEdit" | "onSetCurrent" | "onAddSubtask" | "onAddComment" | "onDeleteComment"> & { task: Task }) {
  const [expanded, setExpanded] = useState(false);
  const { canManageTasks, canDeleteComment } = usePermissions();
  const elapsed = useElapsed(task);
  const isCompleted = task.status === "completed";
  const isRunning = task.status === "running";
  const isPaused = task.status === "paused";
  const children = getSubtasks(task.id);
  const hasChildren = children.length > 0;
  const percentage = hasChildren ? calculateParentProgress(children) : calculateTaskProgress(task);

  return (
    <div className="border-r border-border pr-3 py-3">
      <div className="flex items-start gap-2">
        <button
          type="button"
          onClick={() => !isCompleted && onFinish(task.id)}
          aria-label="إنهاء المهمة الفرعية"
          className={"mt-0.5 h-5 w-5 shrink-0 rounded-full border-2 flex items-center justify-center " + (isCompleted ? "border-primary-dark bg-primary-dark text-background" : "border-muted/40 hover:border-primary-deep")}
        >
          {isCompleted && <CheckCircle2 size={13} />}
        </button>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <h4 className={"text-sm font-semibold " + (isCompleted ? "line-through text-muted" : "text-text")}>{task.title}</h4>
              {task.description && <p className="mt-1 text-xs leading-5 text-muted">{task.description}</p>}
              <ImageAttachmentGallery attachments={task.attachments} />
              {task.createdByName && (
                <p className="mt-1 text-[11px] text-muted">أضيفت بواسطة: {task.createdByName} · المسؤول: {task.assigneeName ?? "—"}</p>
              )}
            </div>
            {canManageTasks && (
            <div className="flex shrink-0 items-center gap-1">
              <IconButton onClick={() => onEdit(task)} aria-label="تعديل المهمة الفرعية" title="تعديل" className="h-7 w-7"><Pencil size={14} /></IconButton>
              <IconButton onClick={() => onDelete(task)} aria-label="حذف المهمة الفرعية" title="حذف" className="h-7 w-7"><Trash2 size={14} /></IconButton>
            </div>
            )}
          </div>
          <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted">{hasChildren ? subtasksLabel(children.length) : statusLabels[task.status]}</span>
              {hasChildren && (
                <button type="button" onClick={() => setExpanded((value) => !value)} className="text-primary-deep" aria-label={expanded ? "إخفاء المهام الفرعية" : "إظهار المهام الفرعية"}>
                  {expanded ? <ChevronDown size={16} /> : <ChevronLeft size={16} />}
                </button>
              )}
            </div>
            {!hasChildren && <ProgressControls task={task} onSetCurrent={onSetCurrent} />}
          </div>
          <div className="mt-2 flex items-center gap-3">
            <ProgressBar percentage={percentage} />
            <span className="w-11 shrink-0 text-left font-mono text-xs font-bold text-text">{percentage}%</span>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted">
            <span className="flex items-center gap-1.5"><Clock size={13} />الوقت: <span className="font-mono font-semibold text-text">{formatDuration(elapsed)}</span></span>
            <span>بدأت: {formatArabicTime(task.startedAt ?? task.startTime)}</span>
            <span>انتهت: {formatArabicTime(task.endTime)}</span>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {!isCompleted && (
              isRunning
                ? <Button size="sm" variant="secondary" icon={<Pause size={14} />} onClick={() => onRequestStop(task.id)}>إيقاف</Button>
                : <Button size="sm" variant="secondary" icon={<Play size={14} />} onClick={() => onStart(task.id)}>{isPaused ? "استكمال" : "بدء"}</Button>
            )}
            <Button size="sm" variant="ghost" icon={<Plus size={14} />} onClick={() => onAddSubtask(task)}>مهمة فرعية</Button>
            <Button size="sm" variant="secondary" icon={<MessageSquarePlus size={14} />} onClick={() => onAddComment(task.id)}>تعليق</Button>
            {!isCompleted && <Button size="sm" variant="primary" onClick={() => onFinish(task.id)}>إنهاء المهمة</Button>}
            {isCompleted && <Button size="sm" variant="secondary" icon={<RotateCcw size={14} />} onClick={() => onReopen(task.id)}>إعادة فتح</Button>}
          </div>
          {hasChildren && expanded && (
            <div className="task-subtasks-enter mt-3">
              {children.map((child) => (
                <SubtaskRow
                  key={child.id}
                  task={child}
                  getSubtasks={getSubtasks}
                  onStart={onStart}
                  onRequestStop={onRequestStop}
                  onFinish={onFinish}
                  onReopen={onReopen}
                  onDelete={onDelete}
                  onEdit={onEdit}
                  onSetCurrent={onSetCurrent}
                  onAddSubtask={onAddSubtask}
                  onAddComment={onAddComment}
                  onDeleteComment={onDeleteComment}
                />
              ))}
            </div>
          )}
          {task.comments.length > 0 && (
            <div className="mt-3 border-t border-border pt-2 text-xs text-text/85">
              <p className="mb-1 font-semibold text-primary-deep">تعليقات ({task.comments.length})</p>
              {task.comments.map((comment) => (
                <div key={String(comment.time) + comment.text} className="flex items-start justify-between gap-2 py-1.5">
                  <p className="min-w-0 break-words">
{comment.userName && <span className="ml-1.5 font-semibold text-primary-deep">{comment.userName}:</span>}
{comment.text}
</p>
                  {canDeleteComment(comment.userId) && (
                    <button type="button" onClick={() => onDeleteComment(task.id, comment.time)} className="text-muted hover:text-problem" aria-label="حذف التعليق">
                    <Trash2 size={13} />
                  </button>
                  )}
                </div>
              ))}
            </div>
          )}
          <StopNotesHistory task={task} />
        </div>
      </div>
    </div>
  );
}

export function TaskCard({ task, subtasks, getSubtasks, onStart, onRequestStop, onFinish, onReopen, onDelete, onEdit, onSetCurrent, onAddSubtask, onAddComment, onDeleteComment }: TaskCardProps) {
  const [expanded, setExpanded] = useState(false);
  const { canManageTasks, canDeleteComment } = usePermissions();
  const elapsed = useElapsed(task);
  const isCompleted = task.status === "completed";
  const isRunning = task.status === "running";
  const isPaused = task.status === "paused";
  const hasSubtasks = subtasks.length > 0;
  const allSubtasks = hasSubtasks ? getAllSubtasks(task.id, getSubtasks) : [];
  const completedSubtasks = allSubtasks.filter((subtask) => subtask.status === "completed").length;
  const subtasksDuration = allSubtasks.reduce((sum, subtask) => sum + getTaskElapsed(subtask), 0);
  const percentage = hasSubtasks ? calculateParentProgress(subtasks) : calculateTaskProgress(task);
  const displayCompleted = hasSubtasks ? percentage >= 100 : isCompleted;

  return (
    <article className={"rounded-control border border-border bg-surface p-3.5 shadow-soft transition-all " + (displayCompleted ? "opacity-70" : "hover:shadow-pop")}>
      <div className="flex items-start gap-3">
        {hasSubtasks ? (
          <button
            type="button"
            onClick={() => setExpanded((value) => !value)}
            aria-label={expanded ? "إخفاء المهام الفرعية" : "إظهار المهام الفرعية"}
            className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-control text-primary-deep hover:bg-primary/10"
          >
            {expanded ? <ChevronDown size={18} /> : <ChevronLeft size={18} />}
          </button>
        ) : (
          <button
            type="button"
            onClick={() => !isCompleted && onFinish(task.id)}
            aria-label="إنهاء المهمة"
            className={"mt-1 h-5 w-5 shrink-0 rounded-full border-2 flex items-center justify-center " + (isCompleted ? "border-primary-dark bg-primary-dark text-background" : "border-muted/40 hover:border-primary-deep")}
          >
            {isCompleted && <CheckCircle2 size={13} />}
          </button>
        )}

        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <h3 className={"text-[15px] font-semibold leading-snug " + (displayCompleted ? "line-through text-muted" : "text-text")}>{task.title}</h3>
              {task.description && <p className="mt-1 text-xs leading-5 text-muted">{task.description}</p>}
              <ImageAttachmentGallery attachments={task.attachments} />
              {task.createdByName && (
                <p className="mt-1 text-[11px] text-muted">أضيفت بواسطة: {task.createdByName} · المسؤول: {task.assigneeName ?? "—"}</p>
              )}
            </div>
            {canManageTasks && (
            <div className="flex shrink-0 items-center gap-1">
              <IconButton onClick={() => onEdit(task)} aria-label="تعديل المهمة" title="تعديل" className="h-7 w-7"><Pencil size={14} /></IconButton>
              <IconButton onClick={() => onDelete(task)} aria-label="حذف المهمة" title="حذف" className="h-7 w-7"><Trash2 size={14} /></IconButton>
            </div>
            )}
          </div>

          <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <PriorityTag priority={task.priority} />
              <span className="text-xs text-muted">{hasSubtasks ? subtasksLabel(allSubtasks.length) : statusLabels[task.status]}</span>
            </div>
            {!hasSubtasks && <ProgressControls task={task} onSetCurrent={onSetCurrent} />}
          </div>

          <div className="mt-3 flex items-center gap-3">
            <ProgressBar percentage={percentage} />
            <span className="w-11 shrink-0 text-left font-mono text-sm font-bold text-text">{percentage}%</span>
          </div>
        </div>
      </div>

      {hasSubtasks ? (
        <div className="mt-3 border-t border-border pt-3">
          <div className="grid grid-cols-3 divide-x divide-x-reverse divide-border rounded-control border border-border bg-background/40">
            <div className="p-2 text-center">
              <p className="text-xs text-muted">المهام</p>
              <p className="font-mono font-bold text-text">{allSubtasks.length}</p>
            </div>
            <div className="p-2 text-center">
              <p className="text-xs text-muted">المكتملة</p>
              <p className="font-mono font-bold text-text">{completedSubtasks}</p>
            </div>
            <div className="p-2 text-center">
              <p className="text-xs text-muted">إجمالي الوقت</p>
              <p className="font-mono text-xs font-bold text-text">{formatDuration(subtasksDuration)}</p>
            </div>
          </div>
          <Button size="sm" className="mt-3" icon={<Plus size={14} />} onClick={() => onAddSubtask(task)}>
            إضافة مهمة فرعية
          </Button>
        </div>
      ) : (
      <div className="mt-3 border-t border-border pt-3">
        <div className="grid grid-cols-1 gap-2 text-xs text-muted sm:grid-cols-3">
          <span className="flex items-center gap-1.5"><Clock size={13} />الوقت: <span className="font-mono font-semibold text-text">{formatDuration(elapsed)}</span></span>
          <span>بدأت: {formatArabicTime(task.startedAt ?? task.startTime)}</span>
          <span>انتهت: {formatArabicTime(task.endTime)}</span>
        </div>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
          {!isCompleted ? (
            isRunning ? <Button size="sm" variant="secondary" icon={<Pause size={14} />} onClick={() => onRequestStop(task.id)}>إيقاف</Button>
              : <Button size="sm" variant="secondary" icon={<Play size={14} />} onClick={() => onStart(task.id)}>{isPaused ? "استكمال" : "بدء"}</Button>
          ) : <span />}
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" variant="ghost" icon={<Plus size={14} />} onClick={() => onAddSubtask(task)}>مهمة فرعية</Button>
            <Button size="sm" variant="secondary" icon={<MessageSquarePlus size={14} />} onClick={() => onAddComment(task.id)}>تعليق</Button>
            {!isCompleted && <Button size="sm" variant="primary" onClick={() => onFinish(task.id)}>إنهاء المهمة</Button>}
            {isCompleted && <Button size="sm" variant="secondary" icon={<RotateCcw size={14} />} onClick={() => onReopen(task.id)}>إعادة فتح</Button>}
          </div>
        </div>
      </div>
      )}

      {hasSubtasks && expanded && (
        <section className="task-subtasks-enter mt-4 border-t border-border pt-2">
          {subtasks.map((subtask) => (
            <SubtaskRow
              key={subtask.id}
              task={subtask}
              getSubtasks={getSubtasks}
              onStart={onStart}
              onRequestStop={onRequestStop}
              onFinish={onFinish}
              onReopen={onReopen}
              onDelete={onDelete}
              onEdit={onEdit}
              onSetCurrent={onSetCurrent}
              onAddSubtask={onAddSubtask}
              onAddComment={onAddComment}
              onDeleteComment={onDeleteComment}
            />
          ))}
        </section>
      )}

      {!hasSubtasks && task.comments.length > 0 && (
        <div className="mt-3 rounded-control bg-primary/10 px-3 py-2 text-xs text-text/85">
          <p className="mb-2 font-semibold text-primary-deep">تعليقات ({task.comments.length})</p>
          {task.comments.map((comment) => (
            <div key={String(comment.time) + comment.text} className="flex items-start justify-between gap-2 border-t border-primary/15 py-2 first:border-t-0 first:pt-0">
              <p className="min-w-0 break-words">
{comment.userName && <span className="ml-1.5 font-semibold text-primary-deep">{comment.userName}:</span>}
{comment.text}
</p>
              {canDeleteComment(comment.userId) && (
                <button type="button" onClick={() => onDeleteComment(task.id, comment.time)} className="text-muted hover:text-problem" aria-label="حذف التعليق"><Trash2 size={13} /></button>
              )}
            </div>
          ))}
        </div>
      )}
      {!hasSubtasks && <StopNotesHistory task={task} />}
    </article>
  );
}
