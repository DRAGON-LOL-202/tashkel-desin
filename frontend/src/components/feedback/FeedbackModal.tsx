import { useEffect, useState } from "react";
import { Modal } from "../ui/Modal";
import { FieldWrap, Input, Textarea, Select } from "../ui/Field";
import { Button } from "../ui/Button";
import type { CreateFeedbackInput, Feedback, FeedbackType } from "../../types";
import { todayISO } from "../../lib/date";
import { ImageAttachmentsField } from "../ui/ImageAttachments";
import type { ImageAttachment } from "../../types";

interface FeedbackModalProps {
  open: boolean;
  onClose: () => void;
  /** تُرجع false عند فشل الحفظ لإبقاء النافذة مفتوحة */
  onSubmit: (input: CreateFeedbackInput) => Promise<boolean> | boolean | void;
  editing?: Feedback | null;
}

export function FeedbackModal({ open, onClose, onSubmit, editing }: FeedbackModalProps) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [type, setType] = useState<FeedbackType>("problem");
  const [date, setDate] = useState(todayISO());
  const [attachments, setAttachments] = useState<ImageAttachment[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    if (editing) {
      setTitle(editing.title);
      setDescription(editing.description);
      setType(editing.type);
      setDate(editing.date);
      setAttachments(editing.attachments ?? []);
    } else {
      setTitle("");
      setDescription("");
      setType("problem");
      setDate(todayISO());
      setAttachments([]);
    }
    setError("");
  }, [editing, open]);

  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (submitting) return;
    if (!title.trim()) {
      setError("عنوان الملاحظة مطلوب");
      return;
    }
    setSubmitting(true);
    try {
      const saved = await onSubmit({ title: title.trim(), description: description.trim(), type, date, attachments });
      if (saved !== false) onClose();
    } finally {
      setSubmitting(false);
    }
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
      <FieldWrap label="المرفقات">
        <ImageAttachmentsField value={attachments} onChange={setAttachments} scope="feedback" />
      </FieldWrap>
      <div className="flex justify-end gap-2 mt-2">
        <Button variant="secondary" onClick={onClose}>
          إلغاء
        </Button>
        <Button onClick={handleSubmit} disabled={submitting}>حفظ</Button>
      </div>
    </Modal>
  );
}
