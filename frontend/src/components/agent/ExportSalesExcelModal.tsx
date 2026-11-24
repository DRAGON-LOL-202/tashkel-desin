import { useState, type FormEvent } from "react";
import { FileSpreadsheet } from "lucide-react";
import { Modal } from "../ui/Modal";
import { Button } from "../ui/Button";
import { FieldWrap, Input } from "../ui/Field";
import { useToast } from "../ui/ToastProvider";
import { errorMessage } from "../../lib/api";
import { todayISO } from "../../lib/date";
import { exportSalesOrdersExcel } from "../../lib/exportSalesOrders";
import { accountingService } from "../../services/agentService";

interface ExportSalesExcelModalProps {
  open: boolean;
  onClose: () => void;
  agentId?: string;
}

export function ExportSalesExcelModal({ open, onClose, agentId }: ExportSalesExcelModalProps) {
  const today = todayISO();
  const [mode, setMode] = useState<"day" | "month">("day");
  const [dayValue, setDayValue] = useState(today);
  const [monthValue, setMonthValue] = useState(today.slice(0, 7));
  const [busy, setBusy] = useState(false);
  const { show } = useToast();

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    const date = mode === "day" ? dayValue : monthValue;
    if (!date) {
      show(mode === "day" ? "اختر اليوم المطلوب" : "اختر الشهر المطلوب", "error");
      return;
    }
    setBusy(true);
    try {
      const res = await accountingService.exportOrders({
        mode,
        date,
        ...(agentId ? { agentId } : {}),
      });
      if (res.orders.length === 0) {
        show("لا توجد أوردرات مسجّلة في هذه الفترة", "info");
        return;
      }
      exportSalesOrdersExcel(res.orders, { mode, date });
      show(`تم تصدير ${res.orders.length} أوردر إلى ملف Excel بنجاح`);
      onClose();
    } catch (err) {
      show(errorMessage(err), "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="تصدير أوردرات المبيعات إلى Excel"
      description="يشمل كل الأوردرات المسجّلة والمصدَّرة بجميع حالاتها (مسجّل، منفّذ، مشحون، مسلّم، مرتجع، ملغي) مع خصم العربون."
      size="md"
    >
      <form onSubmit={(e) => void handleSubmit(e)} className="flex flex-col gap-4">
        <div>
          <span className="mb-1.5 block text-sm font-medium text-text">نطاق التصدير</span>
          <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="نطاق التصدير">
            <button
              type="button"
              onClick={() => setMode("day")}
              className={`rounded-control border px-3 py-2 text-sm font-semibold transition-colors ${
                mode === "day"
                  ? "border-primary-deep bg-primary/15 text-primary-deep"
                  : "border-border text-muted hover:text-text"
              }`}
            >
              يوم محدد
            </button>
            <button
              type="button"
              onClick={() => setMode("month")}
              className={`rounded-control border px-3 py-2 text-sm font-semibold transition-colors ${
                mode === "month"
                  ? "border-primary-deep bg-primary/15 text-primary-deep"
                  : "border-border text-muted hover:text-text"
              }`}
            >
              شهر كامل
            </button>
          </div>
        </div>

        {mode === "day" ? (
          <FieldWrap label="اختر اليوم" htmlFor="excel-export-day">
            <Input
              id="excel-export-day"
              type="date"
              dir="ltr"
              value={dayValue}
              onChange={(e) => setDayValue(e.target.value)}
              required
            />
          </FieldWrap>
        ) : (
          <FieldWrap label="اختر الشهر" htmlFor="excel-export-month">
            <Input
              id="excel-export-month"
              type="month"
              dir="ltr"
              value={monthValue}
              onChange={(e) => setMonthValue(e.target.value)}
              required
            />
          </FieldWrap>
        )}

        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="secondary" onClick={onClose} disabled={busy}>
            إلغاء
          </Button>
          <Button type="submit" disabled={busy} icon={<FileSpreadsheet size={16} />}>
            {busy ? "جارٍ التصدير…" : "تصدير Excel (.xlsx)"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
