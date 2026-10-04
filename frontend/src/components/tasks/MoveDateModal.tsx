import { useState } from "react";
import { Modal } from "../ui/Modal";
import { FieldWrap, Input } from "../ui/Field";
import { Button } from "../ui/Button";
import { addDaysISO } from "../../lib/date";
import type { Task } from "../../types";

interface MoveDateModalProps {
  /** المهمة الرئيسية المراد نقلها؛ بدون قيمة تكون النافذة مغلقة */
  task?: Task;
  onClose: () => void;
  /** تُرجع false عند الفشل لإبقاء النافذة مفتوحة */
  onConfirm: (id: string, date: string) => Promise<boolean> | boolean;
}

export function MoveDateModal({ task, onClose, onConfirm }: MoveDateModalProps) {
  return (
    <Modal open={!!task} onClose={onClose} title="نقل الأوردر إلى يوم" description={task?.title} size="sm">
      {task && <MoveDateForm key={task.id} task={task} onClose={onClose} onConfirm={onConfirm} />}
    </Modal>
  );
}

function MoveDateForm({ task, onClose, onConfirm }: { task: Task; onClose: () => void; onConfirm: MoveDateModalProps["onConfirm"] }) {
  const [date, setDate] = useState(addDaysISO(task.date, 1));
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!date) return setError("اختر التاريخ");
    if (date === task.date) return setError("الأوردر موجود في هذا اليوم بالفعل");
    setSubmitting(true);
    try {
      const ok = await onConfirm(task.id, date);
      if (ok !== false) onClose();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <FieldWrap label="اليوم الجديد" error={error}>
        <Input type="date" autoFocus value={date} onChange={(event) => { setDate(event.target.value); setError(""); }} />
      </FieldWrap>
      <p className="mb-3 text-xs text-muted">تنتقل المهام الفرعية غير المنتهية مع الأوردر، وتبقى المنتهية في يومها.</p>
      <div className="mt-2 flex justify-end gap-2">
        <Button variant="secondary" onClick={onClose}>إلغاء</Button>
        <Button onClick={handleSubmit} disabled={submitting}>نقل</Button>
      </div>
    </>
  );
}
