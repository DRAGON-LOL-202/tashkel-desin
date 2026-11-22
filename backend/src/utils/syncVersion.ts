// رقم "نسخة البيانات": يزيد عند كل عملية كتابة ناجحة (POST/PATCH/PUT/DELETE) من أي مستخدم،
// مع رقم مستقل لكل قناة (tasks/inventory/sales/accounting/users/notifications/general) حتى لا تعيد كل الصفحات التحميل دون داعٍ.
// الرقم والمشتركون في ذاكرة العملية: مناسب لخدمة بنسخة واحدة (Render). عند إعادة تشغيل الخادم يتغيّر bootId
// فتعيد الواجهات التحميل مرة واحدة فقط. عند التوسّع لعدة نسخ يجب نقله إلى مخزن مشترك (قاعدة البيانات/Redis).
export const SYNC_CHANNELS = ["tasks", "inventory", "sales", "accounting", "users", "notifications", "general"] as const;
export type SyncChannel = (typeof SYNC_CHANNELS)[number];

export interface SyncSnapshot {
  version: string;
  channels: Record<SyncChannel, number>;
}

const bootId = Date.now().toString(36);
let counter = 0;
const channelCounters: Record<SyncChannel, number> = {
  tasks: 0,
  inventory: 0,
  sales: 0,
  accounting: 0,
  users: 0,
  notifications: 0,
  general: 0,
};
const listeners = new Set<(snapshot: SyncSnapshot) => void>();

export function currentDataVersion(): string {
  return `${bootId}.${counter}`;
}

export function currentSyncSnapshot(): SyncSnapshot {
  return {
    version: currentDataVersion(),
    channels: { ...channelCounters },
  };
}

export function bumpDataVersion(affected?: SyncChannel | SyncChannel[]): void {
  counter += 1;
  const list = affected === undefined ? (["general"] as SyncChannel[]) : Array.isArray(affected) ? affected : [affected];
  for (const ch of list) channelCounters[ch] += 1;
  const snapshot = currentSyncSnapshot();
  listeners.forEach((listener) => listener(snapshot));
}

/** اشتراك في تغيّر النسخة؛ يعيد دالة لإلغاء الاشتراك */
export function onDataVersionChange(listener: (snapshot: SyncSnapshot) => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
