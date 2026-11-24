import { useState } from "react";
import { Check } from "lucide-react";
import { Input } from "../ui/Field";
import { fmtMoney } from "../inventory/format";

interface DepositCellProps {
  baseDeposit: number;
  extraDeposit: number;
  disabled?: boolean;
  /** null = مسح العربون الإضافي (إرجاعه لصفر). تُرجع true عند النجاح */
  onSave: (value: number | null) => Promise<boolean>;
}

// خانة العربون للمحاسب بجوار الشحن: تعرض عربون الفتاة ثابتاً مع حقل «عربون إضافي» يُجمع عليه تلقائياً.
export function DepositCell({ baseDeposit, extraDeposit, disabled, onSave }: DepositCellProps) {
  const initial = extraDeposit > 0 ? String(extraDeposit) : "";
  const [text, setText] = useState(initial);
  const [seen, setSeen] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);

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

  const total = Math.round((baseDeposit + extraDeposit) * 100) / 100;

  return (
    <div className="flex flex-col gap-1">
      {baseDeposit > 0 && (
        <span className="text-[11px] tabular-nums text-muted">
          الفتاة: <strong className="text-text">{fmtMoney(baseDeposit)}</strong>
        </span>
      )}
      <div className="flex items-center gap-1">
        <Input
          dir="ltr"
          inputMode="decimal"
          aria-label="عربون إضافي"
          aria-invalid={error}
          placeholder={baseDeposit > 0 ? "إضافي 0" : "0"}
          disabled={disabled || busy}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void commit();
          }}
          className={`!w-24 !px-2 !py-1.5 text-center tabular-nums ${error ? "!border-problem" : ""}`}
        />
        {dirty && !disabled && (
          <button
            type="button"
            aria-label="حفظ العربون الإضافي"
            onClick={() => void commit()}
            disabled={busy}
            className="flex h-8 w-8 items-center justify-center rounded-control bg-primary-deep text-background"
          >
            <Check size={14} />
          </button>
        )}
      </div>
      {baseDeposit > 0 && extraDeposit > 0 && (
        <span className="text-[11px] font-semibold tabular-nums text-primary-deep">
          الإجمالي: {fmtMoney(total)}
        </span>
      )}
    </div>
  );
}
