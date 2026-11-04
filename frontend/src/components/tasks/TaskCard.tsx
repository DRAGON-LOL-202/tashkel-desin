import { AlarmClock, CalendarDays, CheckCircle2, ChevronDown, ChevronLeft, ChevronRight, ClipboardList, Clock, Copy, Layers, MessageSquarePlus, Minus, Pause, Pencil, Play, Plus, RotateCcw, Timer, Trash2 } from "lucide-react";
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

function SubtaskRow({ task, getSubtasks, taskNumbers, onStart, onRequestStop, onFinish, onReopen, onDelete, onEdit, onSetCurrent, onAddSubtask, onAddComment, onDeleteComment, onTimer }: Pick<TaskCardProps, "getSubtasks" | "taskNumbers" | "onStart" | "onRequestStop" | "onFinish" | "onReopen" | "onDelete" | "onEdit" | "onSetCurrent" | "onAddSubtask" | "onAddComment" | "onDeleteComment" | "onTimer"> & { task: Task }) {
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
                <button type="button" onClick={() => setExpanded((value) => !value)} className="text-primary-deep" aria-label={expanded ? "إخفاء المهام الفرعية" : "إظهار المهام الفرعية"}>
                  {expanded ? <ChevronDown size={16} /> : <ChevronLeft size={16} />}
                </button>
              )}
            </div>
            {!hasChildren && <ProgressControls task={task} onSetCurrent={onSetCurrent} />}
          </div>
          <div className="mt-2 flex items-center gap-3">
            <ProgressBar percentage={percentage} className="h-2" />
            <span className="w-11 shrink-0 text-left font-mono text-xs font-bold text-text">{percentage}%</span>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted">
            <span className="flex items-center gap-1.5"><Clock size={13} />الوقت: <span className="font-mono font-semibold text-text">{formatDuration(elapsed)}</span></span>
            <span>بدأت: {formatArabicTime(task.startedAt ?? task.startTime)}</span>
            <span>انتهت: {formatArabicTime(task.endTime)}</span>
          </div>
          <TaskTimerPanel task={task} onAction={onTimer} />
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

type CardState = "not_started" | "running" | "paused" | "completed" | "idle";

/** حالة البطاقة تُشتق دائمًا من task.status الحقيقية (لا حالة بصرية مستقلة) */
const stateLabels: Record<CardState, string> = {
  not_started: "لم تبدأ",
  running: "جارية الآن",
  paused: "متوقفة",
  completed: "مكتملة",
  idle: "",
};

const priorityLabels = { low: "منخفضة", medium: "متوسطة", high: "عالية" } as const;

/**
 * بطاقة المهمة بصفّ واحد (مطابقة للتصميم المرجعي):
 * [المهام الفرعية] [أيقونة + العنوان] | [النسبة + شريط التقدم] [الوقت] [تشغيل/إيقاف] [إنهاء] [تعليق] [⋮]
 * شريط ملوّن على الحافة يدل على الحالة. في العرض الضيق (جوال) ينكسر الصف إلى سطرين تلقائيًا.
 */
