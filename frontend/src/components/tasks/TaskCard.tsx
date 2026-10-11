import { CalendarDays, CheckCircle2, ChevronDown, ChevronLeft, ChevronRight, Clock, Copy, GripVertical, MessageSquarePlus, Minus, Pause, Pencil, Play, Plus, RotateCcw, Timer, Trash2 } from "lucide-react";
import { useState, type ReactNode } from "react";
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
  taskNumbers: Map<string, number>;
  onStart: (id: string) => void;
  onRequestStop: (id: string) => void;
  onFinish: (id: string) => void;
  onReopen: (id: string) => void;
  onMoveToDate: (task: Task) => void;
  onCopy: (task: Task) => void;
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
    <div className="task-stepper">
      <button
        type="button"
        onClick={() => onSetCurrent(task.id, task.current - 1)}
        aria-label="تقليل الإنجاز"
        title="تقليل الإنجاز"
        className="task-stepper-btn"
        disabled={task.current <= 0}
      >
        <Minus size={16} />
      </button>
      <span dir="ltr" className="min-w-16 px-1 text-center font-mono text-sm font-bold tabular-nums text-text">
        {task.current} / {task.target}
      </span>
      <button
        type="button"
        onClick={() => onSetCurrent(task.id, task.current + 1)}
        aria-label="زيادة الإنجاز"
        title="زيادة الإنجاز"
        className="task-stepper-btn"
        disabled={task.current >= task.target}
      >
        <Plus size={16} />
      </button>
    </div>
  );
}

function NumberBadge({ value, size = "md", done = false }: { value?: number; size?: "md" | "sm"; done?: boolean }) {
  if (!value) return null;
  return (
    <span
      className={"task-number" + (size === "sm" ? " task-number--sm" : "") + (done ? " task-number--done" : "")}
      title={"رقم المهمة " + value}
    >
      {value}
    </span>
  );
}

