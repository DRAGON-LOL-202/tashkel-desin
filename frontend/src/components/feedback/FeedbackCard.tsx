import { Pencil, Trash2, CheckCircle2 } from "lucide-react";
import type { Feedback } from "../../types";
import { Card } from "../ui/Card";
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
  return (
    <Card className="p-4 md:p-5 flex flex-col gap-3 hover:shadow-pop hover:-translate-y-0.5 transition-all duration-200 animate-slide-up">
      <div className="flex items-start justify-between gap-2">
        <Badge color={meta.color}>{meta.label}</Badge>
        {item.status === "resolved" && (
          <Badge color="#27C6A3">
            <span className="flex items-center gap-1">
              <CheckCircle2 size={11} /> تم الحل
            </span>
          </Badge>
        )}
      </div>
      <div>
        <h3 className="font-semibold text-[15px] text-text leading-snug">{item.title}</h3>
        <p className="text-sm text-muted mt-1.5 leading-relaxed">{item.description}</p>
      </div>
      <ImageAttachmentGallery attachments={item.attachments} />
      <div className="flex items-center justify-between pt-2 border-t border-border">
        <span className="text-xs text-muted">{formatArabicDate(item.date)}</span>
        {canManage && (
        <div className="flex items-center gap-1">
          <button
            onClick={() => onToggleStatus(item.id)}
            className="text-xs font-medium text-primary-deep hover:underline px-1.5"
          >
            {item.status === "open" ? "وضع كمحلولة" : "إعادة فتح"}
          </button>
          <button
            onClick={() => onEdit(item)}
            aria-label="تعديل"
            className="h-7 w-7 flex items-center justify-center rounded-control text-muted hover:bg-border/50 hover:text-text"
          >
            <Pencil size={14} />
          </button>
          <button
            onClick={() => onDelete(item.id)}
            aria-label="حذف"
            className="h-7 w-7 flex items-center justify-center rounded-control text-muted hover:bg-problem/10 hover:text-problem"
          >
            <Trash2 size={14} />
          </button>
        </div>
        )}
      </div>
      {item.createdByName && <p className="text-[11px] text-muted">أضافها: {item.createdByName}</p>}
    </Card>
  );
}
