import { Card } from "../ui/Card";

interface FeedbackStatsProps {
  total: number;
  problems: number;
  operational: number;
  ideas: number;
}

export function FeedbackStats({ total, problems, operational, ideas }: FeedbackStatsProps) {
  const items = [
    { label: "Total", value: total, color: "#17201E" },
    { label: "مشاكل", value: problems, color: "#FF6B6B" },
    { label: "تشغيل", value: operational, color: "#F2B84B" },
    { label: "أفكار", value: ideas, color: "#55C98B" },
  ];
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
      {items.map((item) => (
        <Card key={item.label} className="p-4">
          <p className="text-xs text-muted mb-1">{item.label}</p>
          <p className="text-xl font-bold font-mono tabular-nums" style={{ color: item.color }}>
            {item.value}
          </p>
        </Card>
      ))}
    </div>
  );
}
