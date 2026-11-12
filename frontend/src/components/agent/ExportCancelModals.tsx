import { useState } from "react";
import { Modal } from "../ui/Modal";
import { Button } from "../ui/Button";
import { FieldWrap, Textarea } from "../ui/Field";
import { fmtMoney } from "../inventory/format";
import type { AgentOrder } from "../../types";

interface ExportModalProps {
  open: boolean;
  onClose: () => void;
  orders: AgentOrder[];
  onConfirm: () => Promise<void>;
}

// مراجعة وتأكيد التصدير: لا خصم مخزون هنا إطلاقاً، والأوردر بعده لا يُحذف نهائياً ولا يُعدَّل.
export function ExportModal({ open, onClose, orders, onConfirm }: ExportModalProps) {
  const [busy, setBusy] = useState(false);
  const total = orders.reduce((a, o) => a + Math.round(o.sellPrice * 100), 0) / 100;
  return (
    <Modal open={open} onClose={onClose} title={`تصدير ${orders.length} ${orders.length === 1 ? "أوردر" : "أوردرات"}`} description="راجع الأوردرات قبل التأكيد" size="lg">
      <div className="mb-3 max-h-64 overflow-y-auto rounded-control border border-border">
        {orders.map((o) => (
          <div key={o.id} className="flex items-center gap-3 border-b border-border px-3 py-2 text-sm last:border-b-0">
            <span className="font-bold tabular-nums">{o.waybill}</span>
            <span className="min-w-0 flex-1 truncate">{o.customerName}</span>
            <span className="hidden min-w-0 max-w-[40%] truncate text-xs text-muted sm:block">{o.lines.map((l) => (l.quantity > 1 ? `${l.productName} × ${l.quantity}` : l.productName)).join("، ")}</span>
            <span className="tabular-nums text-muted">{fmtMoney(o.sellPrice)}</span>
          </div>
        ))}
      </div>
      <p className="mb-1 text-sm text-text">إجمالي سعر البيع: <b className="tabular-nums">{fmtMoney(total)}</b></p>
      <p className="mb-4 text-xs text-muted">بعد التصدير تظهر الأوردرات لفريق التنفيذ، ولا يمكن تعديلها أو حذفها نهائياً (الإلغاء متاح مع ذكر السبب).</p>
      <div className="flex justify-end gap-2">
        <Button variant="secondary" onClick={onClose}>
          رجوع
        </Button>
        <Button
          disabled={busy || orders.length === 0}
          onClick={async () => {
            setBusy(true);
            try {
              await onConfirm();
              onClose();
            } finally {
              setBusy(false);
            }
          }}
        >
          {busy ? "جارٍ التصدير…" : "تأكيد التصدير"}
        </Button>
      </div>
    </Modal>
  );
}

interface CancelModalProps {
  open: boolean;
  onClose: () => void;
  order: AgentOrder;
  onConfirm: (reason: string) => Promise<boolean>;
}

// إلغاء أوردر مصدَّر: السبب إلزامي (3 أحرف على الأقل كما في الباكند) + تأكيد صريح
export function CancelModal({ open, onClose, order, onConfirm }: CancelModalProps) {
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    if (reason.trim().length < 3) return setError("اكتب سبب الإلغاء (3 أحرف على الأقل)");
    setBusy(true);
    try {
      if (await onConfirm(reason.trim())) onClose();
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal open={open} onClose={onClose} title={`إلغاء الأوردر ${order.waybill}`} description="يبقى الأوردر ورقم بوليصته محفوظين، ولا يدخل في حساب مستحقاتك. لا تتأثر حركة المخزون تلقائياً." size="md">
      <FieldWrap label="سبب الإلغاء" htmlFor="cancel-reason" error={error}>
        <Textarea id="cancel-reason" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} autoFocus />
      </FieldWrap>
      <div className="flex justify-end gap-2">
        <Button variant="secondary" onClick={onClose}>
          تراجع
        </Button>
        <Button variant="danger" disabled={busy} onClick={() => void submit()}>
          {busy ? "جارٍ الإلغاء…" : "تأكيد الإلغاء"}
        </Button>
      </div>
    </Modal>
  );
}
