import { CalendarDays, Plus } from "lucide-react";
import { Button } from "../ui/Button";
import { Card } from "../ui/Card";
import { EmptyState } from "../ui/EmptyState";
import type { Goal, GoalType } from "../../types";
import { GoalCard } from "./GoalCard";

interface GoalColumnProps {
  type: GoalType;
  title: string;
  accent: string;
  goals: Goal[];
  onAdd: (type: GoalType) => void;
  onEdit: (goal: Goal) => void;
  onDelete: (id: string) => void;
  onToggleComplete: (goal: Goal) => void;
  onIncrement: (goal: Goal) => void;
}

export function GoalColumn({
  type,
  title,
  accent,
  goals,
  onAdd,
  onEdit,
  onDelete,
  onToggleComplete,
  onIncrement,
}: GoalColumnProps) {
  return (
    <Card className="p-4 md:p-5 min-h-[620px] flex flex-col gap-4">
      <div className="rounded-control border border-border bg-primary/5 p-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div
            className="h-12 w-12 shrink-0 rounded-full flex items-center justify-center shadow-pop"
            style={{ backgroundColor: `${accent}22`, color: accent }}
          >
            <CalendarDays size={21} />
          </div>
          <h2 className="text-lg font-bold text-text truncate">{title}</h2>
        </div>
        <div className="text-left shrink-0">
          <p className="text-[11px] text-muted">إجمالي الأهداف</p>
          <p className="font-mono text-lg font-bold text-text">{goals.length}</p>
        </div>
      </div>

      <Button icon={<Plus size={16} />} onClick={() => onAdd(type)} className="w-full">
        إضافة هدف
      </Button>

      <div className="flex-1 space-y-3">
        {goals.length === 0 ? (
          <EmptyState
            icon={<CalendarDays size={22} />}
            title="لا توجد أهداف حالياً"
            description="ابدأ بإضافة هدف جديد لهذا القسم."
            action={
              <Button size="sm" icon={<Plus size={15} />} onClick={() => onAdd(type)}>
                إضافة هدف
              </Button>
            }
          />
        ) : (
          goals.map((goal) => (
            <GoalCard
              key={goal.id}
              goal={goal}
              accent={accent}
              onEdit={onEdit}
              onDelete={onDelete}
              onToggleComplete={onToggleComplete}
              onIncrement={onIncrement}
            />
          ))
        )}
      </div>
    </Card>
  );
}
