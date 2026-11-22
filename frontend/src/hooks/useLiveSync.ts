import { useEffect, useRef } from "react";
import { subscribeLiveSync, type SyncChannel } from "../lib/liveSync";

/**
 * يستدعي `onChange` تلقائياً كلما غيّر أي مستخدم بيانات في القنوات المتابعة (إضافة/تعديل/حذف).
 * `onChange` يجب أن يكون تحديثاً صامتاً: بدون شاشة تحميل وبدون رسالة خطأ عند الفشل.
 */
export function useLiveSync(onChange: () => void | Promise<unknown>, channels?: readonly SyncChannel[]) {
  const latest = useRef(onChange);
  const channelsRef = useRef(channels);

  useEffect(() => {
    latest.current = onChange;
    channelsRef.current = channels;
  });

  const channelKey = channels ? channels.join(",") : "";
  useEffect(
    () => subscribeLiveSync(() => latest.current(), channelsRef.current),
    [channelKey]
  );
}
