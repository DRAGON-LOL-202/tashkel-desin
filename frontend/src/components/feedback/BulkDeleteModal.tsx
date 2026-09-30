import { useEffect, useMemo, useState } from "react";
import { Modal } from "../ui/Modal";
import { FieldWrap, Select } from "../ui/Field";
import { Button } from "../ui/Button";
import type { Feedback, FeedbackType } from "../../types";

export type BulkDeleteScope = "all" | FeedbackType | "dateRange";

function formatDate(date: string): string {
  return new Intl.DateTimeFormat("ar-EG", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date(`${date}T00:00:00`));
}

interface BulkDeleteModalProps {
  open: boolean;
  items: Feedback[];
  onClose: () => void;
  onConfirm: (options: { type?: FeedbackType; fromDate?: string; toDate?: string }) => void;
}

const scopeLabels: Record<BulkDeleteScope, string> = {
  all: "كل الفيدباك",
  problem: "المشاكل",
  operational: "مشاكل التشغيل",
  idea: "الأفكار",
  dateRange: "فترة زمنية",
};

export function BulkDeleteModal({ open, items, onClose, onConfirm }: BulkDeleteModalProps) {
  const [scope, setScope] = useState<BulkDeleteScope>("all");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [error, setError] = useState("");
  const availableDates = useMemo(
    () => [...new Set(items.map((item) => item.date))].sort((first, second) => first.localeCompare(second)),
    [items]
  );
  const fromDateOptions = useMemo(
    () => availableDates.filter((date) => !toDate || date <= toDate),
    [availableDates, toDate]
  );
  const toDateOptions = useMemo(
    () => availableDates.filter((date) => !fromDate || date >= fromDate),
    [availableDates, fromDate]
  );

  useEffect(() => {
    if (open) {
      setScope("all");
      setFromDate("");
      setToDate("");
      setError("");
    }
  }, [open]);

  const deleteOptions = useMemo(
    () => ({
      type: scope === "all" || scope === "dateRange" ? undefined : scope,
      fromDate: scope === "dateRange" ? fromDate : undefined,
      toDate: scope === "dateRange" ? toDate : undefined,
    }),
    [scope, fromDate, toDate]
  );

  const deleteCount = useMemo(
    () => {
      if (scope === "dateRange" && (!fromDate || !toDate)) return 0;
      return items.filter((item) => {
        const matchesType = !deleteOptions.type || item.type === deleteOptions.type;
        const matchesFromDate = !deleteOptions.fromDate || item.date >= deleteOptions.fromDate;
        const matchesToDate = !deleteOptions.toDate || item.date <= deleteOptions.toDate;
        return matchesType && matchesFromDate && matchesToDate;
      }).length;
    },
    [items, deleteOptions, scope, fromDate, toDate]
  );

  const handleConfirm = () => {
    if (scope === "dateRange" && (!fromDate || !toDate)) {
      setError("حدد تاريخ البداية والنهاية");
      return;
    }
    if (scope === "dateRange" && fromDate > toDate) {
      setError("تاريخ البداية يجب أن يكون قبل تاريخ النهاية");
      return;
    }
    if (deleteCount === 0) {
      setError("لا توجد ملاحظات ضمن الاختيار الحالي");
      return;
    }
    onConfirm(deleteOptions);
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="حذف الفيدباك"
      description="اختر الملاحظات التي تريد حذفها. لا يمكن التراجع عن هذا الإجراء."
      size="sm"
    >
      <FieldWrap label="نطاق الحذف">
        <Select
          value={scope}
          onChange={(event) => {
            setScope(event.target.value as BulkDeleteScope);
            setError("");
          }}
        >
          {Object.entries(scopeLabels).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </Select>
      </FieldWrap>

      {scope === "dateRange" && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <FieldWrap label="من تاريخ" htmlFor="feedback-delete-from" error={error && !fromDate ? error : undefined}>
            <Select
              id="feedback-delete-from"
              value={fromDate}
              onChange={(event) => {
                const nextFromDate = event.target.value;
                setFromDate(nextFromDate);
                if (toDate && nextFromDate > toDate) setToDate("");
                setError("");
              }}
            >
              <option value="">اختر تاريخ البداية</option>
              {fromDateOptions.map((date) => (
                <option key={date} value={date}>
                  {formatDate(date)}
                </option>
              ))}
            </Select>
          </FieldWrap>
          <FieldWrap label="إلى تاريخ" htmlFor="feedback-delete-to">
            <Select
              id="feedback-delete-to"
              value={toDate}
              onChange={(event) => {
                const nextToDate = event.target.value;
                setToDate(nextToDate);
                if (fromDate && nextToDate && nextToDate < fromDate) setFromDate("");
                setError("");
              }}
            >
              <option value="">اختر تاريخ النهاية</option>
              {toDateOptions.map((date) => (
                <option key={date} value={date}>
                  {formatDate(date)}
                </option>
              ))}
            </Select>
          </FieldWrap>
        </div>
      )}

      {error && <p className="mb-3 text-xs text-problem">{error}</p>}
      <p className="rounded-control bg-problem/10 px-3 py-2 text-sm text-text">
        سيتم حذف <strong>{deleteCount}</strong> من {scopeLabels[scope]}.
      </p>
      <div className="mt-4 flex justify-end gap-2">
        <Button variant="secondary" onClick={onClose}>
          إلغاء
        </Button>
        <Button variant="danger" onClick={handleConfirm} disabled={deleteCount === 0}>
          حذف
        </Button>
      </div>
    </Modal>
  );
}
