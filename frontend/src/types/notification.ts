export type NotificationCategory = "tasks" | "reminders" | "comments" | "admin";

export interface AppNotification {
  id: string;
  type: string;
  category: NotificationCategory;
  title: string;
  message: string;
  isRead: boolean;
  readAt: string | null;
  createdAt: string;
  actor: { id: string; name: string } | null;
  taskId: string | null;
  subtaskId: string | null;
  taskTitle: string | null;
  /** يوم المهمة (YYYY-MM-DD) للانتقال إليها */
  taskDate: string | null;
  /** لوحة المهمة: للانتقال لصفحة المهام الصحيحة */
  taskBoard?: "design" | "production";
}

export interface NotificationCounts {
  total: number;
  unread: number;
}

export interface NotificationList extends NotificationCounts {
  notifications: AppNotification[];
}

export interface NotificationQuery {
  filter?: "all" | "unread" | "read";
  category?: NotificationCategory;
  q?: string;
  from?: string;
  to?: string;
}
