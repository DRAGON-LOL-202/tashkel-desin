import { useState } from "react";
import { Modal } from "../ui/Modal";
import { FieldWrap, Input, Textarea, Select } from "../ui/Field";
import { Button } from "../ui/Button";
import type { CreateTaskInput, TaskPriority, TeamMember } from "../../types";
import { formatArabicDate } from "../../lib/date";

interface NewTaskModalProps {
  open: boolean;
  assignee?: TeamMember;
  date: string;
  onClose: () => void;
  onCreate: (input: CreateTaskInput) => void;
}

export function NewTaskModal({ open, assignee, date, onClose, onCreate }: NewTaskModalProps) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState<TaskPriority>("medium");
  const [error, setError] = useState("");

  const resetForm = () => {
    setTitle("");
    setDescription("");
    setPriority("medium");
    setError("");
  };

  const handleClose = () => {
    resetForm();
    onClose();
  };

  const handleSubmit = () => {
    if (!assignee) return;
    if (!title.trim()) {
      setError("عنوان المهمة مطلوب");
      return;
    }

    onCreate({
      title: title.trim(),
      description: description.trim() || undefined,
      priority,
      date,
      assigneeId: assignee.id,
    });
    resetForm();
    onClose();
  };

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title="مهمة جديدة"
      description={assignee ? `إضافة مهمة إلى ${assignee.name}` : "إضافة مهمة جديدة"}
    >
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
        <div className="rounded-control border border-border bg-background px-3 py-2">
          <p className="text-xs text-muted">المسؤول</p>
          <p className="text-sm font-semibold text-text">{assignee?.name ?? "--"}</p>
        </div>
        <div className="rounded-control border border-border bg-background px-3 py-2">
          <p className="text-xs text-muted">التاريخ</p>
          <p className="text-sm font-semibold text-text">{formatArabicDate(date, "EEEE، d MMMM yyyy")}</p>
        </div>
      </div>

      <FieldWrap label="عنوان المهمة *" error={error}>
        <Input
          autoFocus
          value={title}
          onChange={(event) => {
            setTitle(event.target.value);
            setError("");
          }}
          placeholder="مثال: تصميم بوست الحملة الجديدة"
        />
      </FieldWrap>
      <FieldWrap label="وصف المهمة">
        <Textarea
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          placeholder="أضف تفاصيل إضافية عن المهمة..."
        />
      </FieldWrap>
      <FieldWrap label="الأولوية">
        <Select value={priority} onChange={(event) => setPriority(event.target.value as TaskPriority)}>
          <option value="low">منخفضة</option>
          <option value="medium">متوسطة</option>
          <option value="high">عالية</option>
        </Select>
      </FieldWrap>
      <div className="flex justify-end gap-2 mt-2">
        <Button variant="secondary" onClick={handleClose}>
          إلغاء
        </Button>
        <Button onClick={handleSubmit}>إضافة المهمة</Button>
      </div>
    </Modal>
  );
}
