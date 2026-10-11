import { CalendarDays, CheckCircle2, Pencil, RotateCcw, Trash2 } from "lucide-react";
import type { Feedback } from "../../types";
import { Badge } from "../ui/Badge";
import { formatArabicDate } from "../../lib/date";
import { ImageAttachmentGallery } from "../ui/ImageAttachments";

const typeMap = {
  problem: { label: "مشكلة", color: "#FF6B6B", dot: "🔴" },
  operational: { label: "مشكلة تشغيل", color: "#F2B84B", dot: "🟠" },
  idea: { label: "فكرة", color: "#55C98B", dot: "🟢" },
};

interface FeedbackCardProps {
  item: Feedback;
  onEdit: (item: Feedback) => void;
  onDelete: (id: string) => void;
  onToggleStatus: (id: string) => void;
  /** المصمم لا يعدّل ولا يحذف ولا يغيّر الحالة (يفرضه الـ backend أيضاً) */
  canManage?: boolean;
}

export function FeedbackCard({ item, onEdit, onDelete, onToggleStatus, canManage = true }: FeedbackCardProps) {
  const meta = typeMap[item.type];
  const isResolved = item.status === "resolved";
  return (
    <article
      className={
        "task-card p-4 sm:p-5 flex flex-col gap-3 animate-slide-up " +
        (isResolved ? "opacity-60 hover:opacity-100" : "")
      }
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <Badge color={meta.color} outlined className="px-3.5 py-1.5 text-sm font-semibold">{meta.label}</Badge>
        {isResolved && (
          <Badge color="#27C6A3" outlined className="px-3.5 py-1.5 text-sm font-semibold">
            <span className="flex items-center gap-1">
              <CheckCircle2 size={14} /> تم الحل
            </span>
          </Badge>
        )}
      </div>

      <div>
        <h3 className="text-xl font-bold leading-snug text-text">{item.title}</h3>
        {item.createdByName && <p className="mt-1.5 text-sm text-muted">أضافها: {item.createdByName}</p>}
        <p className="mt-3 text-sm leading-7 text-muted">{item.description}</p>
      </div>

      <ImageAttachmentGallery attachments={item.attachments} />

      <div className="mt-1 flex flex-wrap items-center justify-between gap-x-4 gap-y-3 border-t border-border pt-4">
        <span className="flex items-center gap-1.5 text-sm text-muted">
          <CalendarDays size={16} className="text-primary-deep" />
          {formatArabicDate(item.date)}
        </span>
        {canManage && (
          <div className="flex flex-wrap items-center gap-2">
            {isResolved ? (
              <button type="button" onClick={() => onToggleStatus(item.id)} className="task-btn task-btn--secondary">
                <RotateCcw size={18} />إعادة فتح
              </button>
            ) : (
              <button type="button" onClick={() => onToggleStatus(item.id)} className="task-btn task-btn--primary">
                <CheckCircle2 size={18} />وضع كمحلولة
              </button>
            )}
            <button type="button" onClick={() => onEdit(item)} aria-label="تعديل" title="تعديل" className="task-icon-btn">
              <Pencil size={18} />
            </button>
            <button type="button" onClick={() => onDelete(item.id)} aria-label="حذف" title="حذف" className="task-icon-btn task-icon-btn--danger">
              <Trash2 size={18} />
            </button>
          </div>
        )}
      </div>
    </article>
  );
}
