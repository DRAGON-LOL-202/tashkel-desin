import { api } from "../lib/api";
import type { AppNotification, NotificationCounts, NotificationList, NotificationQuery } from "../types";

export const notificationsService = {
  async list(query: NotificationQuery = {}): Promise<NotificationList> {
    const params = new URLSearchParams();
    if (query.filter && query.filter !== "all") params.set("filter", query.filter);
    if (query.category) params.set("category", query.category);
    if (query.q?.trim()) params.set("q", query.q.trim());
    if (query.from) params.set("from", query.from);
    if (query.to) params.set("to", query.to);
    const qs = params.toString();
    return api<NotificationList>(`/notifications${qs ? `?${qs}` : ""}`);
  },

  /** عدّاد خفيف للقائمة الجانبية */
  counts(): Promise<NotificationCounts> {
    return api<NotificationCounts>("/notifications/unread-count");
  },

  async setRead(id: string, isRead = true): Promise<AppNotification> {
    const { notification } = await api<{ notification: AppNotification }>(`/notifications/${id}/read`, {
      method: "PATCH",
      body: { isRead },
    });
    return notification;
  },

  async markAllRead(): Promise<void> {
    await api("/notifications/read-all", { method: "POST" });
  },

  async remove(id: string): Promise<void> {
    await api(`/notifications/${id}`, { method: "DELETE" });
  },

  async removeRead(): Promise<number> {
    const { deleted } = await api<{ deleted: number }>("/notifications/read", { method: "DELETE" });
    return deleted;
  },
};
