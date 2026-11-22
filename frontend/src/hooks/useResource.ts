import { useCallback, useEffect, useRef, useState } from "react";
import { errorMessage } from "../lib/api";
import type { SyncChannel } from "../lib/liveSync";
import { useLiveSync } from "./useLiveSync";

/**
 * تحميل مورد من الـ API مع حالات loading / error. `reload()` مزامنة صامتة (بدون وميض)،
 * و `retry()` لإعادة المحاولة بعد خطأ (يعرض loading من جديد).
 * `loader` يجب أن يكون مرجعاً ثابتاً (دالة خدمة على مستوى الملف أو useCallback).
 */
export function useResource<T>(loader: () => Promise<T>, initial: T, channels?: readonly SyncChannel[]) {
  const [data, setData] = useState<T>(initial);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // عند تغيّر loader (مثلاً شهر آخر) نتجاهل رد الطلب القديم إن وصل متأخراً
  const latestLoader = useRef(loader);
  useEffect(() => {
    latestLoader.current = loader;
  });

  const reload = useCallback(async () => {
    try {
      const result = await loader();
      if (latestLoader.current === loader) {
        setData(result);
        setError(null);
      }
    } catch (err) {
      if (latestLoader.current === loader) setError(errorMessage(err));
    } finally {
      if (latestLoader.current === loader) setLoading(false);
    }
  }, [loader]);

  // تحديث تلقائي عند تغيير أي مستخدم للبيانات: صامت تماماً (لا loading ولا error)
  const silentSync = useCallback(async () => {
    try {
      const result = await loader();
      if (latestLoader.current === loader) setData(result);
    } catch {
      // نُبقي البيانات الحالية ونحاول عند التغيير التالي
    }
  }, [loader]);
  useLiveSync(silentSync, channels);

  const retry = useCallback(async () => {
    setLoading(true);
    await reload();
  }, [reload]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { data, setData, loading, error, reload, retry };
}
