import type { HTMLAttributes, ReactNode } from "react";

export function Card({ children, className = "", ...rest }: HTMLAttributes<HTMLDivElement> & { children: ReactNode }) {
  return (
    <div
      className={`bg-surface border border-border rounded-card shadow-soft ${className}`}
      {...rest}
    >
      {children}
    </div>
  );
}
