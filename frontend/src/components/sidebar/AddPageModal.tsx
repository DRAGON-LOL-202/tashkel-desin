import { Modal } from "../ui/Modal";
import { Button } from "../ui/Button";
import { Sparkles } from "lucide-react";

export function AddPageModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Modal open={open} onClose={onClose} title="إضافة صفحة جديدة" size="sm">
      <div className="flex flex-col items-center text-center py-4">
        <div className="h-12 w-12 rounded-2xl bg-primary/10 text-primary-deep flex items-center justify-center mb-4">
          <Sparkles size={22} />
        </div>
        <p className="text-sm text-muted leading-relaxed mb-5">
          يمكنك قريبًا إضافة صفحات مخصصة جديدة لفريق التصميم حسب احتياجاتك. هذه الميزة قيد التطوير حاليًا.
        </p>
        <Button onClick={onClose} className="w-full justify-center">
          حسنًا
        </Button>
      </div>
    </Modal>
  );
}
