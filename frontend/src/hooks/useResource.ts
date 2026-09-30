import { useCallback, useEffect, useState } from "react";
import { errorMessage } from "../lib/api";

/**
 * تحميل مورد من الـ API مع حالات loading / error. `reload()` مزامنة صامتة (بدون وميض)،
 * و `retry()` لإعادة المحاولة بعد خطأ (يعرض loading من جديد).
 * `loader` يجب أن يكون مرجعاً ثابتاً (دالة خدمة على مستوى الملف).
 */
export function useResource<T>(loader: () => Promise<T>, initial: T) {
  const [data, setData] = useState<T>(initial);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      setData(await loader());
      setError(null);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [loader]);

  const retry = useCallback(async () => {
    setLoading(true);
    await reload();
  }, [reload]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { data, setData, loading, error, reload, retry };
}
