import { CheckCircle2, Clock, MessageSquarePlus, MoreVertical, Pause, Play, Trash2 } from "lucide-react";
import type { Task } from "../../types";
import { Button } from "../ui/Button";
import { PriorityTag } from "../ui/Badge";
import { useElapsed } from "../../hooks/useTaskTimer";
import { formatArabicTime, formatDuration } from "../../lib/date";
import { IconButton } from "../ui/IconButton";

interface TaskCardProps {
  task: Task;
  onStart: (id: string) => void;
  onRequestStop: (id: string) => void;
  onFinish: (id: string) => void;
  onDelete: (id: string) => void;
  onAddComment: (id: string) => void;
  onDeleteComment: (id: string, commentTime: number) => void;
}

const statusLabels = {
  not_started: "لم تبدأ",
  running: "قيد التنفيذ",
  paused: "متوقفة",
  completed: "مكتملة",
};

export function TaskCard({
  task,
  onStart,
  onRequestStop,
  onFinish,
  onDelete,
  onAddComment,
  onDeleteComment,
}: TaskCardProps) {
  const elapsed = useElapsed(task);
  const isCompleted = task.status === "completed";
  const isRunning = task.status === "running";
  const isPaused = task.status === "paused";
  const lastStopNote = task.stopNotes.at(-1);
  const displayStartTime = task.startedAt ?? task.startTime;

  return (
    <article
      className={`rounded-control border border-border bg-surface p-3.5 shadow-soft transition-all ${
        isCompleted ? "opacity-60" : "hover:shadow-pop"
      }`}
    >
      <div className="flex items-start gap-3">
        <button
          onClick={() => !isCompleted && onFinish(task.id)}
          aria-label="تحديد كمكتملة"
          className={`mt-1 h-5 w-5 shrink-0 rounded border flex items-center justify-center transition-colors ${
            isCompleted
              ? "bg-primary-dark border-primary-dark text-background"
              : "border-muted/40 hover:border-primary-deep"
          }`}
        >
          {isCompleted && <CheckCircle2 size={14} />}
        </button>

        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <h3
                className={`text-[15px] font-semibold leading-snug ${
                  isCompleted ? "line-through text-muted" : "text-text"
                }`}
              >
                {task.title}
              </h3>
              {task.description && (
                <p className={`mt-1 text-xs leading-5 ${isCompleted ? "text-muted/70" : "text-muted"}`}>
                  {task.description}
                </p>
              )}
            </div>
            <IconButton onClick={() => onDelete(task.id)} aria-label="حذف المهمة" className="h-7 w-7 shrink-0">
              <Trash2 size={14} />
            </IconButton>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <PriorityTag priority={task.priority} />
            <span className="rounded-full bg-primary/20 px-2.5 py-1 text-xs font-medium text-primary-deep">
              {statusLabels[task.status]}
            </span>
          </div>
        </div>
      </div>

      <div className="mt-3 border-t border-border pt-3">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs text-muted">
          <span className="flex items-center gap-1.5">
            <Clock size={13} />
            الوقت: <span className="font-mono font-semibold tabular-nums text-text">{formatDuration(elapsed)}</span>
          </span>
          <span>بدأت: {formatArabicTime(displayStartTime)}</span>
          <span>انتهت: {formatArabicTime(task.endTime)}</span>
        </div>

        <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
          {!isCompleted ? (
            !isRunning ? (
              <Button size="sm" variant="secondary" icon={<Play size={14} />} onClick={() => onStart(task.id)}>
                {isPaused ? "استكمال" : "بدء"}
              </Button>
            ) : (
              <Button size="sm" variant="secondary" icon={<Pause size={14} />} onClick={() => onRequestStop(task.id)}>
                إيقاف
              </Button>
            )
          ) : (
            <span />
          )}

          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" variant="secondary" icon={<MessageSquarePlus size={14} />} onClick={() => onAddComment(task.id)}>
              تعليق
            </Button>
            {!isCompleted && (
              <Button size="sm" variant="primary" onClick={() => onFinish(task.id)}>
                إنهاء المهمة
              </Button>
            )}
            <MoreVertical size={16} className="text-muted" />
          </div>
        </div>
      </div>

      {task.comments.length > 0 && (
        <div className="mt-3 rounded-control bg-primary/10 px-3 py-2 text-xs text-text/85">
          <p className="mb-2 font-semibold text-primary-deep">تعليقات ({task.comments.length})</p>
          <div className="flex flex-col gap-2">
            {task.comments.map((comment) => (
              <div key={`${comment.time}-${comment.text}`} className="rounded-lg border border-primary/20 bg-surface/70 px-2.5 py-2">
                <div className="flex items-start justify-between gap-2">
                  <p className="whitespace-pre-wrap leading-5 text-text/90">{comment.text}</p>
                  <button
                    type="button"
                    onClick={() => onDeleteComment(task.id, comment.time)}
                    className="shrink-0 rounded-full p-1 text-muted transition hover:bg-problem/10 hover:text-problem"
                    aria-label="حذف التعليق"
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
                <p className="mt-1 text-[10px] text-muted">{formatArabicTime(comment.time)}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {isPaused && lastStopNote && (
        <div className="mt-3 rounded-control bg-operational/10 px-3 py-2 text-xs text-text/80">
          <span className="font-semibold text-operational">سبب الإيقاف: </span>
          {lastStopNote.note}
        </div>
      )}
    </article>
  );
}
