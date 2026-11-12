import type { ReactNode } from "react";

interface StatTileProps {
  label: string;
  value: ReactNode;
  hint?: string;
  color?: string;
  /** عند التمرير يصبح الرقم زراً يفتح تفاصيل الأوردرات التي تكوّنه */
  onClick?: () => void;
  active?: boolean;
}

export function StatTile({ label, value, hint, color = "var(--primary-deep)", onClick, active }: StatTileProps) {
  const body = (
    <>
      <p className="text-xs font-medium text-muted">{label}</p>
      <p className="mt-1 text-xl font-bold tabular-nums" style={{ color }}>
        {value}
      </p>
      {hint && <p className="mt-0.5 text-[11px] text-muted">{hint}</p>}
    </>
  );
  const base = "rounded-card border bg-surface p-3.5 text-start shadow-soft transition-colors";
  if (!onClick) return <div className={`${base} border-border`}>{body}</div>;
  return (
    <button type="button" onClick={onClick} aria-pressed={active} className={`${base} ${active ? "border-primary-deep ring-2 ring-primary/30" : "border-border hover:border-primary-deep/50"}`}>
      {body}
    </button>
  );
}
