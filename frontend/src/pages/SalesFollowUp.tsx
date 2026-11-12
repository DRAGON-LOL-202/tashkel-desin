import { useCallback, useMemo, useState } from "react";
import { Search } from "lucide-react";
import { AppLayout } from "../components/layout/AppLayout";
import { Header } from "../components/header/Header";
import { Card } from "../components/ui/Card";
import { EmptyState } from "../components/ui/EmptyState";
import { Input, Select } from "../components/ui/Field";
import { ErrorState, LoadingState } from "../components/ui/StatusViews";
import { useToast } from "../components/ui/ToastProvider";
import { FollowOrderRow } from "../components/agent/FollowOrderRow";
import { SALES_STATUS_META } from "../components/sales/status";
import { useResource } from "../hooks/useResource";
import { useSafeAction } from "../hooks/useSafeAction";
import { accountingService } from "../services/agentService";
import type { AgentAccountRow, AgentAccountTotals, FollowList, FollowOrder } from "../types";

const NO_ORDERS: FollowList = { orders: [], total: 0, hasMore: false };
const NO_AGENTS: { agents: AgentAccountRow[]; totals: AgentAccountTotals | null } = { agents: [], totals: null };
const STATUS_TABS = ["", "EXECUTED", "SHIPPED", "DELIVERED", "RETURNED"] as const;

// متابعة أوردرات المبيعات: أوردرات الفتيات التي وصلت «تم التنفيذ» فما بعد، كقائمة أسطر.
// المحاسب يغيّر الحالة (شحن/تسليم) ويعلّم المرتجع ويدخل سعر الشحن — بلا خصم مخزون ولا تعديل لمحتوى الأوردر.
export default function SalesFollowUpPage() {
  const [status, setStatus] = useState<(typeof STATUS_TABS)[number]>("");
  const [agentId, setAgentId] = useState("");
  const [search, setSearch] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const { show } = useToast();
  const run = useSafeAction();

  const q = search.trim();
  const loader = useCallback(() => accountingService.followOrders({ status, agentId, q, from, to }), [status, agentId, q, from, to]);
  const orders = useResource<FollowList>(loader, NO_ORDERS);
  const agentsLoader = useCallback(async () => ({ ...(await accountingService.agents({})) }), []);
  const agents = useResource(agentsLoader, NO_AGENTS);

  const changeStatus = async (o: FollowOrder, next: "SHIPPED" | "DELIVERED") => {
    const r = await run(() => accountingService.setStatus(o.id, next));
    if (r.ok) show(next === "SHIPPED" ? `تم شحن ${o.waybill}` : `تم تسليم ${o.waybill}`);
    await orders.reload();
  };
  const flag = async (o: FollowOrder, flagged: boolean) => {
    const r = await run(() => accountingService.setReturnFlag(o.id, flagged));
    if (r.ok) show(flagged ? `عُلِّم ${o.waybill} كمرتجع` : `أُزيلت علامة المرتجع عن ${o.waybill}`);
    await orders.reload();
  };
  const shipping = async (o: FollowOrder, price: number | null) => {
    const r = await run(() => accountingService.setShipping(o.id, price));
    if (r.ok) show("تم حفظ سعر الشحن");
    await orders.reload();
    return r.ok;
  };

  const counts = useMemo(() => {
    const m = new Map<string, number>();
    for (const o of orders.data.orders) m.set(o.status, (m.get(o.status) ?? 0) + 1);
    return m;
  }, [orders.data.orders]);

  return (
    <AppLayout headerSlot={(openMobileNav) => <Header title="متابعة أوردرات المبيعات" description="أوردرات الفتيات بعد «تم التنفيذ»: شحن، تسليم، مرتجع، وسعر الشحن" onOpenMobileNav={openMobileNav} />}>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="حالة الأوردر">
          {STATUS_TABS.map((s) => (
            <button
              key={s || "all"}
              role="tab"
              aria-selected={status === s}
              onClick={() => setStatus(s)}
              className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${status === s ? "border-primary-deep bg-primary/15 text-primary-deep" : "border-border text-muted hover:text-text"}`}
            >
              {s === "" ? "الكل" : SALES_STATUS_META[s].label}
              {status === "" && s !== "" && counts.get(s) ? ` (${counts.get(s)})` : ""}
            </button>
          ))}
        </div>
        <Select aria-label="الفتاة" value={agentId} onChange={(e) => setAgentId(e.target.value)} className="!w-44">
          <option value="">كل الفتيات</option>
          {agents.data.agents.map((a) => (
            <option key={a.agentId} value={a.agentId}>
              {a.agentName}
            </option>
          ))}
        </Select>
        <Input type="date" aria-label="من تاريخ" value={from} onChange={(e) => setFrom(e.target.value)} className="!w-40" />
        <Input type="date" aria-label="إلى تاريخ" value={to} onChange={(e) => setTo(e.target.value)} className="!w-40" />
        <div className="relative min-w-[200px] flex-1 sm:max-w-xs">
          <Search size={15} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-muted" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="بحث برقم البوليصة أو اسم الفتاة" aria-label="بحث" className="!pr-9" />
        </div>
      </div>

      {orders.loading ? (
        <LoadingState />
      ) : orders.error ? (
        <ErrorState message={orders.error} onRetry={() => void orders.retry()} />
      ) : orders.data.orders.length === 0 ? (
        <Card>
          <EmptyState title="لا توجد أوردرات للمتابعة" description="تظهر هنا أوردرات الفتيات بعد وصولها إلى «تم التنفيذ»." />
        </Card>
      ) : (
        <Card className="overflow-hidden">
          {orders.data.orders.map((o) => (
            <FollowOrderRow key={o.id} order={o} canAct onStatus={changeStatus} onFlag={flag} onShipping={shipping} />
          ))}
          {orders.data.hasMore && (
            <p className="border-t border-border px-3 py-2 text-center text-xs text-muted" role="status">
              يعرض أول {orders.data.orders.length} من {orders.data.total} أوردر — ضيّق البحث أو الفترة لعرض الباقي.
            </p>
          )}
        </Card>
      )}
    </AppLayout>
  );
}
