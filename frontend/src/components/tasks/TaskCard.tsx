import { AlarmClock, CalendarDays, CheckCircle2, ChevronDown, ChevronRight, ClipboardList, Clock, Copy, Layers, MessageSquareText, Minus, Move, Pause, Pencil, Play, Plus, RotateCcw, Timer, Trash2 } from "lucide-react";
import { useState, type ReactNode } from "react";
import type { Task, TimerAction } from "../../types";
import { calculateParentProgress, calculateTaskProgress } from "../../lib/taskProgress";
import { formatArabicTime, formatDuration } from "../../lib/date";
import { getTaskElapsed, useElapsed } from "../../hooks/useTaskTimer";
import { TaskTimerPanel } from "./TaskTimerPanel";
import { TaskActionsMenu, type TaskMenuItem } from "./TaskActionsMenu";
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

type CardState = "not_started" | "running" | "paused" | "completed" | "idle";

const stateLabels: Record<CardState, string> = {
  not_started: "لم تبدأ",
  running: "جارية الآن",
  paused: "متوقفة",
  completed: "مكتملة",
  idle: "",
};

const priorityLabels = { low: "منخفضة", medium: "متوسطة", high: "عالية" } as const;

type RowHandlers = Pick<
  TaskCardProps,
  "getSubtasks" | "taskNumbers" | "onStart" | "onRequestStop" | "onFinish" | "onReopen" | "onDelete" | "onEdit" | "onSetCurrent" | "onAddSubtask" | "onAddComment" | "onDeleteComment" | "onTimer"
>;

/**
 * صفّ مهمة واحد (للمهمة الرئيسية والفرعية معًا، بتصميم موحّد):
 * [المهام الفرعية] [أيقونة + رقم + عنوان] | [% + عدّاد + شريط] [وقت] [تشغيل/إيقاف] [إنهاء] [تعليق] [⋮]
 * شريط ملوّن على الحافة = الحالة. العرض الضيق ينكسر لسطرين تلقائيًا (container query).
 * التفاصيل (بدأت/انتهت/الوقت، الوصف، المرفقات، المؤقت، التعليقات، سجل التوقفات) تُفتح بالضغط على العنوان.
 * المهام الفرعية (متداخلة بلا حد) تظهر تحت الصف بنفس التصميم.
 */
