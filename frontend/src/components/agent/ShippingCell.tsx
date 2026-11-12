import { useState } from "react";
import { Check } from "lucide-react";
import { Input } from "../ui/Field";

interface ShippingCellProps {
  value: number | null;
  disabled?: boolean;
  /** null = مسح السعر. تُرجع true عند النجاح */
  onSave: (value: number | null) => Promise<boolean>;
}

// سعر الشحن: يدخله المحاسب يدوياً. لا قيمة تلقائية؛ الحقل الفارغ = غير محدد.
export function ShippingCell({ value, disabled, onSave }: ShippingCellProps) {
  const initial = value === null ? "" : String(value);
  const [text, setText] = useState(initial);
  const [seen, setSeen] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);

  // مزامنة عند وصول قيمة جديدة من الخادم
  if (initial !== seen) {
    setSeen(initial);
    setText(initial);
  }

  const dirty = text.trim() !== initial;
  const commit = async () => {
    if (!dirty || busy) return;
    const n = text.trim() === "" ? null : Number(text);
    if (n !== null && (!Number.isFinite(n) || n < 0 || Math.abs(n * 100 - Math.round(n * 100)) > 1e-6)) {
      setError(true);
      return;
    }
    setError(false);
    setBusy(true);
    try {
      if (!(await onSave(n))) setText(initial);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex items-center gap-1">
      <Input
        dir="ltr"
        inputMode="decimal"
        aria-label="سعر الشحن"
        aria-invalid={error}
        placeholder="—"
        disabled={disabled || busy}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") void commit();
        }}
        className={`!w-24 !px-2 !py-1.5 text-center tabular-nums ${error ? "!border-problem" : ""}`}
      />
      {dirty && !disabled && (
        <button type="button" aria-label="حفظ سعر الشحن" onClick={() => void commit()} disabled={busy} className="flex h-8 w-8 items-center justify-center rounded-control bg-primary-deep text-background">
          <Check size={14} />
        </button>
      )}
    </div>
  );
}
