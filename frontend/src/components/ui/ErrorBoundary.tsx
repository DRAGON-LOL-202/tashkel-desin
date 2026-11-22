import { Component, type ErrorInfo, type ReactNode } from "react";
import { AlertTriangle, RotateCcw } from "lucide-react";

interface ErrorBoundaryState {
  hasError: boolean;
}

/** حاجز أخطاء عام يمنع ظهور شاشة بيضاء عند حدوث خطأ غير متوقع في واجهة React */
export class ErrorBoundary extends Component<{ children: ReactNode }, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("UI ErrorBoundary caught error:", error, info.componentStack);
  }

  render() {
    if (!this.state.hasError) return this.props.children;
    return (
      <main className="flex min-h-screen items-center justify-center bg-background px-4 text-text" dir="rtl">
        <div className="w-full max-w-md rounded-card border border-border bg-surface p-6 text-center shadow-soft">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-problem/15 text-problem">
            <AlertTriangle size={22} />
          </div>
          <h1 className="text-lg font-bold text-text">حدث خطأ غير متوقع في العرض</h1>
          <p className="mt-1.5 text-sm text-muted">يمكنك إعادة تحميل الصفحة للمتابعة بأمان دون فقد أي بيانات محفوظة.</p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="mt-5 inline-flex items-center gap-2 rounded-control bg-primary-deep px-4 py-2 text-sm font-semibold text-white transition-opacity hover:opacity-90"
          >
            <RotateCcw size={15} />
            إعادة تحميل الصفحة
          </button>
        </div>
      </main>
    );
  }
}
