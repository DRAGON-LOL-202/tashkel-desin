import { AtSign, Bell, CheckCheck, CheckCircle2, Clock, MessageSquare, Paperclip, RotateCcw, Trash2, UserCog, UserPlus, ListChecks, CalendarClock, AlarmClock, type LucideIcon } from "lucide-react";
import { formatArabicDate, formatArabicTime } from "../../lib/date";
import { IconButton } from "../ui/IconButton";
import type { AppNotification } from "../../types";

const iconByType: Record<string, LucideIcon> = {
  TASK_ASSIGNED: ListChecks,
  TASK_REASSIGNED: UserCog,
  TASK_DATE_CHANGED: CalendarClock,
  TASK_STATUS_CHANGED: Clock,
  TASK_COMPLETED: CheckCircle2,
  TASK_REOPENED: RotateCcw,
  SUBTASK_ADDED: ListChecks,
  SUBTASK_COMPLETED: CheckCircle2,
  TASK_DUE_SOON: AlarmClock,
  TASK_OVERDUE: AlarmClock,
  TIMER_WARNING_10: AlarmClock,
  TIMER_WARNING_1: AlarmClock,
  TIMER_EXPIRED: AlarmClock,
  COMMENT_ADDED: MessageSquare,
  COMMENT_REPLY: MessageSquare,
  MENTION: AtSign,
  ATTACHMENT_ADDED: Paperclip,
  USER_CREATED: UserPlus,
  ROLE_CHANGED: UserCog,
  ANNOUNCEMENT: Bell,
  ADMIN_TASK_ASSIGNED: ListChecks,
  INVENTORY_LOW: AlarmClock,
};

const colorByCategory: Record<string, string> = {
  tasks: "#3FA796",
  reminders: "#F2B84B",
  comments: "#5B9BD5",
  admin: "#B388EB",
};

interface NotificationItemProps {
  item: AppNotification;
  onOpen: (item: AppNotification) => void;
  onToggleRead: (item: AppNotification) => void;
  onDelete: (item: AppNotification) => void;
}

export function NotificationItem({ item, onOpen, onToggleRead, onDelete }: NotificationItemProps) {
  const Icon = iconByType[item.type] ?? Bell;
  const color = colorByCategory[item.category] ?? "#78847F";
  return (
    <div
      className={`flex items-start gap-3 rounded-card border p-4 transition-colors ${
        item.isRead ? "border-border bg-surface" : "border-primary-deep/30 bg-primary/5"
      }`}
      data-testid={`notification-${item.id}`}
    >
      <button type="button" onClick={() => onOpen(item)} className="flex min-w-0 flex-1 items-start gap-3 text-right">
        <span
          className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-full"
          style={{ backgroundColor: `${color}22`, color }}
        >
          <Icon size={18} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-2">
            <span className={`truncate text-sm ${item.isRead ? "font-medium text-text" : "font-bold text-text"}`}>{item.title}</span>
            {!item.isRead && <span className="h-2 w-2 shrink-0 rounded-full bg-primary-deep" aria-label="غير مقروء" />}
          </span>
          <span className="mt-0.5 block text-sm text-muted">{item.message}</span>
          <span className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
            {item.actor && <span>بواسطة: {item.actor.name}</span>}
            {item.taskTitle && <span className="truncate">المهمة: {item.taskTitle}</span>}
            <span>
              {formatArabicDate(item.createdAt)} · {formatArabicTime(item.createdAt)}
            </span>
          </span>
        </span>
      </button>
      <div className="flex shrink-0 items-center gap-1">
        <IconButton
          onClick={() => onToggleRead(item)}
          aria-label={item.isRead ? "تحديد كغير مقروء" : "تحديد كمقروء"}
          title={item.isRead ? "تحديد كغير مقروء" : "تحديد كمقروء"}
        >
          <CheckCheck size={16} />
        </IconButton>
        <IconButton
          onClick={() => onDelete(item)}
          aria-label="حذف الإشعار"
          title="حذف"
          className="hover:!bg-problem/10 hover:!text-problem"
        >
          <Trash2 size={16} />
        </IconButton>
      </div>
    </div>
  );
}
