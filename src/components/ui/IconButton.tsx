import type { ButtonHTMLAttributes, ReactNode } from "react";

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  children: ReactNode;
  active?: boolean;
}

export function IconButton({ children, active, className = "", ...rest }: IconButtonProps) {
  return (
    <button
      className={`inline-flex items-center justify-center h-9 w-9 rounded-control transition-colors ${
        active
          ? "bg-primary/15 text-primary-deep"
          : "text-muted hover:bg-border/50 hover:text-text"
      } ${className}`}
      {...rest}
    >
      {children}
    </button>
  );
}
