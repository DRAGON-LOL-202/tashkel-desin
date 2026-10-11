import type { ReactNode } from "react";

interface BadgeProps {
  children: ReactNode;
  color?: string;
  className?: string;
  /** إطار ملوّن حول الشارة (يُستخدم في بطاقة المهمة) */
  outlined?: boolean;
}

export function Badge({ children, color = "#78847F", className = "", outlined = false }: BadgeProps) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${className}`}
      style={{
        backgroundColor: `${color}${outlined ? "22" : "18"}`,
        color,
        border: outlined ? `1px solid ${color}66` : undefined,
      }}
    >
      <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: color }} />
      {children}
    </span>
  );
}

export function PriorityTag({ priority, outlined = false, className = "" }: { priority: "low" | "medium" | "high"; outlined?: boolean; className?: string }) {
  const map = {
    low: { label: "منخفضة", color: "#55C98B" },
    medium: { label: "متوسطة", color: "#F2B84B" },
    high: { label: "عالية", color: "#FF6B6B" },
  };
  const { label, color } = map[priority];
  return <Badge color={color} outlined={outlined} className={className}>{label}</Badge>;
}
