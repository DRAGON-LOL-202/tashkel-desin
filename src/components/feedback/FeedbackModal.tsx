import { useEffect, useState } from "react";
import { Modal } from "../ui/Modal";
import { FieldWrap, Input, Textarea, Select } from "../ui/Field";
import { Button } from "../ui/Button";
import type { CreateFeedbackInput, Feedback, FeedbackType } from "../../types";
import { todayISO } from "../../lib/date";

interface FeedbackModalProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (input: CreateFeedbackInput) => void;
  editing?: Feedback | null;
}

export function FeedbackModal({ open, onClose, onSubmit, editing }: FeedbackModalProps) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [type, setType] = useState<FeedbackType>("problem");
  const [date, setDate] = useState(todayISO());
  const [error, setError] = useState("");

  useEffect(() => {
    if (editing) {
      setTitle(editing.title);
      setDescription(editing.description);
      setType(editing.type);
      setDate(editing.date);
    } else {
      setTitle("");
      setDescription("");
      setType("problem");
      setDate(todayISO());
    }
    setError("");
  }, [editing, open]);

  const handleSubmit = () => {
    if (!title.trim()) {
      setError("عنوان الملاحظة مطلوب");
      return;
    }
    onSubmit({ title: title.trim(), description: description.trim(), type, date });
    onClose();
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={editing ? "تعديل الملاحظة" : "ملاحظة جديدة"}
      description="سجل مشكلة أو فكرة لفريق التصميم"
    >
      <FieldWrap label="عنوان الملاحظة" error={error}>
        <Input
          autoFocus
          value={title}
          onChange={(e) => {
            setTitle(e.target.value);
            setError("");
          }}
          placeholder="مثال: Photoshop يتوقف أثناء التصدير"
        />
      </FieldWrap>
      <FieldWrap label="التفاصيل">
        <Textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="اشرح التفاصيل..."
        />
      </FieldWrap>
      <div className="grid grid-cols-2 gap-3">
        <FieldWrap label="التصنيف">
          <Select value={type} onChange={(e) => setType(e.target.value as FeedbackType)}>
            <option value="problem">مشكلة</option>
            <option value="operational">مشكلة تشغيل</option>
            <option value="idea">فكرة</option>
          </Select>
        </FieldWrap>
        <FieldWrap label="التاريخ">
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </FieldWrap>
      </div>
      <div className="flex justify-end gap-2 mt-2">
        <Button variant="secondary" onClick={onClose}>
          إلغاء
        </Button>
        <Button onClick={handleSubmit}>حفظ</Button>
      </div>
    </Modal>
  );
}
