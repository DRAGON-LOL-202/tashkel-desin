import { useState } from "react";
import { Modal } from "../ui/Modal";
import { FieldWrap, Textarea } from "../ui/Field";
import { Button } from "../ui/Button";

interface StopTaskModalProps {
  open: boolean;
  onClose: () => void;
  onConfirm: (note: string) => void;
}

export function StopTaskModal({ open, onClose, onConfirm }: StopTaskModalProps) {
  const [note, setNote] = useState("");

  const handleClose = () => {
    setNote("");
    onClose();
  };

  const handleConfirm = () => {
    onConfirm(note.trim());
    handleClose();
  };

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title="إيقاف المهمة"
      description="سبب الإيقاف / ملاحظة"
      size="sm"
    >
      <FieldWrap label="الملاحظة">
        <Textarea
          autoFocus
          value={note}
          onChange={(event) => setNote(event.target.value)}
          placeholder="مثال: انتظار ملفات البراند من العميل"
        />
      </FieldWrap>
      <div className="flex justify-end gap-2 mt-2">
        <Button variant="secondary" onClick={handleClose}>
          إلغاء
        </Button>
        <Button onClick={handleConfirm}>إيقاف المهمة</Button>
      </div>
    </Modal>
  );
}