function TaskRowLine({ task, h, variant, menuBase }: { task: Task; h: RowHandlers; variant: "root" | "sub"; menuBase: TaskMenuItem[] }) {
  const [expanded, setExpanded] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const { canManageTasks, canDeleteComment } = usePermissions();
  const elapsed = useElapsed(task);
  const children = h.getSubtasks(task.id);
  const isCompleted = task.status === "completed";
  const isRunning = task.status === "running";
  const isPaused = task.status === "paused";
  const hasSubtasks = children.length > 0;
  const allSubtasks = hasSubtasks ? getAllSubtasks(task.id, h.getSubtasks) : [];
  const completedSubtasks = allSubtasks.filter((subtask) => subtask.status === "completed").length;
  const subtasksDuration = allSubtasks.reduce((sum, subtask) => sum + getTaskElapsed(subtask), 0);
  const percentage = hasSubtasks ? calculateParentProgress(children) : calculateTaskProgress(task);
  const displayCompleted = hasSubtasks ? percentage >= 100 : isCompleted;
  const progressCount = hasSubtasks ? completedSubtasks + "/" + allSubtasks.length : task.current + "/" + task.target;

  // المهمة الأم لا تعرض حالة تشغيل؛ تظهر فقط "مكتملة" عند 100%
  const cardState: CardState = hasSubtasks ? (displayCompleted ? "completed" : "idle") : task.status;
  // الشريط بلون الموقع (كما في التصميم)؛ المتوقفة فقط بلون التنبيه
  const progressColor = cardState === "paused" ? "var(--operational)" : "var(--primary)";

  const hasStopNotes = !hasSubtasks && task.stopNotes.length > 0;
  const hasComments = !hasSubtasks && task.comments.length > 0;
  const hasTimer = !hasSubtasks && !isCompleted && Boolean(task.timer);
  const canAddTimer = !hasSubtasks && !isCompleted && !task.timer;

  const menuItems: TaskMenuItem[] = canAddTimer
    ? [menuBase[0], { key: "timer", label: "مؤقت تنازلي", icon: <AlarmClock size={16} />, onSelect: () => setDetailsOpen(true) }, ...menuBase.slice(1)]
    : menuBase;

  const subLabel = hasSubtasks ? "المهام الفرعية" : "مهمة فرعية";
  const playLabel = isRunning ? "إيقاف" : isPaused ? "استكمال" : "بدء";

  return (
    <article className={"tc-card tr-card tc-card--" + cardState + (variant === "sub" ? " tr-card--sub" : "")} data-status={cardState}>
      <div className="tr-row">
        {/* المهام الفرعية: تفتح القائمة إن وُجدت، وإلا تضيف مهمة فرعية */}
        <button
          type="button"
          className={"tr-sub" + (hasSubtasks ? "" : " tr-sub--add") + (hasSubtasks && expanded ? " is-open" : "")}
          onClick={() => (hasSubtasks ? setExpanded((value) => !value) : h.onAddSubtask(task))}
          aria-expanded={hasSubtasks ? expanded : undefined}
          aria-label={hasSubtasks ? (expanded ? "إخفاء المهام الفرعية" : "إظهار المهام الفرعية") : "إضافة مهمة فرعية"}
          title={hasSubtasks ? subtasksLabel(allSubtasks.length) : "إضافة مهمة فرعية"}
        >
          {hasSubtasks ? <Layers size={15} aria-hidden /> : <Plus size={15} aria-hidden />}
          <span className="tr-sub-label">{subLabel}</span>
          {hasSubtasks && <span className="tr-sub-count" dir="ltr">({allSubtasks.length})</span>}
        </button>

        {/* أيقونة + رقم + عنوان المهمة (الضغط على الأيقونة أو العنوان يعرض التفاصيل) */}
        <div className="tr-main">
          <button
            type="button"
            className={"tr-clip" + (detailsOpen ? " is-open" : "")}
            onClick={() => setDetailsOpen((value) => !value)}
            aria-expanded={detailsOpen}
            aria-label={detailsOpen ? "إخفاء التفاصيل" : "عرض التفاصيل (بدأت/انتهت/التعليقات)"}
            title={detailsOpen ? "إخفاء التفاصيل" : "التفاصيل: بدأت/انتهت، التعليقات، الوصف"}
          >
            <ClipboardList size={19} aria-hidden />
          </button>
          <NumberBadge value={h.taskNumbers.get(task.id)} size="sm" done={displayCompleted} />
          <button
            type="button"
            className={"tr-title" + (displayCompleted ? " tc-title--done" : "")}
            onClick={() => setDetailsOpen((value) => !value)}
            aria-expanded={detailsOpen}
            title={detailsOpen ? "إخفاء التفاصيل" : "عرض التفاصيل"}
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
            <span className={"tr-state tr-state--" + cardState} role="status" title={stateLabels[cardState]}>
              {cardState === "completed" ? <CheckCircle2 size={13} aria-hidden /> : <span className="tc-dot" aria-hidden />}
              <span className="tr-state-label">{stateLabels[cardState]}</span>
            </span>
          )}
        </div>

        {/* شريط التقدم ثم النسبة (كما في التصميم) — − / + لتعديل الإنجاز تظهر عند المرور، والعدّاد في التلميح والتفاصيل */}
        <div className="tr-prog" title={(hasSubtasks ? "المهام الفرعية المكتملة: " : "الإنجاز الحالي / الهدف: ") + progressCount}>
          {hasSubtasks ? (
            <span className="tr-step tr-step--ghost" aria-hidden />
          ) : (
            <button type="button" className="tr-step" onClick={() => h.onSetCurrent(task.id, task.current - 1)} disabled={task.current <= 0} aria-label="تقليل الإنجاز" title="تقليل الإنجاز">
              <Minus size={13} />
            </button>
          )}
          <ProgressBar percentage={percentage} color={progressColor} className="h-2" />
          {hasSubtasks ? (
            <span className="tr-step tr-step--ghost" aria-hidden />
          ) : (
            <button type="button" className="tr-step" onClick={() => h.onSetCurrent(task.id, task.current + 1)} disabled={task.current >= task.target} aria-label="زيادة الإنجاز" title="زيادة الإنجاز">
              <Plus size={13} />
            </button>
          )}
          <span className="tr-pct" dir="ltr">{percentage}%</span>
          <span className="tr-count" dir="ltr">{progressCount}</span>
        </div>

        {/* الوقت */}
        <span className="tr-time" dir="ltr" title={hasSubtasks ? "إجمالي وقت المهام الفرعية" : "الوقت المستغرق"}>
          {formatDuration(hasSubtasks ? subtasksDuration : elapsed)}
        </span>

        {/* تشغيل/إيقاف + إنهاء */}
        <div className="tr-ctrl">
          {!hasSubtasks && (
            isCompleted ? (
              <button type="button" className="tr-play tr-play--reopen" onClick={() => h.onReopen(task.id)} aria-label="إعادة فتح" title="إعادة فتح"><RotateCcw size={16} /></button>
            ) : (
              <button
                type="button"
                className={"tr-play" + (isRunning ? " is-running" : "")}
                onClick={() => (isRunning ? h.onRequestStop(task.id) : h.onStart(task.id))}
                aria-label={playLabel}
                title={playLabel}
              >
                {isRunning ? <Pause size={17} fill="currentColor" /> : <Play size={17} fill="currentColor" />}
              </button>
            )
          )}
          {!hasSubtasks && !isCompleted && (
            <button type="button" className="tr-finish" onClick={() => h.onFinish(task.id)} title="إنهاء المهمة">
              <span>إنهاء</span><CheckCircle2 size={15} aria-hidden />
            </button>
          )}
        </div>

        {/* التعليقات (الرقم = عددها) */}
        <span className="tr-cm-cell">
          {!hasSubtasks && (
            <button type="button" className="tr-ico tr-cm" onClick={() => h.onAddComment(task.id)} aria-label="تعليق" title="إضافة تعليق">
              <MessageSquareText size={17} />
              {hasComments && <span className="tr-cm-n">{task.comments.length}</span>}
            </button>
          )}
        </span>

        {/* القائمة (⋮) */}
        {canManageTasks && (
          <span className="tr-menu">
            <TaskActionsMenu items={menuItems} buttonClassName="tr-ico" />
          </span>
        )}
      </div>

      {hasStopNotes && (
        <button type="button" className="tr-stopline" onClick={() => setDetailsOpen((value) => !value)} aria-expanded={detailsOpen} title="عرض سجل التوقفات كاملًا">
          <Pause size={13} aria-hidden />
          <span className="tr-stopline-k">سبب التوقف:</span>
          <span className="tr-stopline-v" dir="auto">{task.stopNotes[task.stopNotes.length - 1].note}</span>
          {task.stopNotes.length > 1 && <span className="tr-stopline-n" dir="ltr">({task.stopNotes.length})</span>}
        </button>
      )}

      {hasTimer && <TaskTimerPanel task={task} onAction={h.onTimer} />}

      {detailsOpen && (
        <section className="tc-details task-subtasks-enter">
          <div className="tr-metrics">
            {hasSubtasks ? (
              <>
                <span>المهام: <b>{allSubtasks.length}</b></span>
                <span>المكتملة: <b>{completedSubtasks}</b></span>
                <span>الإنجاز: <b dir="ltr">{percentage}%</b></span>
                <span><Clock size={14} aria-hidden />إجمالي الوقت: <b dir="ltr">{formatDuration(subtasksDuration)}</b></span>
              </>
            ) : (
              <>
                <span><CalendarDays size={14} aria-hidden />بدأت: <b>{formatArabicTime(task.startedAt ?? task.startTime)}</b></span>
                <span><CalendarDays size={14} aria-hidden />انتهت: <b>{formatArabicTime(task.endTime)}</b></span>
                <span><Clock size={14} aria-hidden />الوقت: <b dir="ltr">{formatDuration(elapsed)}</b></span>
                <span>الإنجاز: <b dir="ltr">{task.current}/{task.target}</b></span>
              </>
            )}
          </div>
          {task.createdByName && (
            <div className="tc-meta">
              <p>أضيفت بواسطة: {task.createdByName}</p>
              <p>المسؤول: {task.assigneeName ?? "—"}</p>
            </div>
          )}
          {task.description && <p className="tc-desc">{task.description}</p>}
          <ImageAttachmentGallery attachments={task.attachments} />

          {canAddTimer && <div><TaskTimerPanel task={task} onAction={h.onTimer} /></div>}

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
                    <button type="button" onClick={() => h.onDeleteComment(task.id, comment.time)} className="text-muted hover:text-problem" aria-label="حذف التعليق"><Trash2 size={13} /></button>
                  )}
                </div>
              ))}
            </div>
          )}

          {hasStopNotes && <StopNotesHistory task={task} />}
        </section>
      )}

      {hasSubtasks && expanded && (
        <section className="task-subtasks-enter tr-children">
          {children.map((child) => (
            <SubtaskRow key={child.id} task={child} h={h} />
          ))}
        </section>
      )}
    </article>
  );
}

