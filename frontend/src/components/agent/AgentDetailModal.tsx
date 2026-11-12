import { useCallback, useState } from "react";
import { Modal } from "../ui/Modal";
import { ErrorState, LoadingState } from "../ui/StatusViews";
import { StatTile } from "./StatTile";
import { FollowOrderRow } from "./FollowOrderRow";
import { BUCKET_LABEL, BUCKET_ORDER } from "./meta";
import { fmtMoney } from "../inventory/format";
import { useResource } from "../../hooks/useResource";
import { accountingService } from "../../services/agentService";
import type { AgentAccountDetail, AgentBucket } from "../../types";

const EMPTY: AgentAccountDetail = {
  agent: { id: "", name: "" },
  summary: { total: 0, unexported: 0, exported: 0, executed: 0, shipped: 0, delivered: 0, returned: 0, cancelled: 0, deliveredSales: 0, deliveredCount: 0, fixedFee: 0, commission: 0, totalDue: 0 },
  orders: [],
  ordersTotal: 0,
  hasMore: false,
};

interface AgentDetailModalProps {
  open: boolean;
  onClose: () => void;
  agentId: string;
  agentName: string;
  from: string;
  to: string;
}

// حساب فتاة بالتفصيل: تفاصيل المستحقات + الأوردرات التي تكوّن كل رقم (تصفية بالفئة). عرض فقط.
export function AgentDetailModal({ open, onClose, agentId, agentName, from, to }: AgentDetailModalProps) {
  const [bucket, setBucket] = useState<AgentBucket>("delivered");
  const loader = useCallback(() => accountingService.agent(agentId, bucket, { from, to }), [agentId, bucket, from, to]);
  const detail = useResource<AgentAccountDetail>(loader, EMPTY);
  const s = detail.data.summary;
  const noop = async () => {};

  return (
    <Modal open={open} onClose={onClose} title={`حساب ${agentName}`} description="مراجعة الأوردرات وتفاصيل المستحقات" size="xl">
      {detail.error ? (
        <ErrorState message={detail.error} onRetry={() => void detail.retry()} />
      ) : (
        <>
          <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
            <StatTile label="إجمالي الأوردرات" value={s.total} onClick={() => setBucket("all")} active={bucket === "all"} />
            <StatTile label="مسلّمة" value={s.delivered} color="#1E8E5A" onClick={() => setBucket("delivered")} active={bucket === "delivered"} />
            <StatTile label="مشحونة" value={s.shipped} color="#D97706" onClick={() => setBucket("shipped")} active={bucket === "shipped"} />
            <StatTile label="مرتجعة" value={s.returned} color="#D64545" onClick={() => setBucket("returned")} active={bucket === "returned"} />
          </div>
          <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
            <StatTile label="قيمة المبيعات المسلّمة" value={fmtMoney(s.deliveredSales)} />
            <StatTile label="المقابل الثابت" value={fmtMoney(s.fixedFee)} hint="7 ج × المسلّمة" />
            <StatTile label="عمولة 3%" value={fmtMoney(s.commission)} />
            <StatTile label="إجمالي المستحقات" value={fmtMoney(s.totalDue)} color="#1E8E5A" />
          </div>
          <div className="mb-3 flex flex-wrap gap-1.5" role="tablist">
            {BUCKET_ORDER.filter((b) => b !== "draft").map((b) => (
              <button key={b} role="tab" aria-selected={bucket === b} onClick={() => setBucket(b)} className={`rounded-full border px-3 py-1 text-xs font-medium ${bucket === b ? "border-primary-deep bg-primary/15 text-primary-deep" : "border-border text-muted hover:text-text"}`}>
                {BUCKET_LABEL[b]}
              </button>
            ))}
          </div>
          {detail.loading ? (
            <LoadingState />
          ) : detail.data.orders.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted">لا توجد أوردرات في هذه الفئة.</p>
          ) : (
            <div className="max-h-[45vh] overflow-y-auto rounded-control border border-border">
              {detail.data.orders.map((o) => (
                <FollowOrderRow key={o.id} order={o} canAct={false} showAgent={false} onStatus={noop} onFlag={noop} onShipping={async () => false} />
              ))}
              {detail.data.hasMore && (
                <p className="border-t border-border px-3 py-2 text-center text-xs text-muted" role="status">
                  يعرض أول {detail.data.orders.length} من {detail.data.ordersTotal} أوردر — الأرقام أعلاه محسوبة على الكل.
                </p>
              )}
            </div>
          )}
        </>
      )}
    </Modal>
  );
}
