import { CheckCircle2, PlayCircle, Target, TrendingUp } from "lucide-react";
import { Card } from "../ui/Card";
import type { Goal } from "../../types";
import { getGoalProgress } from "../../services/goalsService";

interface GoalStatsProps {
  goals: Goal[];
}

export function GoalStats({ goals }: GoalStatsProps) {
  const completed = goals.filter((goal) => goal.status === "completed").length;
  const running = goals.filter((goal) => goal.status === "in_progress").length;
  const average = goals.length
    ? Math.round(goals.reduce((sum, goal) => sum + getGoalProgress(goal), 0) / goals.length)
    : 0;

  const items = [
    { label: "إجمالي الأهداف", value: goals.length, icon: Target, color: "#148D72" },
    { label: "قيد التنفيذ", value: running, icon: PlayCircle, color: "#27C6A3" },
    { label: "المكتملة", value: completed, icon: CheckCircle2, color: "#27C6A3" },
    { label: "متوسط الإنجاز", value: `${average}%`, icon: TrendingUp, color: "#55C98B" },
  ];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
      {items.map((item) => (
        <Card key={item.label} className="p-4 flex items-center justify-between gap-4">
          <div className="min-w-0">
            <p className="text-xs text-muted">{item.label}</p>
            <p className="mt-1 font-mono text-2xl font-bold text-text tabular-nums">{item.value}</p>
          </div>
          <div
            className="h-12 w-12 shrink-0 rounded-full flex items-center justify-center"
            style={{ backgroundColor: `${item.color}18`, color: item.color }}
          >
            <item.icon size={21} />
          </div>
        </Card>
      ))}
    </div>
  );
}
