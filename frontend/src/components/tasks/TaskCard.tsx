import {
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  Clock,
  Copy,
  GripVertical,
  Layers,
  MessageSquare,
  MessageSquarePlus,
  Minus,
  Move,
  Pause,
  Pencil,
  Play,
  Plus,
  RotateCcw,
  Timer,
  Trash2,
} from "lucide-react";
import { useState, type ReactNode } from "react";
import type { Task, TimerAction } from "../../types";
import { calculateParentProgress, calculateTaskProgress } from "../../lib/taskProgress";
import { formatArabicTime, formatDuration } from "../../lib/date";
import { getTaskElapsed, useElapsed } from "../../hooks/useTaskTimer";
import { TaskTimerPanel } from "./TaskTimerPanel";
import { TaskActionsMenu, type TaskMenuItem } from "./TaskActionsMenu";
import { Button } from "../ui/Button";
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
  onTimer: (id: string, action: TimerAction) => void;
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
        <Minus size={15} />
      </button>
      <span dir="ltr" className="min-w-14 px-1 text-center font-mono text-xs font-bold tabular-nums text-text">
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
        <Plus size={15} />
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
      <div className="task-stop-card mt-2">
        <button
          type="button"
          dir="ltr"
          onClick={() => setOpen((value) => !value)}
          aria-expanded={open}
          className="flex w-full items-center gap-3 text-left"
        >
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary-deep">
            <Pause size={17} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="flex items-center gap-2">
              <span className="rounded-full border border-primary-deep/30 px-2 font-mono text-xs font-bold text-text">( {task.stopNotes.length} )</span>
              <span className="text-sm font-bold text-text">سجل التوقفات</span>
            </span>
            <span dir="auto" className="block truncate text-xs text-muted">{latest.note}</span>
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

      <div className="mt-2 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 border-t border-border pt-2 text-xs text-muted">
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

