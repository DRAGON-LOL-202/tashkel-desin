import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "./Button";

interface PaginationBarProps {
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
  className?: string;
}

export function PaginationBar({ page, pageSize, total, onPageChange, className = "" }: PaginationBarProps) {
  if (total <= pageSize) return null;

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(Math.max(1, page), totalPages);
  const start = (safePage - 1) * pageSize + 1;
  const end = Math.min(total, safePage * pageSize);

  return (
    <div
      className={`flex flex-wrap items-center justify-between gap-2 border-t border-border bg-surface px-3.5 py-2.5 text-xs ${className}`}
      dir="rtl"
    >
      <span className="text-muted">
        عرض <strong className="tabular-nums text-text">{start}–{end}</strong> من{" "}
        <strong className="tabular-nums text-text">{total}</strong>
      </span>
      <div className="flex items-center gap-2">
        <Button
          type="button"
          size="sm"
          variant="secondary"
          icon={<ChevronRight size={14} />}
          disabled={safePage <= 1}
          onClick={() => onPageChange(safePage - 1)}
        >
          السابق
        </Button>
        <span className="min-w-[84px] text-center font-medium tabular-nums text-text">
          صفحة {safePage} / {totalPages}
        </span>
        <Button
          type="button"
          size="sm"
          variant="secondary"
          disabled={safePage >= totalPages}
          onClick={() => onPageChange(safePage + 1)}
        >
          <span>التالي</span>
          <ChevronLeft size={14} />
        </Button>
      </div>
    </div>
  );
}
