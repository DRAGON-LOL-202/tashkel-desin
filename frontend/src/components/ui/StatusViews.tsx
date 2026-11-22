import type { ReactNode } from "react";
import { AlertTriangle, Loader2, ShieldAlert } from "lucide-react";
import { Button } from "./Button";

export type LoadingVariant = "spinner" | "table" | "cards" | "stats" | "list";

function TableSkeleton({ label }: { label: string }) {
  return (
    <div className="rounded-card border border-border bg-surface overflow-hidden animate-pulse" role="status" aria-live="polite">
      <span className="sr-only">{label}</span>
      <div className="flex items-center justify-between gap-4 border-b border-border px-4 py-3">
        <div className="h-4 w-28 rounded bg-border/60" />
        <div className="h-4 w-20 rounded bg-border/50" />
        <div className="hidden h-4 w-24 rounded bg-border/50 sm:block" />
        <div className="h-4 w-16 rounded bg-border/50" />
      </div>
      <div className="divide-y divide-border/60">
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="flex items-center gap-3 px-4 py-3.5">
            <div className="h-9 w-9 shrink-0 rounded-control bg-border/60" />
            <div className="h-4 max-w-[180px] flex-1 rounded bg-border/60" />
            <div className="hidden h-4 w-24 rounded bg-border/45 sm:block" />
            <div className="hidden h-4 w-20 rounded bg-border/45 md:block" />
            <div className="ms-auto h-7 w-20 rounded-full bg-border/55" />
          </div>
        ))}
      </div>
    </div>
  );
}

function CardsSkeleton({ label }: { label: string }) {
  return (
    <div className="flex flex-col gap-4 animate-pulse" role="status" aria-live="polite">
      <span className="sr-only">{label}</span>
      <div className="flex flex-wrap gap-2">
        <div className="h-9 w-24 rounded-control bg-border/60" />
        <div className="h-9 w-24 rounded-control bg-border/50" />
        <div className="h-9 min-w-[160px] max-w-xs flex-1 rounded-control bg-border/45" />
      </div>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="flex flex-col gap-3 rounded-card border border-border bg-surface p-4">
            <div className="flex items-center justify-between gap-2">
              <div className="h-4 w-1/2 rounded bg-border/65" />
              <div className="h-5 w-16 rounded-full bg-border/50" />
            </div>
            <div className="h-3.5 w-full rounded bg-border/45" />
            <div className="h-3.5 w-3/4 rounded bg-border/45" />
            <div className="mt-1 flex items-center justify-between border-t border-border/50 pt-2">
              <div className="h-3 w-20 rounded bg-border/45" />
              <div className="h-7 w-16 rounded-control bg-border/55" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function StatsSkeleton({ label }: { label: string }) {
  return (
    <div className="flex flex-col gap-4 animate-pulse" role="status" aria-live="polite">
      <span className="sr-only">{label}</span>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="flex flex-col gap-2.5 rounded-card border border-border bg-surface p-4">
            <div className="h-3.5 w-24 rounded bg-border/55" />
            <div className="h-7 w-20 rounded bg-border/70" />
          </div>
        ))}
      </div>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <div className="h-24 rounded-card border border-border bg-surface p-4" />
        <div className="h-24 rounded-card border border-border bg-surface p-4" />
      </div>
      <div className="h-36 rounded-card border border-border bg-surface p-4" />
    </div>
  );
}

function ListSkeleton({ label }: { label: string }) {
  return (
    <div className="flex flex-col gap-2.5 animate-pulse" role="status" aria-live="polite">
      <span className="sr-only">{label}</span>
      {Array.from({ length: 5 }, (_, i) => (
        <div key={i} className="flex items-center gap-3 rounded-card border border-border bg-surface p-4">
          <div className="h-10 w-10 shrink-0 rounded-full bg-border/60" />
          <div className="flex flex-1 flex-col gap-2">
            <div className="h-4 w-48 max-w-full rounded bg-border/65" />
            <div className="h-3 w-72 max-w-full rounded bg-border/45" />
          </div>
          <div className="h-4 w-16 rounded bg-border/45" />
        </div>
      ))}
    </div>
  );
}

export function LoadingState({ label = "جارٍ التحميل...", variant = "spinner" }: { label?: string; variant?: LoadingVariant }) {
  if (variant === "table") return <TableSkeleton label={label} />;
  if (variant === "cards") return <CardsSkeleton label={label} />;
  if (variant === "stats") return <StatsSkeleton label={label} />;
  if (variant === "list") return <ListSkeleton label={label} />;

  return (
    <div className="flex flex-col items-center justify-center gap-3 py-16 text-muted" role="status" aria-live="polite">
      <Loader2 size={26} className="animate-spin text-primary-deep" />
      <p className="text-sm">{label}</p>
    </div>
  );
}

export function FullPageLoading() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-background" dir="rtl">
      <LoadingState />
    </main>
  );
}

interface ErrorStateProps {
  message: string;
  onRetry?: () => void;
  action?: ReactNode;
}

export function ErrorState({ message, onRetry, action }: ErrorStateProps) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-14 px-6 text-center" role="alert">
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-problem/10 text-problem">
        <AlertTriangle size={24} />
      </div>
      <p className="max-w-sm text-sm text-text">{message}</p>
      {onRetry && (
        <Button variant="secondary" onClick={onRetry}>
          إعادة المحاولة
        </Button>
      )}
      {action}
    </div>
  );
}

export function ForbiddenState() {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-14 px-6 text-center" role="alert">
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-operational/10 text-operational">
        <ShieldAlert size={24} />
      </div>
      <p className="text-base font-semibold text-text">لا تملك صلاحية الوصول</p>
      <p className="max-w-sm text-sm text-muted">هذه الصفحة أو هذه البيانات غير متاحة لحسابك.</p>
    </div>
  );
}
