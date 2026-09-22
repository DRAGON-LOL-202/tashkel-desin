import type { ReactNode } from "react";

interface BadgeProps {
  children: ReactNode;
  color?: string;
  className?: string;
}

export function Badge({ children, color = "#78847F", className = "" }: BadgeProps) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${className}`}
      style={{
        backgroundColor: `${color}18`,
        color,
      }}
    >
      <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: color }} />
      {children}
    </span>
  );
}

export function PriorityTag({ priority }: { priority: "low" | "medium" | "high" }) {
  const map = {
    low: { label: "منخفضة", color: "#55C98B" },
    medium: { label: "متوسطة", color: "#F2B84B" },
    high: { label: "عالية", color: "#FF6B6B" },
  };
  const { label, color } = map[priority];
  return <Badge color={color}>{label}</Badge>;
}
