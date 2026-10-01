import { useEffect, useRef } from "react";
import { subscribeLiveSync } from "../lib/liveSync";

/**
 * يستدعي `onChange` تلقائياً كلما غيّر أي مستخدم بيانات في النظام (إضافة/تعديل/حذف).
 * `onChange` يجب أن يكون تحديثاً صامتاً: بدون شاشة تحميل وبدون رسالة خطأ عند الفشل.
 */
export function useLiveSync(onChange: () => void | Promise<unknown>) {
  const latest = useRef(onChange);

  useEffect(() => {
    latest.current = onChange;
  });

  useEffect(() => subscribeLiveSync(() => latest.current()), []);
}
