import { api } from "../lib/api";

export interface PushConfig {
  /** مفاتيح VAPID مضبوطة على الخادم */
  enabled: boolean;
  publicKey: string | null;
  /** عدد أجهزتي المسجّلة */
  devices: number;
}

export interface PushTestResult {
  devices: number;
  sent: number;
  failed: number;
  removed: number;
}

export interface SerializedSubscription {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

export const pushService = {
  config(): Promise<PushConfig> {
    return api<PushConfig>("/push/config");
  },

  async subscribe(subscription: SerializedSubscription): Promise<number> {
    const { devices } = await api<{ devices: number }>("/push/subscribe", { method: "POST", body: subscription });
    return devices;
  },

  /** skipAuthEvent: فشل الإلغاء (مثلاً توكن منتهٍ أثناء الخروج) لا يجب أن يُطلق حدث تسجيل خروج جديداً */
  async unsubscribe(endpoint: string): Promise<void> {
    await api("/push/unsubscribe", { method: "POST", body: { endpoint }, skipAuthEvent: true });
  },

  test(): Promise<PushTestResult> {
    return api<PushTestResult>("/push/test", { method: "POST" });
  },
};