/** سجل التوقفات: بطاقة مختصرة (آخر ملاحظة) تُفتح لعرض كل التوقفات، يليها ملخص آخر توقف */
function StopNotesHistory({ task, trailing }: { task: Task; trailing?: ReactNode }) {
  const [open, setOpen] = useState(false);
  if (task.stopNotes.length === 0) return null;
  const now = Date.now();
  // توقف لم يُستكمل: يستمر عدّه فقط والمهمة متوقفة؛ وإن أُنهيت المهمة يتوقف عند وقت الإنهاء
  const pauseEnd = (stopNote: Task["stopNotes"][number]) =>
    stopNote.resumedAt ?? (task.status === "paused" ? now : (task.endTime ?? now));
  const totalPauseDuration = task.stopNotes.reduce(
    (sum, stopNote) => sum + Math.max(0, pauseEnd(stopNote) - stopNote.time),
    0
  );
  const latest = task.stopNotes[task.stopNotes.length - 1];
  const resumeLabel = (stopNote: Task["stopNotes"][number]) =>
    stopNote.resumedAt ? formatArabicTime(stopNote.resumedAt) : task.status === "paused" ? "متوقفة الآن" : "أُنهيت المهمة";

  return (
    <>
      <div className="task-stop-card mt-4">
        <button
          type="button"
          dir="ltr"
          onClick={() => setOpen((value) => !value)}
          aria-expanded={open}
          className="flex w-full items-center gap-3 text-left"
        >
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary-deep">
            <Pause size={22} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="flex items-center gap-2">
              <span className="rounded-full border border-primary-deep/30 px-2.5 py-0.5 font-mono text-sm font-bold text-text">( {task.stopNotes.length} )</span>
              <span className="text-base font-bold text-text">سجل التوقفات</span>
            </span>
            <span dir="auto" className="mt-0.5 block truncate text-sm text-muted">{latest.note}</span>
          </span>
          {open ? <ChevronDown size={20} className="shrink-0 text-muted" /> : <ChevronRight size={20} className="shrink-0 text-muted" />}
        </button>

        {open && (
          <div className="task-subtasks-enter mt-3 border-t border-border pt-3 text-xs text-text/80">
            <p className="mb-2 text-left font-mono text-[11px] text-muted" dir="ltr">إجمالي التوقف: {formatDuration(totalPauseDuration)}</p>
            <div className="space-y-2">
              {[...task.stopNotes].reverse().map((stopNote) => (
                <div key={String(stopNote.time) + stopNote.note} className="border-t border-border pt-2 first:border-t-0 first:pt-0">
                  <p className="font-medium text-text/90">{stopNote.note}</p>
                  <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-muted">
                    <span>توقف: {formatArabicTime(stopNote.time)}</span>
                    <span>{stopNote.resumedAt ? "استكمال: " + formatArabicTime(stopNote.resumedAt) : resumeLabel(stopNote)}</span>
                    <span className="font-mono text-text/80">المدة: {formatDuration(Math.max(0, pauseEnd(stopNote) - stopNote.time))}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-t border-border pt-3 text-sm text-muted">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <span className="flex items-center gap-1.5"><Timer size={16} />توقف: <span className="font-semibold text-text">{formatArabicTime(latest.time)}</span></span>
          <span className="h-4 w-px bg-border" aria-hidden />
          <span className="flex items-center gap-1.5"><Clock size={16} />استكمال: <span className="font-semibold text-text">{resumeLabel(latest)}</span></span>
          <span className="h-4 w-px bg-border" aria-hidden />
          <span className="flex items-center gap-1.5"><CalendarDays size={16} />المدة: <span className="font-mono font-semibold text-text">{formatDuration(Math.max(0, pauseEnd(latest) - latest.time))}</span></span>
        </div>
        {trailing}
      </div>
    </>
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

function SubtaskRow({ task, getSubtasks, taskNumbers, onStart, onRequestStop, onFinish, onReopen, onDelete, onEdit, onSetCurrent, onAddSubtask, onAddComment, onDeleteComment }: Pick<TaskCardProps, "getSubtasks" | "taskNumbers" | "onStart" | "onRequestStop" | "onFinish" | "onReopen" | "onDelete" | "onEdit" | "onSetCurrent" | "onAddSubtask" | "onAddComment" | "onDeleteComment"> & { task: Task }) {
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
    <div className="rounded-2xl border border-primary-deep/25 bg-primary/5 p-3.5 shadow-soft">
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
              <h4 className={"text-sm font-semibold " + (isCompleted ? "line-through text-muted" : "text-text")}><NumberBadge value={taskNumbers.get(task.id)} size="sm" done={isCompleted} />{task.title}</h4>
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
            <ProgressBar percentage={percentage} className="h-2.5" />
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
            <div className="task-subtasks-enter mt-3 space-y-3">
              {children.map((child) => (
                <SubtaskRow
                  key={child.id}
                  task={child}
                  getSubtasks={getSubtasks}
                  taskNumbers={taskNumbers}
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

export function TaskCard({ task, subtasks, getSubtasks, taskNumbers, onStart, onRequestStop, onFinish, onReopen, onMoveToDate, onCopy, onDelete, onEdit, onSetCurrent, onAddSubtask, onAddComment, onDeleteComment }: TaskCardProps) {
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
  const grip = <GripVertical size={22} aria-hidden className="shrink-0 text-muted/70" />;

  return (
    <article className={"task-card p-4 sm:p-5 " + (displayCompleted ? "opacity-70" : "")}>
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-[12rem] flex-1 items-center gap-3">
          {hasSubtasks && (
            <button
              type="button"
              onClick={() => setExpanded((value) => !value)}
              aria-label={expanded ? "إخفاء المهام الفرعية" : "إظهار المهام الفرعية"}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-control text-primary-deep hover:bg-primary/10"
            >
              {expanded ? <ChevronDown size={20} /> : <ChevronLeft size={20} />}
            </button>
          )}
          <NumberBadge value={taskNumbers.get(task.id)} done={displayCompleted} />
          <h3 className={"min-w-0 text-xl font-bold leading-snug " + (displayCompleted ? "line-through text-muted" : "text-text")}>{task.title}</h3>
        </div>
        {canManageTasks && (
          <div className="flex shrink-0 items-center gap-2">
            <button type="button" onClick={() => onCopy(task)} aria-label="نسخ إلى شخص آخر" title="نسخ إلى شخص آخر" className="task-icon-btn"><Copy size={18} /></button>
            <button type="button" onClick={() => onMoveToDate(task)} aria-label="نقل إلى يوم" title="نقل إلى يوم" className="task-icon-btn"><CalendarDays size={18} /></button>
            <button type="button" onClick={() => onEdit(task)} aria-label="تعديل المهمة" title="تعديل" className="task-icon-btn"><Pencil size={18} /></button>
            <button type="button" onClick={() => onDelete(task)} aria-label="حذف المهمة" title="حذف" className="task-icon-btn task-icon-btn--danger"><Trash2 size={18} /></button>
          </div>
        )}
      </header>

      {task.createdByName && (
        <div className="mt-3 space-y-0.5 text-sm text-muted">
          <p>أضيفت بواسطة: {task.createdByName}</p>
          <p>المسؤول: {task.assigneeName ?? "—"}</p>
        </div>
      )}
      {task.description && <p className="mt-3 text-sm leading-6 text-muted">{task.description}</p>}
      <ImageAttachmentGallery attachments={task.attachments} />

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <PriorityTag priority={task.priority} outlined className="px-3.5 py-1.5 text-sm font-semibold" />
          <span className="text-base text-text/80">{hasSubtasks ? subtasksLabel(allSubtasks.length) : statusLabels[task.status]}</span>
        </div>
        {!hasSubtasks && <ProgressControls task={task} onSetCurrent={onSetCurrent} />}
      </div>

      <div className="mt-4 flex items-center gap-3">
        <ProgressBar percentage={percentage} className="h-3.5" />
        <span className="w-12 shrink-0 text-left font-mono text-base font-bold text-text">{percentage}%</span>
      </div>

      {hasSubtasks ? (
        <div className="mt-4 border-t border-border pt-4">
          <div className="grid grid-cols-3 divide-x divide-x-reverse divide-border rounded-2xl border border-border bg-background/40">
            <div className="p-2.5 text-center">
              <p className="text-xs text-muted">المهام</p>
              <p className="font-mono font-bold text-text">{allSubtasks.length}</p>
            </div>
            <div className="p-2.5 text-center">
              <p className="text-xs text-muted">المكتملة</p>
              <p className="font-mono font-bold text-text">{completedSubtasks}</p>
            </div>
            <div className="p-2.5 text-center">
              <p className="text-xs text-muted">إجمالي الوقت</p>
              <p className="font-mono text-xs font-bold text-text">{formatDuration(subtasksDuration)}</p>
            </div>
          </div>
          <button type="button" className="task-btn task-btn--secondary mt-4" onClick={() => onAddSubtask(task)}>
            <Plus size={18} />إضافة مهمة فرعية
          </button>
        </div>
      ) : (
      <div className="mt-4 border-t border-border pt-4">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-muted">
          <span className="flex items-center gap-1.5"><Clock size={18} className="text-primary-deep" />الوقت: <span className="font-mono text-base font-bold text-text">{formatDuration(elapsed)}</span></span>
          <span>بدأت: <span className="font-semibold text-text">{formatArabicTime(task.startedAt ?? task.startTime)}</span></span>
          <span className="h-5 w-px bg-border" aria-hidden />
          <span>انتهت: <span className="font-semibold text-text">{formatArabicTime(task.endTime)}</span></span>
        </div>

        {!isCompleted && (
          <div className="mt-4">
            {isRunning ? (
              <button type="button" className="task-btn task-btn--secondary" onClick={() => onRequestStop(task.id)}><Pause size={18} />إيقاف</button>
            ) : (
              <button type="button" className="task-btn task-btn--secondary" onClick={() => onStart(task.id)}><Play size={18} />{isPaused ? "استكمال" : "بدء"}</button>
            )}
          </div>
        )}

        <div className="mt-3 flex flex-wrap items-center gap-3">
          <button type="button" className="task-btn task-btn--ghost" onClick={() => onAddSubtask(task)}><Plus size={18} />مهمة فرعية</button>
          <button type="button" className="task-btn task-btn--secondary" onClick={() => onAddComment(task.id)}><MessageSquarePlus size={18} />تعليق</button>
          {!isCompleted && (
            <button type="button" className="task-btn task-btn--primary min-w-[9rem] flex-1" onClick={() => onFinish(task.id)}>
              <ChevronRight size={16} />إنهاء المهمة<CheckCircle2 size={20} />
            </button>
          )}
          {isCompleted && (
            <button type="button" className="task-btn task-btn--secondary" onClick={() => onReopen(task.id)}><RotateCcw size={18} />إعادة فتح</button>
          )}
        </div>
      </div>
      )}

      {hasSubtasks && expanded && (
        <section className="task-subtasks-enter mt-4 space-y-3 border-t border-border pt-4">
          {subtasks.map((subtask) => (
            <SubtaskRow
              key={subtask.id}
              task={subtask}
              getSubtasks={getSubtasks}
              taskNumbers={taskNumbers}
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
        <div className="mt-4 rounded-2xl bg-primary/10 px-4 py-3 text-sm text-text/85">
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

      {!hasSubtasks && task.stopNotes.length > 0 ? (
        <StopNotesHistory task={task} trailing={grip} />
      ) : (
        <div className="mt-3 flex justify-end">{grip}</div>
      )}
    </article>
  );
}
