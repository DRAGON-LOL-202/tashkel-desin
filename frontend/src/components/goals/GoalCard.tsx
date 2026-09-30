import { Check, MoreVertical, Pencil, Plus, Trash2 } from "lucide-react";
import type { Goal } from "../../types";
import { formatArabicDate } from "../../lib/date";
import { getGoalProgress } from "../../services/goalsService";
import { ProgressBar } from "../ui/ProgressBar";
import { IconButton } from "../ui/IconButton";

interface GoalCardProps {
  goal: Goal;
  accent: string;
  onEdit: (goal: Goal) => void;
  onDelete: (id: string) => void;
  onToggleComplete: (goal: Goal) => void;
  onIncrement: (goal: Goal) => void;
}

export function GoalCard({ goal, accent, onEdit, onDelete, onToggleComplete, onIncrement }: GoalCardProps) {
  const percentage = getGoalProgress(goal);
  const isComplete = goal.status === "completed" || percentage >= 100;

  return (
    <article
      className={`rounded-control border border-border bg-surface p-4 shadow-soft transition-all duration-200 ${
        isComplete ? "opacity-80" : "hover:shadow-pop"
      }`}
    >
      <div className="flex items-start gap-3">
        <button
          onClick={() => onToggleComplete(goal)}
          aria-label="تحديد الهدف كمكتمل"
          className={`mt-1 h-5 w-5 shrink-0 rounded-full border-2 flex items-center justify-center transition-colors ${
            isComplete ? "border-primary-dark bg-primary-dark text-white" : "border-muted/40 hover:border-primary-deep"
          }`}
        >
          {isComplete && <Check size={13} />}
        </button>

        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <h3 className={`text-sm font-semibold leading-6 ${isComplete ? "text-muted line-through" : "text-text"}`}>
                {goal.title}
              </h3>
              <p className="mt-1 text-xs text-muted">
                {formatArabicDate(goal.startDate, "d MMMM")} - {formatArabicDate(goal.endDate, "d MMMM")}
              </p>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <IconButton onClick={() => onEdit(goal)} aria-label="تعديل الهدف" className="h-7 w-7">
                <Pencil size={14} />
              </IconButton>
              <IconButton onClick={() => onDelete(goal.id)} aria-label="حذف الهدف" className="h-7 w-7">
                <Trash2 size={14} />
              </IconButton>
              <MoreVertical size={16} className="text-muted" />
            </div>
          </div>

          {goal.description && <p className="mt-2 text-xs leading-5 text-muted">{goal.description}</p>}

          <div className="mt-3 flex items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-2">
              <button
                onClick={() => onIncrement(goal)}
                disabled={isComplete}
                aria-label="زيادة التقدم بمقدار 1"
                className="h-7 w-7 rounded-full border border-border bg-primary/15 text-primary-deep flex items-center justify-center transition-colors hover:bg-primary/30 disabled:opacity-40 disabled:pointer-events-none"
                title="زيادة التقدم بمقدار 1"
              >
                <Plus size={14} />
              </button>
              <span className="font-mono text-muted tabular-nums">
                {goal.current} / {goal.target}
              </span>
            </div>
            <span className="font-mono font-bold text-text tabular-nums">{percentage}%</span>
          </div>
          <div className="mt-2">
            <ProgressBar percentage={percentage} color={accent} />
          </div>
        </div>
      </div>
    </article>
  );
}
