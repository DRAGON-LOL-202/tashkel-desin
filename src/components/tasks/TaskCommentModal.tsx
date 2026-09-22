import { useEffect, useState } from "react";
import { MessageSquarePlus } from "lucide-react";
import { Modal } from "../ui/Modal";
import { FieldWrap, Textarea } from "../ui/Field";
import { Button } from "../ui/Button";

interface TaskCommentModalProps {
  open: boolean;
  onClose: () => void;
  onConfirm: (comment: string) => void;
}

export function TaskCommentModal({ open, onClose, onConfirm }: TaskCommentModalProps) {
  const [comment, setComment] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) {
      setComment("");
      setError("");
    }
  }, [open]);

  const handleClose = () => {
    setComment("");
    setError("");
    onClose();
  };

  const handleConfirm = () => {
    const trimmed = comment.trim();
    if (!trimmed) {
      setError("اكتب التعليق أولًا");
      return;
    }
    onConfirm(trimmed);
    handleClose();
  };

  return (
    <Modal open={open} onClose={handleClose} title="إضافة تعليق" description="أضف تعليقًا مرتبطًا بهذه المهمة" size="sm">
      <FieldWrap label="التعليق" error={error}>
        <Textarea
          autoFocus
          value={comment}
          onChange={(event) => {
            setComment(event.target.value);
            setError("");
          }}
          placeholder="اكتب تعليقك هنا..."
        />
      </FieldWrap>
      <div className="mt-2 flex justify-end gap-2">
        <Button variant="secondary" onClick={handleClose}>
          إلغاء
        </Button>
        <Button icon={<MessageSquarePlus size={15} />} onClick={handleConfirm}>
          حفظ التعليق
        </Button>
      </div>
    </Modal>
  );
}
