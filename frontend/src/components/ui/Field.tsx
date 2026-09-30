import type { InputHTMLAttributes, TextareaHTMLAttributes, SelectHTMLAttributes, ReactNode } from "react";

interface FieldWrapProps {
  label: string;
  htmlFor?: string;
  error?: string;
  children: ReactNode;
}

export function FieldWrap({ label, htmlFor, error, children }: FieldWrapProps) {
  return (
    <div className="mb-4">
      <label htmlFor={htmlFor} className="block text-sm font-medium text-text mb-1.5">
        {label}
      </label>
      {children}
      {error && <p className="text-xs text-problem mt-1">{error}</p>}
    </div>
  );
}

const baseInputClasses =
  "w-full rounded-control border border-border bg-surface px-3.5 py-2.5 text-sm text-text placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary-deep/50 transition-shadow";

export function Input(props: InputHTMLAttributes<HTMLInputElement>) {
  const { className = "", ...rest } = props;
  return <input className={`${baseInputClasses} ${className}`} {...rest} />;
}

export function Textarea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const { className = "", ...rest } = props;
  return <textarea className={`${baseInputClasses} min-h-[90px] resize-y ${className}`} {...rest} />;
}

export function Select(props: SelectHTMLAttributes<HTMLSelectElement>) {
  const { className = "", children, ...rest } = props;
  return (
    <select className={`${baseInputClasses} appearance-none cursor-pointer ${className}`} {...rest}>
      {children}
    </select>
  );
}
