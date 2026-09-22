import { useEffect, useState } from "react";
import { Modal } from "../ui/Modal";
import { FieldWrap, Input, Textarea } from "../ui/Field";
import { Button } from "../ui/Button";
import type { CreateSeasonInput, Season } from "../../types";
import { todayISO } from "../../lib/date";

const colorOptions = ["#27C6A3", "#F2B84B", "#55C98B", "#FF6B6B", "#148D72", "#7FFFD4", "#5B8DEF", "#A78BFA"];

interface SeasonModalProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (input: CreateSeasonInput) => void;
  editing?: Season | null;
}

export function SeasonModal({ open, onClose, onSubmit, editing }: SeasonModalProps) {
  const [title, setTitle] = useState("");
  const [startDate, setStartDate] = useState(todayISO());
  const [endDate, setEndDate] = useState(todayISO());
  const [color, setColor] = useState(colorOptions[0]);
  const [description, setDescription] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (editing) {
      setTitle(editing.title);
      setStartDate(editing.startDate);
      setEndDate(editing.endDate);
      setColor(editing.color);
      setDescription(editing.description ?? "");
    } else {
      setTitle("");
      setStartDate(todayISO());
      setEndDate(todayISO());
      setColor(colorOptions[0]);
      setDescription("");
    }
    setError("");
  }, [editing, open]);

  const handleSubmit = () => {
    if (!title.trim()) {
      setError("اسم الموسم مطلوب");
      return;
    }
    if (new Date(endDate) < new Date(startDate)) {
      setError("تاريخ النهاية يجب أن يكون بعد تاريخ البداية");
      return;
    }
    onSubmit({ title: title.trim(), startDate, endDate, color, description: description.trim() || undefined });
    onClose();
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={editing ? "تعديل الموسم" : "إضافة موسم"}
      description="حدد فترة زمنية لحملة أو موسم تصميمي"
    >
      <FieldWrap label="اسم الموسم" error={error}>
        <Input
          autoFocus
          value={title}
          onChange={(e) => {
            setTitle(e.target.value);
            setError("");
          }}
          placeholder="مثال: Ramadan Campaign"
        />
      </FieldWrap>
      <div className="grid grid-cols-2 gap-3">
        <FieldWrap label="تاريخ البداية">
          <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
        </FieldWrap>
        <FieldWrap label="تاريخ النهاية">
          <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
        </FieldWrap>
      </div>
      <FieldWrap label="اللون">
        <div className="flex items-center gap-2 flex-wrap">
          {colorOptions.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setColor(c)}
              className={`h-8 w-8 rounded-full transition-transform ${
                color === c ? "ring-2 ring-offset-2 ring-primary-deep scale-105" : "hover:scale-105"
              }`}
              style={{ backgroundColor: c }}
              aria-label={c}
            />
          ))}
        </div>
      </FieldWrap>
      <FieldWrap label="الوصف (اختياري)">
        <Textarea value={description} onChange={(e) => setDescription(e.target.value)} />
      </FieldWrap>
      <div className="flex justify-end gap-2 mt-2">
        <Button variant="secondary" onClick={onClose}>
          إلغاء
        </Button>
        <Button onClick={handleSubmit}>حفظ</Button>
      </div>
    </Modal>
  );
}
