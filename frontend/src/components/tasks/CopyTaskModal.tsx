import { useState } from "react";
import { Modal } from "../ui/Modal";
import { FieldWrap, Select } from "../ui/Field";
import { Button } from "../ui/Button";
import type { Task, TeamMember } from "../../types";

interface CopyTaskModalProps {
  /** الأوردر المراد نسخه؛ بدون قيمة تكون النافذة مغلقة */
  task?: Task;
  members: TeamMember[];
  onClose: () => void;
  /** تُرجع false عند الفشل لإبقاء النافذة مفتوحة */
  onConfirm: (id: string, assigneeId: string) => Promise<boolean> | boolean;
}

export function CopyTaskModal({ task, members, onClose, onConfirm }: CopyTaskModalProps) {
  return (
    <Modal open={!!task} onClose={onClose} title="نسخ الأوردر إلى شخص آخر" description={task?.title} size="sm">
      {task && <CopyTaskForm key={task.id} task={task} members={members} onClose={onClose} onConfirm={onConfirm} />}
    </Modal>
  );
}

function CopyTaskForm({ task, members, onClose, onConfirm }: Omit<CopyTaskModalProps, "task"> & { task: Task }) {
  const others = members.filter((member) => member.id !== task.assigneeId);
  const [assigneeId, setAssigneeId] = useState(others[0]?.id ?? "");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!assigneeId) return setError("اختر الشخص");
    setSubmitting(true);
    try {
      const ok = await onConfirm(task.id, assigneeId);
      if (ok !== false) onClose();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <FieldWrap label="نسخ إلى" error={error}>
        <Select value={assigneeId} onChange={(event) => { setAssigneeId(event.target.value); setError(""); }}>
          {others.length === 0 && <option value="">لا يوجد أعضاء آخرون</option>}
          {others.map((member) => <option key={member.id} value={member.id}>{member.name}</option>)}
        </Select>
      </FieldWrap>
      <p className="mb-3 text-xs text-muted">
        نسخ كامل لنفس اليوم: المهمة وفرعياتها وصورها. تبدأ النسخة من الصفر (غير مبدوءة وبلا وقت أو تعليقات).
      </p>
      <div className="mt-2 flex justify-end gap-2">
        <Button variant="secondary" onClick={onClose}>إلغاء</Button>
        <Button onClick={handleSubmit} disabled={submitting || !assigneeId}>نسخ</Button>
      </div>
    </>
  );
}
