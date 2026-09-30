interface ProgressBarProps {
  percentage: number;
  color?: string;
}

export function ProgressBar({ percentage, color }: ProgressBarProps) {
  const clamped = Math.max(0, Math.min(100, percentage));
  const barColor =
    color ?? (clamped >= 100 ? "#27C6A3" : clamped >= 70 ? "#55C98B" : clamped >= 30 ? "#F2B84B" : "#78847F");
  return (
    <div className="w-full h-2 rounded-full bg-border/70 overflow-hidden">
      <div
        className="h-full rounded-full transition-all duration-500 ease-out"
        style={{ width: `${clamped}%`, backgroundColor: barColor }}
      />
    </div>
  );
}
