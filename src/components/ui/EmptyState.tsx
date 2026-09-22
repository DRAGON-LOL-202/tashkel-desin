import type { ReactNode } from "react";

interface EmptyStateProps {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
}

export function EmptyState({ icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center text-center py-14 px-6">
      {icon && (
        <div className="h-14 w-14 rounded-2xl bg-primary/10 text-primary-deep flex items-center justify-center mb-4">
          {icon}
        </div>
      )}
      <h3 className="text-text font-semibold text-base mb-1">{title}</h3>
      {description && <p className="text-muted text-sm max-w-xs mb-4">{description}</p>}
      {action}
    </div>
  );
}
