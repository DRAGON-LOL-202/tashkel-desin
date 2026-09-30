import { useCallback } from "react";
import { errorMessage } from "../lib/api";
import { useToast } from "../components/ui/ToastProvider";

export type ActionResult<T> = { ok: true; value: T } | { ok: false };

/**
 * ينفّذ عملية غير متزامنة ويعرض رسالة الخطأ (من الـ backend) في Toast بدل كسر الصفحة.
 * يعيد { ok: true, value } عند النجاح و { ok: false } عند الفشل.
 */
export function useSafeAction() {
  const { show } = useToast();
  return useCallback(
    async <T>(action: () => Promise<T>): Promise<ActionResult<T>> => {
      try {
        return { ok: true, value: await action() };
      } catch (error) {
        show(errorMessage(error), "error");
        return { ok: false };
      }
    },
    [show]
  );
}