/** مهمة فرعية (قد تحتوي مهامًا فرعية أخرى): نفس صف المهمة الرئيسية، قائمتها تعديل/حذف فقط */
function SubtaskRow({ task, h }: { task: Task; h: RowHandlers }) {
  const menuBase: TaskMenuItem[] = [
    { key: "edit", label: "تعديل المهمة", icon: <Pencil size={16} />, onSelect: () => h.onEdit(task) },
    { key: "delete", label: "حذف المهمة", icon: <Trash2 size={16} />, onSelect: () => h.onDelete(task), danger: true },
  ];
  return <TaskRowLine task={task} h={h} variant="sub" menuBase={menuBase} />;
}

export function TaskCard({ task, getSubtasks, taskNumbers, onStart, onRequestStop, onFinish, onReopen, onMoveToDate, onCopy, onDelete, onEdit, onSetCurrent, onAddSubtask, onAddComment, onDeleteComment, onTimer }: TaskCardProps) {
  const h: RowHandlers = { getSubtasks, taskNumbers, onStart, onRequestStop, onFinish, onReopen, onDelete, onEdit, onSetCurrent, onAddSubtask, onAddComment, onDeleteComment, onTimer };
  // الإجراءات الثانوية تظهر عند الضغط على الثلاث نقاط فقط
  const menuBase: TaskMenuItem[] = [
    { key: "edit", label: "تعديل المهمة", icon: <Pencil size={16} />, onSelect: () => onEdit(task) },
    { key: "move", label: "نقل المهمة", icon: <Move size={16} />, onSelect: () => onMoveToDate(task) },
    { key: "copy", label: "نسخ (كوبي)", icon: <Copy size={16} />, onSelect: () => onCopy(task) },
    { key: "delete", label: "حذف المهمة", icon: <Trash2 size={16} />, onSelect: () => onDelete(task), danger: true },
  ];
  return <TaskRowLine task={task} h={h} variant="root" menuBase={menuBase} />;
}
