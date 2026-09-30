import { useEffect, useState } from "react";
import { Modal } from "../ui/Modal";
import { FieldWrap, Input, Select, Textarea } from "../ui/Field";
import { Button } from "../ui/Button";
import type { CreateTaskInput, Task, TaskPriority, TeamMember } from "../../types";
import { formatArabicDate } from "../../lib/date";
import { ImageAttachmentsField } from "../ui/ImageAttachments";
import type { ImageAttachment } from "../../types";

interface NewTaskModalProps {
  open: boolean;
  assignee?: TeamMember;
  parentTask?: Task;
  parentOptions?: Task[];
  mode: "normal" | "main" | "subtask";
  editing?: Task;
  date: string;
  onClose: () => void;
  /** تُرجع false عند فشل الحفظ لإبقاء النافذة مفتوحة وعدم فقدان ما كتبه المستخدم */
  onCreate: (input: CreateTaskInput) => Promise<boolean> | boolean | void;
  onUpdate: (id: string, input: CreateTaskInput) => Promise<boolean> | boolean | void;
}

export function NewTaskModal({
  open,
  assignee,
  parentTask,
  parentOptions = [],
  mode,
  editing,
  date,
  onClose,
  onCreate,
  onUpdate,
}: NewTaskModalProps) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState<TaskPriority>("medium");
  const [target, setTarget] = useState("1");
  const [current, setCurrent] = useState("0");
  const [selectedParentId, setSelectedParentId] = useState("");
  const [attachments, setAttachments] = useState<ImageAttachment[]>([]);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const isSubtask = mode === "subtask";

  useEffect(() => {
    if (!open) return;
    setTitle(editing?.title ?? "");
    setDescription(editing?.description ?? "");
    setPriority(editing?.priority ?? "medium");
    setTarget(String(editing?.target ?? 1));
    setCurrent(String(editing?.current ?? 0));
    setSelectedParentId(parentTask?.id ?? "");
    setAttachments(editing?.attachments ?? []);
    setError("");
  }, [open, editing, parentTask]);

  const handleSubmit = async () => {
    if (!assignee || submitting) return;
    if (!title.trim()) {
      setError("اسم المهمة مطلوب");
      return;
    }
    if (isSubtask && !parentTask && !selectedParentId) {
      setError("اختر المهمة الرئيسية");
      return;
    }

    const parsedTarget = Number(target);
    const parsedCurrent = Number(current);
    if (!Number.isInteger(parsedTarget) || parsedTarget < 1 || !Number.isInteger(parsedCurrent) || parsedCurrent < 0) {
      setError("الهدف رقم صحيح لا يقل عن 1، والإنجاز رقم صحيح لا يقل عن 0");
      return;
    }
    if (parsedCurrent > parsedTarget) {
      setError("الإنجاز الحالي لا يمكن أن يتجاوز الهدف");
      return;
    }

    const input: CreateTaskInput = {
      parentId: isSubtask ? parentTask?.id ?? selectedParentId : undefined,
      title: title.trim(),
      description: description.trim() || undefined,
      attachments,
      priority,
      target: parsedTarget,
      current: parsedCurrent,
      date,
      assigneeId: assignee.id,
    };

    setSubmitting(true);
    try {
      const saved = editing ? await onUpdate(editing.id, input) : await onCreate(input);
      if (saved !== false) onClose();
    } finally {
      setSubmitting(false);
    }
  };

  const modalTitle = editing ? "تعديل المهمة" : isSubtask ? "إضافة مهمة فرعية" : mode === "main" ? "إضافة مهمة رئيسية" : "مهمة جديدة";

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={modalTitle}
      description={parentTask ? "ضمن: " + parentTask.title : assignee ? "إضافة مهمة إلى " + assignee.name : ""}
    >
      <div className="grid grid-cols-1 gap-3 mb-4 sm:grid-cols-2">
        <div className="rounded-control border border-border bg-background px-3 py-2">
          <p className="text-xs text-muted">المسؤول</p>
          <p className="text-sm font-semibold text-text">{assignee?.name ?? "--"}</p>
        </div>
        <div className="rounded-control border border-border bg-background px-3 py-2">
          <p className="text-xs text-muted">التاريخ</p>
          <p className="text-sm font-semibold text-text">{formatArabicDate(date, "EEEE، d MMMM yyyy")}</p>
        </div>
      </div>

      {isSubtask && !parentTask && !editing && (
        <FieldWrap label="المهمة الرئيسية" error={error && !selectedParentId ? error : undefined}>
          <Select value={selectedParentId} onChange={(event) => { setSelectedParentId(event.target.value); setError(""); }}>
            <option value="">اختر المهمة الرئيسية</option>
            {parentOptions.map((task) => <option key={task.id} value={task.id}>{task.title}</option>)}
          </Select>
        </FieldWrap>
      )}

      <FieldWrap label={isSubtask ? "اسم المهمة الفرعية *" : "اسم المهمة *"} error={error && title.trim() ? undefined : error}>
        <Input autoFocus value={title} onChange={(event) => { setTitle(event.target.value); setError(""); }} placeholder="مثال: تصميم منشورات الحملة" />
      </FieldWrap>
      <FieldWrap label="الوصف">
        <Textarea value={description} onChange={(event) => setDescription(event.target.value)} placeholder="أضف تفاصيل إضافية عن المهمة..." />
      </FieldWrap>

      <div className={"grid grid-cols-1 gap-3 " + (mode === "normal" ? "sm:grid-cols-1" : "sm:grid-cols-3")}>
        <FieldWrap label="الأولوية">
          <Select value={priority} onChange={(event) => setPriority(event.target.value as TaskPriority)}>
            <option value="low">منخفضة</option>
            <option value="medium">متوسطة</option>
            <option value="high">عالية</option>
          </Select>
        </FieldWrap>
        {mode !== "normal" && (
          <>
            <FieldWrap label="الهدف">
              <Input type="number" min="1" step="1" value={target} onChange={(event) => setTarget(event.target.value)} />
            </FieldWrap>
            <FieldWrap label="الإنجاز الحالي">
              <Input type="number" min="0" value={current} onChange={(event) => setCurrent(event.target.value)} />
            </FieldWrap>
          </>
        )}
      </div>
      <FieldWrap label="المرفقات">
        <ImageAttachmentsField value={attachments} onChange={setAttachments} scope="tasks" />
      </FieldWrap>

      <div className="mt-2 flex justify-end gap-2">
        <Button variant="secondary" onClick={onClose}>إلغاء</Button>
        <Button onClick={handleSubmit} disabled={submitting}>
          {submitting ? "جارٍ الحفظ..." : editing ? "حفظ التعديل" : "إضافة المهمة"}
        </Button>
      </div>
    </Modal>
  );
}
