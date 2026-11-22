import { useCallback, useState } from "react";
import { RotateCcw, Search } from "lucide-react";
import { AppLayout } from "../components/layout/AppLayout";
import { Header } from "../components/header/Header";
import { Card } from "../components/ui/Card";
import { EmptyState } from "../components/ui/EmptyState";
import { Input, Select } from "../components/ui/Field";
import { ErrorState, LoadingState } from "../components/ui/StatusViews";
import { useToast } from "../components/ui/ToastProvider";
import { FollowOrdersTable } from "../components/agent/FollowOrdersTable";
import { SALES_STATUS_META } from "../components/sales/status";
import { useResource } from "../hooks/useResource";
import { useSafeAction } from "../hooks/useSafeAction";
import type { SyncChannel } from "../lib/liveSync";
import { accountingService } from "../services/agentService";
import type { AgentAccountRow, AgentAccountTotals, FollowList, FollowOrder } from "../types";

const NO_ORDERS: FollowList = {
  orders: [],
  total: 0,
  hasMore: false,
  counts: { all: 0, EXECUTED: 0, SHIPPED: 0, DELIVERED: 0, RETURNED: 0 },
};
const NO_AGENTS: { agents: AgentAccountRow[]; totals: AgentAccountTotals | null } = { agents: [], totals: null };
const STATUS_TABS = ["", "EXECUTED", "SHIPPED", "DELIVERED", "RETURNED"] as const;
const ACCOUNTING_CHANNELS: SyncChannel[] = ["accounting"];

// متابعة أوردرات المبيعات: كل أوردر وصل «تم التنفيذ» فما بعد في أوردرات مبيعات إلكترونية (يدوي أو من الفتيات)، كجدول متابعة منظم.
// المحاسب يغيّر الحالة (شحن/تسليم) من القائمة المنسدلة ويعلّم المرتجع ويدخل سعر الشحن ويعرض تفاصيل العميل والأوردر — بلا خصم مخزون ولا تعديل لمحتوى الأوردر.
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
  const orders = useResource<FollowList>(loader, NO_ORDERS, ACCOUNTING_CHANNELS);
  const agentsLoader = useCallback(async () => ({ ...(await accountingService.agents({})) }), []);
  const agents = useResource(agentsLoader, NO_AGENTS, ACCOUNTING_CHANNELS);

  const changeStatus = async (o: FollowOrder, next: "SHIPPED" | "DELIVERED") => {
    const r = await run(() => accountingService.setStatus(o.id, next));
    if (r.ok) show(next === "SHIPPED" ? `تم شحن ${o.waybill || "الأوردر"}` : `تم تسليم ${o.waybill || "الأوردر"}`);
    await orders.reload();
  };
  const flag = async (o: FollowOrder, flagged: boolean) => {
    const r = await run(() => accountingService.setReturnFlag(o.id, flagged));
    if (r.ok) show(flagged ? `عُلِّم ${o.waybill || "الأوردر"} كمرتجع` : `أُزيلت علامة المرتجع عن ${o.waybill || "الأوردر"}`);
    await orders.reload();
  };
  const shipping = async (o: FollowOrder, price: number | null) => {
    const r = await run(() => accountingService.setShipping(o.id, price));
    if (r.ok) show("تم حفظ سعر الشحن");
    await orders.reload();
    return r.ok;
  };

  const tabCount = (tab: (typeof STATUS_TABS)[number]) => {
    const c = orders.data.counts;
    if (!c) return tab === "" ? orders.data.total : 0;
    return tab === "" ? c.all : c[tab];
  };

  const hasFilters = Boolean(status || agentId || q || from || to);
  const resetFilters = () => {
    setStatus("");
    setAgentId("");
    setSearch("");
    setFrom("");
    setTo("");
  };

  return (
    <AppLayout
      headerSlot={(openMobileNav) => (
        <Header
          title="متابعة أوردرات المبيعات"
          description="متابعة كل أوردر بعد «تم التنفيذ»: الحالة، الشحن، الفتاة، وتفاصيل العميل"
          onOpenMobileNav={openMobileNav}
        />
      )}
    >
      {/* شريط تبويبات الحالة بأسلوب لوحة المتابعة */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 border-b border-border pb-3">
        <div className="flex flex-wrap items-center gap-1.5" role="tablist" aria-label="حالة الأوردر">
          {STATUS_TABS.map((s) => {
            const active = status === s;
            const n = tabCount(s);
            return (
              <button
                key={s || "all"}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setStatus(s)}
                className={`inline-flex items-center gap-2 rounded-control border px-3 py-1.5 text-xs font-semibold transition-colors ${
                  active
                    ? "border-primary-deep bg-primary/15 text-primary-deep"
                    : "border-transparent text-muted hover:border-border hover:bg-surface hover:text-text"
                }`}
              >
                <span>{s === "" ? "الكل" : SALES_STATUS_META[s].label}</span>
                <span
                  className={`rounded-full px-1.5 py-0.5 text-[11px] tabular-nums leading-none ${
                    active ? "bg-primary-deep text-background" : "bg-border/70 text-muted"
                  }`}
                >
                  {n}
                </span>
              </button>
            );
          })}
        </div>
        <span className="rounded-full border border-border bg-surface px-3 py-1 text-xs font-medium text-muted">
          المعروض: <strong className="tabular-nums text-text">{orders.data.total}</strong> أوردر
        </span>
      </div>

      {/* شريط البحث والفلترة */}
      <Card className="mb-4 p-3">
        <div className="flex flex-wrap items-center gap-2.5">
          <div className="relative min-w-[230px] flex-1">
            <Search size={15} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-muted" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="ابحث باسم العميل، رقم الهاتف، رقم البوليصة أو اسم الفتاة..."
              aria-label="بحث"
              className="!pr-9"
            />
          </div>
          <Select aria-label="الفتاة" value={agentId} onChange={(e) => setAgentId(e.target.value)} className="!w-44">
            <option value="">كل الفتيات</option>
            {agents.data.agents.map((a) => (
              <option key={a.agentId} value={a.agentId}>
                {a.agentName}
              </option>
            ))}
          </Select>
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-muted">من</span>
            <Input type="date" aria-label="من تاريخ" value={from} onChange={(e) => setFrom(e.target.value)} className="!w-40" />
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-muted">إلى</span>
            <Input type="date" aria-label="إلى تاريخ" value={to} onChange={(e) => setTo(e.target.value)} className="!w-40" />
          </div>
          {hasFilters && (
            <button
              type="button"
              onClick={resetFilters}
              className="inline-flex h-10 items-center gap-1.5 rounded-control border border-border px-3 text-xs font-medium text-muted transition-colors hover:border-primary-deep/40 hover:text-text"
            >
              <RotateCcw size={13} />
              <span>مسح</span>
            </button>
          )}
        </div>
      </Card>

      {orders.loading ? (
        <LoadingState />
      ) : orders.error ? (
        <ErrorState message={orders.error} onRetry={() => void orders.retry()} />
      ) : orders.data.orders.length === 0 ? (
        <Card>
          <EmptyState
            title="لا توجد أوردرات للمتابعة"
            description="تظهر هنا أوردرات الفتيات والأوردرات اليدوية بعد وصولها إلى «تم التنفيذ»."
          />
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <FollowOrdersTable orders={orders.data.orders} canAct onStatus={changeStatus} onFlag={flag} onShipping={shipping} />
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