export function TaskCard({ task, subtasks, getSubtasks, taskNumbers, onStart, onRequestStop, onFinish, onReopen, onMoveToDate, onCopy, onDelete, onEdit, onSetCurrent, onAddSubtask, onAddComment, onDeleteComment, onTimer }: TaskCardProps) {
  const [expanded, setExpanded] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const { canManageTasks, canDeleteComment } = usePermissions();
  const elapsed = useElapsed(task);
  const isCompleted = task.status === "completed";
  const isRunning = task.status === "running";
  const isPaused = task.status === "paused";
  const hasSubtasks = subtasks.length > 0;
  const allSubtasks = hasSubtasks ? getAllSubtasks(task.id, getSubtasks) : [];
  const subtasksDuration = allSubtasks.reduce((sum, subtask) => sum + getTaskElapsed(subtask), 0);
  const percentage = hasSubtasks ? calculateParentProgress(subtasks) : calculateTaskProgress(task);
  const displayCompleted = hasSubtasks ? percentage >= 100 : isCompleted;

  // المهمة الأم لا تعرض حالة تشغيل (كما كان سابقًا)؛ تظهر فقط "مكتملة" عند 100%
  const cardState: CardState = hasSubtasks ? (displayCompleted ? "completed" : "idle") : task.status;
  const progressColor = cardState === "running" ? "var(--primary-dark)" : cardState === "paused" ? "var(--operational)" : undefined;

  const hasStopNotes = !hasSubtasks && task.stopNotes.length > 0;
  const hasComments = !hasSubtasks && task.comments.length > 0;
  const hasAttachments = Boolean(task.attachments && task.attachments.length > 0);
  const hasTimer = !hasSubtasks && !isCompleted && Boolean(task.timer);
  const canAddTimer = !hasSubtasks && !isCompleted && !task.timer;
  const hasDetails = Boolean(task.createdByName || task.description || hasAttachments || hasStopNotes || hasComments);
  const showDetails = detailsOpen && (hasDetails || canAddTimer);

  // الإجراءات الثانوية تظهر عند الضغط على الثلاث نقاط فقط
  const menuItems: TaskMenuItem[] = [
    { key: "edit", label: "تعديل المهمة", icon: <Pencil size={16} />, onSelect: () => onEdit(task) },
    ...(canAddTimer ? [{ key: "timer", label: "مؤقت تنازلي", icon: <AlarmClock size={16} />, onSelect: () => setDetailsOpen(true) }] : []),
    { key: "move", label: "نقل المهمة", icon: <CalendarDays size={16} />, onSelect: () => onMoveToDate(task) },
    { key: "copy", label: "نسخ (كوبي)", icon: <Copy size={16} />, onSelect: () => onCopy(task) },
    { key: "delete", label: "حذف المهمة", icon: <Trash2 size={16} />, onSelect: () => onDelete(task), danger: true },
  ];

  const subLabel = hasSubtasks ? "المهام الفرعية" : "مهمة فرعية";
  const playLabel = isRunning ? "إيقاف" : isPaused ? "استكمال" : "بدء";

  return (
    <article className={"tc-card tr-card tc-card--" + cardState} data-status={cardState}>
      <div className="tr-row">
        {/* 1) المهام الفرعية: تفتح القائمة إن وُجدت، وإلا تضيف مهمة فرعية */}
        <button
          type="button"
          className={"tr-sub" + (hasSubtasks ? "" : " tr-sub--add")}
          onClick={() => (hasSubtasks ? setExpanded((value) => !value) : onAddSubtask(task))}
          aria-expanded={hasSubtasks ? expanded : undefined}
          aria-label={hasSubtasks ? (expanded ? "إخفاء المهام الفرعية" : "إظهار المهام الفرعية") : "إضافة مهمة فرعية"}
          title={hasSubtasks ? subtasksLabel(allSubtasks.length) : "إضافة مهمة فرعية"}
        >
          {hasSubtasks ? <Layers size={15} aria-hidden /> : <Plus size={15} aria-hidden />}
          <span className="tr-sub-label">{subLabel}</span>
          {hasSubtasks && <span className="tr-sub-count" dir="ltr">({allSubtasks.length})</span>}
          {hasSubtasks && <ChevronDown size={14} aria-hidden className={"tr-sub-chev" + (expanded ? " is-open" : "")} />}
        </button>

        {/* 2) أيقونة + رقم + عنوان المهمة (الضغط عليه يعرض التفاصيل إن وُجدت) */}
        <div className="tr-main">
          <ClipboardList size={19} aria-hidden className="tr-clip" />
          <NumberBadge value={taskNumbers.get(task.id)} size="sm" done={displayCompleted} />
          <button
            type="button"
            className={"tr-title" + (displayCompleted ? " tc-title--done" : "")}
            onClick={() => hasDetails && setDetailsOpen((value) => !value)}
            aria-expanded={hasDetails ? detailsOpen : undefined}
            title={hasDetails ? (detailsOpen ? "إخفاء التفاصيل" : "عرض التفاصيل") : task.title}
            disabled={!hasDetails}
          >
            {task.title}
          </button>
          <span className="tc-prio" title={"الأولوية: " + priorityLabels[task.priority]}>
            <PriorityTag priority={task.priority} outlined className="text-xs font-semibold" />
          </span>
          {hasStopNotes && (
            <span className="tr-badge" title={"توقفات: " + task.stopNotes.length}><Pause size={11} aria-hidden />{task.stopNotes.length}</span>
          )}
          {cardState !== "idle" && cardState !== "not_started" && (
            <span className={"tr-state tr-state--" + cardState} role="status">
              {cardState === "completed" ? <CheckCircle2 size={13} aria-hidden /> : <span className="tc-dot" aria-hidden />}
              <span className="tr-state-label">{stateLabels[cardState]}</span>
            </span>
          )}
        </div>

        {/* 3) النسبة + شريط التقدم (مع − / + لعدّاد الإنجاز) */}
        <div className="tr-prog">
          <span className="tr-pct" dir="ltr">{percentage}%</span>
          {!hasSubtasks && (
            <button
              type="button"
              className="tr-step"
              onClick={() => onSetCurrent(task.id, task.current - 1)}
              disabled={task.current <= 0}
              aria-label="تقليل الإنجاز"
              title={"تقليل الإنجاز (" + task.current + " / " + task.target + ")"}
            >
              <Minus size={13} />
            </button>
          )}
          <ProgressBar percentage={percentage} color={progressColor} className="h-2" />
          {!hasSubtasks && (
            <button
              type="button"
              className="tr-step"
              onClick={() => onSetCurrent(task.id, task.current + 1)}
              disabled={task.current >= task.target}
              aria-label="زيادة الإنجاز"
              title={"زيادة الإنجاز (" + task.current + " / " + task.target + ")"}
            >
              <Plus size={13} />
            </button>
          )}
        </div>

        {/* 4) الوقت */}
        <span className="tr-time" dir="ltr" title={hasSubtasks ? "إجمالي وقت المهام الفرعية" : "الوقت المستغرق"}>
          {formatDuration(hasSubtasks ? subtasksDuration : elapsed)}
        </span>

        {/* 5) تشغيل/إيقاف + إنهاء */}
        <div className="tr-ctrl">
          {!hasSubtasks && (
            isCompleted ? (
              <button type="button" className="tr-play tr-play--reopen" onClick={() => onReopen(task.id)} aria-label="إعادة فتح" title="إعادة فتح"><RotateCcw size={16} /></button>
            ) : (
              <button
                type="button"
                className={"tr-play" + (isRunning ? " is-running" : "")}
                onClick={() => (isRunning ? onRequestStop(task.id) : onStart(task.id))}
                aria-label={playLabel}
                title={playLabel}
              >
                {isRunning ? <Pause size={17} fill="currentColor" /> : <Play size={17} fill="currentColor" />}
              </button>
            )
          )}
          {!hasSubtasks && !isCompleted && (
            <button type="button" className="tr-finish" onClick={() => onFinish(task.id)} title="إنهاء المهمة">
              <span>إنهاء</span><CheckCircle2 size={15} aria-hidden />
            </button>
          )}
        </div>

        {/* 6) التعليقات (الرقم = عدد التعليقات) */}
        <span className="tr-cm-cell">
          {!hasSubtasks && (
            <button type="button" className="tr-ico tr-cm" onClick={() => onAddComment(task.id)} aria-label="تعليق" title="إضافة تعليق">
              <MessageSquarePlus size={16} />
              {hasComments && <span className="tr-cm-n">{task.comments.length}</span>}
            </button>
          )}
        </span>

        {/* 7) القائمة (⋮) */}
        {canManageTasks && (
          <span className="tr-menu">
            <TaskActionsMenu items={menuItems} buttonClassName="tr-ico" />
          </span>
        )}
      </div>

      {hasTimer && <TaskTimerPanel task={task} onAction={onTimer} />}

      {showDetails && (
        <section className="tc-details task-subtasks-enter">
          {task.createdByName && (
            <div className="tc-meta">
              <p>أضيفت بواسطة: {task.createdByName}</p>
              <p>المسؤول: {task.assigneeName ?? "—"}</p>
            </div>
          )}
          {task.description && <p className="tc-desc">{task.description}</p>}
          <ImageAttachmentGallery attachments={task.attachments} />

          {canAddTimer && <div><TaskTimerPanel task={task} onAction={onTimer} /></div>}

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
                    <button type="button" onClick={() => onDeleteComment(task.id, comment.time)} className="text-muted hover:text-problem" aria-label="حذف التعليق"><Trash2 size={13} /></button>
                  )}
                </div>
              ))}
            </div>
          )}

          {hasStopNotes && <StopNotesHistory task={task} />}
        </section>
      )}

      {hasSubtasks && expanded && (
        <section className="task-subtasks-enter mt-2 space-y-2 border-t border-border pt-2">
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