function SubtaskRow({
  task,
  getSubtasks,
  taskNumbers,
  onStart,
  onRequestStop,
  onFinish,
  onReopen,
  onDelete,
  onEdit,
  onSetCurrent,
  onAddSubtask,
  onAddComment,
  onDeleteComment,
  onTimer,
}: Pick<
  TaskCardProps,
  | "getSubtasks"
  | "taskNumbers"
  | "onStart"
  | "onRequestStop"
  | "onFinish"
  | "onReopen"
  | "onDelete"
  | "onEdit"
  | "onSetCurrent"
  | "onAddSubtask"
  | "onAddComment"
  | "onDeleteComment"
  | "onTimer"
> & { task: Task }) {
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
    <div className="rounded-xl border border-primary-deep/25 bg-primary/5 p-2.5">
      <div className="flex items-start gap-2">
        <button
          type="button"
          onClick={() => (isCompleted ? onReopen(task.id) : onFinish(task.id))}
          aria-label={isCompleted ? "إعادة فتح المهمة الفرعية" : "إنهاء المهمة الفرعية"}
          className={
            "mt-0.5 h-5 w-5 shrink-0 rounded-full border-2 flex items-center justify-center transition-colors " +
            (isCompleted ? "border-primary-dark bg-primary-dark text-background" : "border-muted/40 hover:border-primary-deep")
          }
        >
          {isCompleted && <CheckCircle2 size={13} />}
        </button>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <h4 className={"text-sm font-semibold " + (isCompleted ? "line-through text-muted" : "text-text")}>
                <NumberBadge value={taskNumbers.get(task.id)} size="sm" done={isCompleted} />
                {task.title}
              </h4>
              {task.description && <p className="mt-1 text-xs leading-5 text-muted">{task.description}</p>}
              <ImageAttachmentGallery attachments={task.attachments} />
              {task.createdByName && (
                <p className="mt-1 text-[11px] text-muted">
                  أضيفت بواسطة: {task.createdByName} · المسؤول: {task.assigneeName ?? "—"}
                </p>
              )}
            </div>
            {canManageTasks && (
              <div className="flex shrink-0 items-center">
                <TaskActionsMenu
                  label="إجراءات المهمة الفرعية"
                  buttonClassName="tc-ico !h-7 !w-7"
                  items={[
                    { key: "edit", label: "تعديل المهمة", icon: <Pencil size={16} />, onSelect: () => onEdit(task) },
                    { key: "delete", label: "حذف المهمة", icon: <Trash2 size={16} />, onSelect: () => onDelete(task), danger: true },
                  ]}
                />
              </div>
            )}
          </div>
          <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted">{hasChildren ? subtasksLabel(children.length) : statusLabels[task.status]}</span>
              {hasChildren && (
                <button
                  type="button"
                  onClick={() => setExpanded((value) => !value)}
                  className="text-primary-deep"
                  aria-label={expanded ? "إخفاء المهام الفرعية" : "إظهار المهام الفرعية"}
                >
                  {expanded ? <ChevronDown size={16} /> : <ChevronLeft size={16} />}
                </button>
              )}
            </div>
            {!hasChildren && <ProgressControls task={task} onSetCurrent={onSetCurrent} />}
          </div>
          <div className="mt-2 flex items-center gap-3">
            <ProgressBar percentage={percentage} className="h-2" />
            <span className="w-11 shrink-0 text-left font-mono text-xs font-bold text-text" dir="ltr">
              {percentage}%
            </span>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted">
            <span className="flex items-center gap-1.5">
              <Clock size={13} />
              الوقت: <span className="font-mono font-semibold text-text" dir="ltr">{formatDuration(elapsed)}</span>
            </span>
            <span>بدأت: {formatArabicTime(task.startedAt ?? task.startTime)}</span>
            <span>انتهت: {formatArabicTime(task.endTime)}</span>
          </div>
          <TaskTimerPanel task={task} onAction={onTimer} />
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {!isCompleted &&
              (isRunning ? (
                <Button size="sm" variant="secondary" icon={<Pause size={14} />} onClick={() => onRequestStop(task.id)}>
                  إيقاف
                </Button>
              ) : (
                <Button size="sm" variant="secondary" icon={<Play size={14} />} onClick={() => onStart(task.id)}>
                  {isPaused ? "استكمال" : "بدء"}
                </Button>
              ))}
            <Button size="sm" variant="ghost" icon={<Plus size={14} />} onClick={() => onAddSubtask(task)}>
              مهمة فرعية
            </Button>
            <Button size="sm" variant="secondary" icon={<MessageSquarePlus size={14} />} onClick={() => onAddComment(task.id)}>
              تعليق
            </Button>
            {!isCompleted && (
              <Button size="sm" variant="primary" onClick={() => onFinish(task.id)}>
                إنهاء المهمة
              </Button>
            )}
            {isCompleted && (
              <Button size="sm" variant="secondary" icon={<RotateCcw size={14} />} onClick={() => onReopen(task.id)}>
                إعادة فتح
              </Button>
            )}
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
                  onTimer={onTimer}
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
                    <button
                      type="button"
                      onClick={() => onDeleteComment(task.id, comment.time)}
                      className="text-muted hover:text-problem"
                      aria-label="حذف التعليق"
                    >
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

type CardState = "not_started" | "running" | "paused" | "completed" | "idle";

const priorityLabels = { low: "منخفضة", medium: "متوسطة", high: "عالية" } as const;

export function TaskCard({
  task,
  subtasks,
  getSubtasks,
  taskNumbers,
  onStart,
  onRequestStop,
  onFinish,
  onReopen,
  onMoveToDate,
  onCopy,
  onDelete,
  onEdit,
  onSetCurrent,
  onAddSubtask,
  onAddComment,
  onDeleteComment,
  onTimer,
}: TaskCardProps) {
  const [expanded, setExpanded] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
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
  const clampedPct = Math.max(0, Math.min(100, percentage));
  const displayCompleted = hasSubtasks ? percentage >= 100 : isCompleted;

  // للمهمة الأم ذات المهام الفرعية: نشتق حالة التشغيل/التوقف الفعالة من مهامها الفرعية إن وُجدت
  const runningSubtask = hasSubtasks ? allSubtasks.find((s) => s.status === "running") : undefined;
  const pausedSubtask = hasSubtasks ? allSubtasks.find((s) => s.status === "paused") : undefined;
  const leafSubtasks = hasSubtasks ? allSubtasks.filter((s) => getSubtasks(s.id).length === 0) : [];
  const nextOpenSubtask = leafSubtasks.find((s) => s.status === "paused") ?? leafSubtasks.find((s) => s.status !== "completed");

  const effectiveRunning = hasSubtasks ? Boolean(runningSubtask) : isRunning;
  const effectivePaused = hasSubtasks
    ? !effectiveRunning && !displayCompleted && (Boolean(pausedSubtask) || percentage > 0 || subtasksDuration > 0)
    : isPaused;

  const cardState: CardState = displayCompleted
    ? "completed"
    : effectiveRunning
      ? "running"
      : effectivePaused
        ? "paused"
        : "not_started";

  const displayDuration = hasSubtasks ? subtasksDuration : elapsed;

  // الإجراءات في قائمة الثلاث نقاط (تحافظ على كل الإجراءات الأساسية + إضافة مهمة فرعية)
  const menuItems: TaskMenuItem[] = [
    { key: "edit", label: "تعديل المهمة", icon: <Pencil size={16} />, onSelect: () => onEdit(task) },
    { key: "subtask", label: "إضافة مهمة فرعية", icon: <Plus size={16} />, onSelect: () => onAddSubtask(task) },
    { key: "move", label: "نقل المهمة", icon: <Move size={16} />, onSelect: () => onMoveToDate(task) },
    { key: "copy", label: "نسخ (كوبي)", icon: <Copy size={16} />, onSelect: () => onCopy(task) },
    { key: "delete", label: "حذف المهمة", icon: <Trash2 size={16} />, onSelect: () => onDelete(task), danger: true },
  ];

  const hasStopNotes = task.stopNotes.length > 0;
  const hasComments = task.comments.length > 0;
  const hasAttachments = Boolean(task.attachments && task.attachments.length > 0);
  const hasDetails = Boolean(task.createdByName || task.description || hasAttachments || hasStopNotes || hasComments);

  const handlePlayPause = () => {
    if (hasSubtasks) {
      if (runningSubtask) {
        onRequestStop(runningSubtask.id);
      } else if (nextOpenSubtask) {
        onStart(nextOpenSubtask.id);
      } else {
        setExpanded((v) => !v);
      }
      return;
    }
    if (isCompleted) {
      onReopen(task.id);
      return;
    }
    if (isRunning) {
      onRequestStop(task.id);
    } else {
      onStart(task.id);
    }
  };

  const handleFinishOrReopen = () => {
    if (hasSubtasks) {
      if (!displayCompleted && runningSubtask) {
        onFinish(runningSubtask.id);
      } else if (!displayCompleted && nextOpenSubtask) {
        onFinish(nextOpenSubtask.id);
      } else {
        setExpanded((v) => !v);
      }
      return;
    }
    if (isCompleted) {
      onReopen(task.id);
    } else {
      onFinish(task.id);
    }
  };

  const playPauseLabel = effectiveRunning
    ? "إيقاف المهمة"
    : displayCompleted
      ? "إعادة فتح المهمة"
      : effectivePaused
        ? "استكمال المهمة"
        : "بدء المهمة";

  return (
    <article className={"tc-card tc-card--" + cardState} data-status={cardState}>
      {/* الشريط الملون الجانبي لحالة المهمة */}
      <span className={"tc-edge tc-edge--" + cardState} aria-hidden />

      {/* الصف الأفقي الرئيسي (مطابق للتصميم المرجعي) */}
      <div className="tc-row">
        {/* القسم الأيمن: كبسولة المهام الفرعية + أيقونة وعنوان المهمة */}
        <div className="tc-right">
          <div className="tc-subtasks-group">
            <button
              type="button"
              onClick={() => (hasSubtasks ? setExpanded((value) => !value) : onAddSubtask(task))}
              aria-expanded={hasSubtasks ? expanded : undefined}
              title={hasSubtasks ? (expanded ? "إخفاء المهام الفرعية" : "إظهار المهام الفرعية") : "إضافة مهمة فرعية"}
              className={"tc-subtasks-pill" + (hasSubtasks && expanded ? " tc-subtasks-pill--open" : "")}
            >
              <Layers size={14} className="shrink-0" aria-hidden />
              <span>المهام الفرعية ({allSubtasks.length})</span>
              {hasSubtasks && (
                <ChevronDown
                  size={13}
                  className={"shrink-0 transition-transform duration-200 " + (expanded ? "rotate-180" : "")}
                  aria-hidden
                />
              )}
            </button>
            <button
              type="button"
              onClick={() => onAddSubtask(task)}
              title="إضافة مهمة فرعية"
              aria-label="إضافة مهمة فرعية"
              className="tc-subtask-add-mini"
            >
              <Plus size={13} />
            </button>
          </div>

          <div className="tc-titlebox">
            <ClipboardList size={18} className="tc-clip-ico" aria-hidden />
            <span className="tc-order-num">
              <NumberBadge value={taskNumbers.get(task.id)} size="sm" done={displayCompleted} />
            </span>
            <h3 className={"tc-title " + (displayCompleted ? "tc-title--done" : "")}>{task.title}</h3>
            <span className="tc-prio" title={"الأولوية: " + priorityLabels[task.priority]}>
              <PriorityTag priority={task.priority} outlined className="text-[11px] font-semibold" />
            </span>
          </div>
        </div>

        <span className="tc-sep" aria-hidden />

        {/* القسم الأوسط: شريط التقدم + النسبة المئوية */}
        <div className="tc-center">
          <div className="tc-bar-track" role="progressbar" aria-valuenow={clampedPct} aria-valuemin={0} aria-valuemax={100}>
            <div
              className={"tc-bar-fill" + (clampedPct >= 100 ? " tc-bar-fill--done" : "")}
              style={{ width: `${clampedPct}%` }}
            />
          </div>
          <span className={"tc-pct" + (clampedPct >= 100 ? " tc-pct--done" : "")} dir="ltr">
            {clampedPct}%
          </span>
        </div>

        <span className="tc-sep" aria-hidden />

        {/* القسم الأيسر: الوقت + تشغيل/إيقاف + إنهاء + التعليقات + القائمة */}
        <div className="tc-left">
          <span className="tc-timer-pill" dir="ltr" title="الوقت المنقضي">
            {formatDuration(displayDuration)}
          </span>

          <button
            type="button"
            onClick={handlePlayPause}
            aria-label={playPauseLabel}
            title={playPauseLabel}
            className={"tc-play-circle" + (effectiveRunning ? " tc-play-circle--running" : "")}
          >
            {effectiveRunning ? (
              <Pause size={16} fill="currentColor" />
            ) : (
              <Play size={16} fill="currentColor" className="translate-x-[1px]" />
            )}
          </button>

          {!hasSubtasks && isCompleted ? (
            <button
              type="button"
              onClick={handleFinishOrReopen}
              className="tc-finish-pill tc-finish-pill--reopen"
              title="إعادة فتح المهمة"
            >
              <span>إعادة فتح</span>
              <RotateCcw size={14} />
            </button>
          ) : (
            <button
              type="button"
              onClick={handleFinishOrReopen}
              className={"tc-finish-pill" + (displayCompleted ? " tc-finish-pill--done" : "")}
              title={displayCompleted ? "المهمة مكتملة" : "إنهاء المهمة"}
            >
              <span>إنهاء</span>
              <CheckCircle2 size={15} />
            </button>
          )}

          <button
            type="button"
            onClick={() => onAddComment(task.id)}
            aria-label="إضافة تعليق"
            title={`التعليقات (${task.comments.length}) — اضغط لإضافة تعليق`}
            className="tc-comment-btn"
          >
            <MessageSquare size={17} />
            <span
              className={"tc-comment-badge" + (task.comments.length > 0 ? " tc-comment-badge--active" : "")}
              dir="ltr"
            >
              {task.comments.length}
            </span>
          </button>

          {canManageTasks && (
            <div className="tc-icons">
              <TaskActionsMenu items={menuItems} buttonClassName="tc-more-btn" />
            </div>
          )}

          <GripVertical size={16} aria-hidden className="tc-grip" />
        </div>
      </div>

      {/* الشريط الثانوي المدمج: يحافظ على عداد الإنجاز (+/-) والمؤقت التنازلي وأوقات البدء/الانتهاء وزر التفاصيل */}
      <div className="tc-subbar">
        <div className="tc-subbar-meta">
          {hasSubtasks ? (
            <>
              <span className="tc-meta-item">
                المكتملة: <strong className="tc-val">{completedSubtasks} / {allSubtasks.length}</strong>
              </span>
              {subtasksDuration > 0 && (
                <span className="tc-meta-item">
                  إجمالي الفرعيات: <strong className="tc-val font-mono" dir="ltr">{formatDuration(subtasksDuration)}</strong>
                </span>
              )}
            </>
          ) : (
            <>
              <span className="tc-meta-item">
                بدأت: <strong className="tc-val">{formatArabicTime(task.startedAt ?? task.startTime)}</strong>
              </span>
              <span className="tc-meta-item">
                انتهت: <strong className="tc-val">{formatArabicTime(task.endTime)}</strong>
              </span>
            </>
          )}

          {hasDetails && (
            <button
              type="button"
              className="tc-details-link"
              onClick={() => setDetailsOpen((value) => !value)}
              aria-expanded={detailsOpen}
            >
              <ChevronDown size={14} className={"tc-chev " + (detailsOpen ? "rotate-180" : "")} aria-hidden />
              <span>{detailsOpen ? "إخفاء التفاصيل" : "عرض التفاصيل"}</span>
              {hasComments && <span className="tc-chip">تعليقات {task.comments.length}</span>}
              {hasStopNotes && <span className="tc-chip">توقفات {task.stopNotes.length}</span>}
            </button>
          )}
        </div>

        {!hasSubtasks && (
          <div className="tc-subbar-tools">
            <TaskTimerPanel task={task} onAction={onTimer} />
            <ProgressControls task={task} onSetCurrent={onSetCurrent} />
          </div>
        )}
      </div>

      {/* قسم التفاصيل القابل للطي (وصف، مرفقات، مسؤول، تعليقات، سجل التوقفات) */}
      {hasDetails && detailsOpen && (
        <section className="tc-details task-subtasks-enter">
          {task.createdByName && (
            <div className="tc-meta">
              <p>أضيفت بواسطة: {task.createdByName}</p>
              <p>المسؤول: {task.assigneeName ?? "—"}</p>
            </div>
          )}
          {task.description && <p className="tc-desc">{task.description}</p>}
          <ImageAttachmentGallery attachments={task.attachments} />

          {hasComments && (
            <div className="tc-panel">
              <p className="tc-panel-title">تعليقات ({task.comments.length})</p>
              {task.comments.map((comment) => (
                <div key={String(comment.time) + comment.text} className="tc-comment">
                  <p className="min-w-0 break-words">
                    {comment.userName && <span className="tc-comment-user">{comment.userName}:</span>}
                    {comment.text}
                  </p>
                  {canDeleteComment(comment.userId) && (
                    <button
                      type="button"
                      onClick={() => onDeleteComment(task.id, comment.time)}
                      className="text-muted hover:text-problem"
                      aria-label="حذف التعليق"
                    >
                      <Trash2 size={13} />
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}

          {hasStopNotes && <StopNotesHistory task={task} />}
        </section>
      )}

      {/* قسم المهام الفرعية القابل للطي */}
      {hasSubtasks && expanded && (
        <section className="task-subtasks-enter mt-2.5 space-y-2 border-t border-border/80 pt-2.5">
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
              onTimer={onTimer}
            />
          ))}
        </section>
      )}
    </article>
  );
}
