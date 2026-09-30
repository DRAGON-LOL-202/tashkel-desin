/** معرّف محلي مؤقت لعناصر الواجهة (مثل مرفق قبل حفظه). معرّفات البيانات الفعلية تأتي من الـ backend. */
export function generateId(prefix = "id"): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}
