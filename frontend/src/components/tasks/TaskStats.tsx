import { CheckCircle2, ListTodo, PlayCircle, Timer } from "lucide-react";
import { Card } from "../ui/Card";
import { formatDuration } from "../../lib/date";

interface TaskStatsProps {
  total: number;
  completed: number;
  running: number;
  totalDuration: number;
}

export function TaskStats({ total, completed, running, totalDuration }: TaskStatsProps) {
  const items = [
    { label: "مهام اليوم", value: total, icon: ListTodo, color: "#148D72" },
    { label: "المكتملة", value: completed, icon: CheckCircle2, color: "#27C6A3" },
    { label: "قيد التنفيذ", value: running, icon: PlayCircle, color: "#55C98B" },
    { label: "إجمالي وقت العمل", value: formatDuration(totalDuration), icon: Timer, color: "#78847F" },
  ];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
      {items.map((item) => (
        <Card key={item.label} className="p-4 flex items-center gap-3">
          <div
            className="h-11 w-11 rounded-control flex items-center justify-center shrink-0"
            style={{ backgroundColor: `${item.color}18`, color: item.color }}
          >
            <item.icon size={19} />
          </div>
          <div className="min-w-0">
            <p className="text-xs text-muted">{item.label}</p>
            <p className="text-lg font-bold text-text font-mono tabular-nums">{item.value}</p>
          </div>
        </Card>
      ))}
    </div>
  );
}
