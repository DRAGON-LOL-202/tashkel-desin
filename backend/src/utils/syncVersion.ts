// رقم "نسخة البيانات": يزيد عند كل عملية كتابة ناجحة (POST/PATCH/PUT/DELETE) من أي مستخدم.
// الواجهة تتلقى الرقم فوراً عبر اتصال مفتوح (GET /api/sync/stream) وتعيد تحميل بياناتها فقط إذا تغيّر،
// فيظهر ما أضافه أي شخص عند الجميع تلقائياً بدون رفرش. (GET /api/sync للفحص الدوري كشبكة أمان.)
// الرقم والمشتركون في ذاكرة العملية: مناسب لخدمة بنسخة واحدة (Render). عند إعادة تشغيل الخادم يتغيّر bootId
// فتعيد الواجهات التحميل مرة واحدة فقط. عند التوسّع لعدة نسخ يجب نقله إلى مخزن مشترك (قاعدة البيانات/Redis).
const bootId = Date.now().toString(36);
let counter = 0;
const listeners = new Set<(version: string) => void>();

export function currentDataVersion(): string {
  return `${bootId}.${counter}`;
}

export function bumpDataVersion(): void {
  counter += 1;
  const version = currentDataVersion();
  listeners.forEach((listener) => listener(version));
}

/** اشتراك في تغيّر الرقم؛ يعيد دالة لإلغاء الاشتراك */
export function onDataVersionChange(listener: (version: string) => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
