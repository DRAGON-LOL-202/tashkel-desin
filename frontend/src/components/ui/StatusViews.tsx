import type { ReactNode } from "react";
import { AlertTriangle, Loader2, ShieldAlert } from "lucide-react";
import { Button } from "./Button";

export function LoadingState({ label = "جارٍ التحميل..." }: { label?: string }) {
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
