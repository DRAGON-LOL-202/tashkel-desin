import { useState } from "react";
import { Modal } from "../ui/Modal";
import { FieldWrap, Input, Select, Textarea } from "../ui/Field";
import { Button } from "../ui/Button";
import type { CreateGoalInput, Goal, GoalStatus, GoalType } from "../../types";
import { addDaysISO, todayISO } from "../../lib/date";

interface GoalModalProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (input: CreateGoalInput) => void;
  editing?: Goal | null;
  defaultType?: GoalType;
}

function defaultEndDate(type: GoalType, startDate: string): string {
  if (type === "weekly") return addDaysISO(startDate, 6);
  if (type === "monthly") return addDaysISO(startDate, 29);
  return addDaysISO(startDate, 89);
}

export function GoalModal({ open, onClose, onSubmit, editing, defaultType = "weekly" }: GoalModalProps) {
  const initialStartDate = editing?.startDate ?? todayISO();
  const [title, setTitle] = useState(editing?.title ?? "");
  const [description, setDescription] = useState(editing?.description ?? "");
  const [type, setType] = useState<GoalType>(editing?.type ?? defaultType);
  const [target, setTarget] = useState(String(editing?.target ?? 10));
  const [current, setCurrent] = useState(String(editing?.current ?? 0));
  const [startDate, setStartDate] = useState(initialStartDate);
  const [endDate, setEndDate] = useState(editing?.endDate ?? defaultEndDate(defaultType, initialStartDate));
  const [status, setStatus] = useState<GoalStatus>(editing?.status ?? "not_started");
  const [error, setError] = useState("");

  const handleTypeChange = (nextType: GoalType) => {
    setType(nextType);
    if (!editing) setEndDate(defaultEndDate(nextType, startDate));
  };

  const handleStartDateChange = (nextStartDate: string) => {
    setStartDate(nextStartDate);
    if (!editing) setEndDate(defaultEndDate(type, nextStartDate));
  };

  const handleSubmit = () => {
    if (!title.trim()) {
      setError("عنوان الهدف مطلوب");
      return;
    }

    const targetNum = Math.max(Number(target) || 1, 1);
    const currentNum = Math.max(Number(current) || 0, 0);
    onSubmit({
      title: title.trim(),
      description: description.trim() || undefined,
      type,
      target: targetNum,
      current: currentNum,
      startDate,
      endDate,
      status,
    });
    onClose();
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={editing ? "تعديل الهدف" : "إضافة هدف جديد"}
      description="حدد هدفاً قابلاً للقياس لفريق التصميم"
      size="lg"
    >
      <FieldWrap label="عنوان الهدف *" error={error}>
        <Input
          autoFocus
          value={title}
          onChange={(event) => {
            setTitle(event.target.value);
            setError("");
          }}
          placeholder="مثال: تصميم 20 منشور للحملة الجديدة"
        />
      </FieldWrap>

      <FieldWrap label="الوصف">
        <Textarea value={description} onChange={(event) => setDescription(event.target.value)} />
      </FieldWrap>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <FieldWrap label="نوع الهدف">
          <Select value={type} onChange={(event) => handleTypeChange(event.target.value as GoalType)}>
            <option value="weekly">أسبوعي</option>
            <option value="monthly">شهري</option>
            <option value="quarterly">ربع سنوي</option>
          </Select>
        </FieldWrap>
        <FieldWrap label="الحالة">
          <Select value={status} onChange={(event) => setStatus(event.target.value as GoalStatus)}>
            <option value="not_started">لم تبدأ</option>
            <option value="in_progress">قيد التنفيذ</option>
            <option value="paused">متوقفة</option>
            <option value="completed">مكتملة</option>
          </Select>
        </FieldWrap>
        <FieldWrap label="القيمة المستهدفة">
          <Input type="number" min={1} value={target} onChange={(event) => setTarget(event.target.value)} />
        </FieldWrap>
        <FieldWrap label="القيمة الحالية">
          <Input type="number" min={0} value={current} onChange={(event) => setCurrent(event.target.value)} />
        </FieldWrap>
        <FieldWrap label="تاريخ البداية">
          <Input type="date" value={startDate} onChange={(event) => handleStartDateChange(event.target.value)} />
        </FieldWrap>
        <FieldWrap label="تاريخ النهاية">
          <Input type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} />
        </FieldWrap>
      </div>

      <div className="flex justify-end gap-2 mt-2">
        <Button variant="secondary" onClick={onClose}>
          إلغاء
        </Button>
        <Button onClick={handleSubmit}>{editing ? "حفظ التعديلات" : "إضافة الهدف"}</Button>
      </div>
    </Modal>
  );
}
