import { useState } from "react";
import { History, Truck, PackageCheck, Flag } from "lucide-react";
import { Badge } from "../ui/Badge";
import { Button } from "../ui/Button";
import { fmtMoney } from "../inventory/format";
import { formatArabicDate } from "../../lib/date";
import { rowBadge } from "./meta";
import { ShippingCell } from "./ShippingCell";
import { OrderLogModal } from "./OrderLogModal";
import type { FollowOrder } from "../../types";

interface FollowOrderRowProps {
  order: FollowOrder;
  /** المحاسب والإدارة: أزرار الحالة والمرتجع وسعر الشحن. بدونها: عرض فقط */
  canAct: boolean;
  onStatus: (o: FollowOrder, status: "SHIPPED" | "DELIVERED") => Promise<void>;
  onFlag: (o: FollowOrder, flagged: boolean) => Promise<void>;
  onShipping: (o: FollowOrder, price: number | null) => Promise<boolean>;
  showAgent?: boolean;
}

// سطر في قائمة المتابعة (ليس كرتاً كبيراً): بوليصة، بوكس، فتاة، تاريخ، سعر بيع، شحن، حالة، إجراءات
export function FollowOrderRow({ order: o, canAct, onStatus, onFlag, onShipping, showAgent = true }: FollowOrderRowProps) {
  const [busy, setBusy] = useState(false);
  const [logOpen, setLogOpen] = useState(false);
  const badge = rowBadge(o.status, o.returnFlagged, o.cancelled);
  const locked = o.cancelled || o.status === "RETURNED";
  const act = async (fn: () => Promise<void>) => {
    setBusy(true);
    try {
      await fn();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={`flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-border px-3 py-2.5 text-sm last:border-b-0 ${o.counted ? "" : "opacity-90"}`}>
      <span className="w-20 shrink-0 font-bold tabular-nums text-text">{o.waybill}</span>
      <span className="min-w-[140px] flex-1 truncate text-text" title={o.boxName}>
        {o.boxName}
      </span>
      {showAgent && <span className="w-28 shrink-0 truncate text-muted">{o.agentName}</span>}
      <span className="w-24 shrink-0 text-xs text-muted">{formatArabicDate(o.date, "d MMM yyyy")}</span>
      <span className="w-24 shrink-0 text-end font-semibold tabular-nums">{o.sellPrice === null ? "—" : fmtMoney(o.sellPrice)}</span>
      {canAct ? (
        <ShippingCell value={o.shippingPrice} disabled={o.cancelled || o.status === "REGISTERED"} onSave={(v) => onShipping(o, v)} />
      ) : (
        <span className="w-24 text-center tabular-nums text-muted">{o.shippingPrice === null ? "—" : fmtMoney(o.shippingPrice)}</span>
      )}
      <Badge color={badge.color}>{badge.label}</Badge>
      <div className="ms-auto flex flex-wrap items-center gap-1.5">
        {canAct && !locked && (
          <>
            {o.status !== "SHIPPED" && (
              <Button size="sm" variant="secondary" icon={<Truck size={13} />} disabled={busy} onClick={() => void act(() => onStatus(o, "SHIPPED"))}>
                شحن
              </Button>
            )}
            {o.status !== "DELIVERED" && (
              <Button size="sm" variant="secondary" icon={<PackageCheck size={13} />} disabled={busy} onClick={() => void act(() => onStatus(o, "DELIVERED"))}>
                تم التسليم
              </Button>
            )}
          </>
        )}
        {canAct && !o.cancelled && o.status !== "RETURNED" && (
          <Button size="sm" variant={o.returnFlagged ? "primary" : "danger"} icon={<Flag size={13} />} disabled={busy} onClick={() => void act(() => onFlag(o, !o.returnFlagged))}>
            {o.returnFlagged ? "إزالة علامة المرتجع" : "تعليم كمرتجع"}
          </Button>
        )}
        <button type="button" aria-label="سجل التغييرات" title="سجل التغييرات" onClick={() => setLogOpen(true)} className="flex h-8 w-8 items-center justify-center rounded-control text-muted hover:bg-border/50 hover:text-text">
          <History size={15} />
        </button>
      </div>
      {logOpen && <OrderLogModal open orderId={o.id} waybill={o.waybill} onClose={() => setLogOpen(false)} />}
    </div>
  );
}
