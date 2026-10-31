import { Trash2, UserX } from "lucide-react";
import { Modal } from "../ui/Modal";
import { Button } from "../ui/Button";
import type { TeamMember } from "../../types";

interface DeleteUserDialogProps {
  target: TeamMember | null;
  busy?: boolean;
  onClose: () => void;
  /** حذف الحساب مع كل بياناته نهائياً */
  onDeleteAll: (target: TeamMember) => void;
  /** الإبقاء على البيانات وتعطيل الحساب فقط */
  onDisable: (target: TeamMember) => void;
}

export function DeleteUserDialog({ target, busy = false, onClose, onDeleteAll, onDisable }: DeleteUserDialogProps) {
  return (
    <Modal
      open={!!target}
      onClose={onClose}
      title="حذف المستخدم"
      description={target ? `ماذا تريد أن تفعل بحساب «${target.name}»؟` : undefined}
      size="md"
    >
      {target && (
        <div className="flex flex-col gap-3">
          <button
            type="button"
            disabled={busy}
            onClick={() => onDeleteAll(target)}
            className="flex items-start gap-3 rounded-control border border-problem/30 p-3 text-right transition-colors hover:bg-problem/10 disabled:pointer-events-none disabled:opacity-50"
            data-testid="delete-user-all"
          >
            <Trash2 size={18} className="mt-0.5 shrink-0 text-problem" />
            <span>
              <span className="block text-sm font-semibold text-problem">حذف الحساب وكل بياناته</span>
              <span className="block text-xs text-muted">
                تُحذف مهامه وسجلات وقته وتعليقاته وملاحظاته وأهدافه وأحداثه وحضوره نهائياً ولا يمكن التراجع. المنتجات التي أضافها تبقى في الكتالوج.
              </span>
            </span>
          </button>

          <button
            type="button"
            disabled={busy}
            onClick={() => onDisable(target)}
            className="flex items-start gap-3 rounded-control border border-border p-3 text-right transition-colors hover:border-primary-deep/40 hover:bg-primary/5 disabled:pointer-events-none disabled:opacity-50"
            data-testid="delete-user-disable"
          >
            <UserX size={18} className="mt-0.5 shrink-0 text-muted" />
            <span>
              <span className="block text-sm font-semibold text-text">الإبقاء على البيانات وتعطيل الحساب</span>
              <span className="block text-xs text-muted">لا يستطيع الدخول، وتبقى كل بياناته كما هي، ويمكنك تفعيله لاحقاً.</span>
            </span>
          </button>

          <div className="mt-1 flex justify-end">
            <Button variant="secondary" onClick={onClose} disabled={busy}>
              إلغاء
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}
