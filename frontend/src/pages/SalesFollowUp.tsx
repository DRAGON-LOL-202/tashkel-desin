import { useCallback, useMemo, useState } from "react";
import { Download, Printer, RotateCcw, Search, X } from "lucide-react";
import { AppLayout } from "../components/layout/AppLayout";
import { Header } from "../components/header/Header";
import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
import { ConfirmDialog } from "../components/ui/ConfirmDialog";
import { EmptyState } from "../components/ui/EmptyState";
import { Input, Select } from "../components/ui/Field";
import { PaginationBar } from "../components/ui/PaginationBar";
import { ErrorState, LoadingState } from "../components/ui/StatusViews";
import { useToast } from "../components/ui/ToastProvider";
import { FollowOrdersTable } from "../components/agent/FollowOrdersTable";
import { SALES_STATUS_META } from "../components/sales/status";
import { downloadWaybillsPdf, printWaybills, waybillFromFollowOrder } from "../lib/waybillPdf";
import { usePermissions } from "../hooks/usePermissions";
import { useResource } from "../hooks/useResource";
import { useSafeAction } from "../hooks/useSafeAction";
import type { SyncChannel } from "../lib/liveSync";
import { accountingService } from "../services/agentService";
import { salesService } from "../services/salesService";
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
const PAGE_SIZE = 50;

// متابعة أوردرات المبيعات: جدول متابعة، تغيير الحالة من القائمة المنسدلة، سعر الشحن، معاينة/طباعة البوليصة، وتحديد عدة بوالص لتحميلها كـ PDF.
export default function SalesFollowUpPage() {
  const [status, setStatus] = useState<(typeof STATUS_TABS)[number]>("");
  const [agentId, setAgentId] = useState("");
  const [search, setSearch] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [page, setPage] = useState(1);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [busyPdf, setBusyPdf] = useState(false);
  const [deletingOrder, setDeletingOrder] = useState<FollowOrder | null>(null);
  const { show } = useToast();
  const { canDeleteSalesOrders } = usePermissions();
  const run = useSafeAction();

  const q = search.trim();
  const loader = useCallback(
    () =>
      accountingService.followOrders({
        status,
        agentId,
        q,
        from,
        to,
        limit: String(PAGE_SIZE),
        offset: String((page - 1) * PAGE_SIZE),
      }),
    [status, agentId, q, from, to, page]
  );
  const orders = useResource<FollowList>(loader, NO_ORDERS, ACCOUNTING_CHANNELS);
  const agentsLoader = useCallback(async () => ({ ...(await accountingService.agents({})) }), []);
  const agents = useResource(agentsLoader, NO_AGENTS, ACCOUNTING_CHANNELS);

  const selectedOrders = useMemo(
    () => orders.data.orders.filter((o) => selectedIds.has(o.id)),
    [orders.data.orders, selectedIds]
  );

  const toggleSelect = (id: string) =>
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const toggleSelectAll = (checked: boolean) =>
    setSelectedIds(checked ? new Set(orders.data.orders.map((o) => o.id)) : new Set());

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
  const confirmDeleteOrder = async () => {
    if (!deletingOrder) return;
    const target = deletingOrder;
    setDeletingOrder(null);
    const r = await run(() => salesService.removeOrder(target.id));
    if (r.ok) {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        next.delete(target.id);
        return next;
      });
      const restored = target.status === "EXECUTED" || target.status === "SHIPPED" || target.status === "DELIVERED";
      show(restored ? "حُذف الأوردر نهائياً وأُعيدت مكوناته إلى المخزون" : "حُذف الأوردر نهائياً");
    }
    await orders.reload();
  };

  const handlePrintList = async (list: FollowOrder[]) => {
    if (list.length === 0) return;
    try {
      await printWaybills(list.map(waybillFromFollowOrder));
    } catch {
      show("تعذّر تجهيز الطباعة", "error");
    }
  };

  const handleDownloadPdfList = async (list: FollowOrder[]) => {
    if (list.length === 0 || busyPdf) return;
    setBusyPdf(true);
    try {
      await downloadWaybillsPdf(list.map(waybillFromFollowOrder));
      show(`تم تحميل ${list.length === 1 ? "البوليصة" : `${list.length} بوليصة`} كملف PDF`);
    } catch {
      show("تعذّر إنشاء ملف PDF", "error");
    } finally {
      setBusyPdf(false);
    }
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
    setPage(1);
    setSelectedIds(new Set());
  };

  return (
    <AppLayout
      headerSlot={(openMobileNav) => (
        <Header
          title="متابعة أوردرات المبيعات"
          description="متابعة كل أوردر بعد «تم التنفيذ»: الحالة، الشحن، الفتاة، المعاينة، والطباعة PDF"
          onOpenMobileNav={openMobileNav}
        />
      )}
    >
      {/* شريط تبويبات الحالة */}
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
                onClick={() => {
                  setStatus(s);
                  setPage(1);
                  setSelectedIds(new Set());
                }}
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
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
                setSelectedIds(new Set());
              }}
              placeholder="ابحث باسم العميل، رقم الهاتف، رقم البوليصة أو اسم الفتاة..."
              aria-label="بحث"
              className="!pr-9"
            />
          </div>
          <Select
            aria-label="الفتاة"
            value={agentId}
            onChange={(e) => {
              setAgentId(e.target.value);
              setPage(1);
              setSelectedIds(new Set());
            }}
            className="!w-44"
          >
            <option value="">كل الفتيات</option>
            {agents.data.agents.map((a) => (
              <option key={a.agentId} value={a.agentId}>
                {a.agentName}
              </option>
            ))}
          </Select>
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-muted">من</span>
            <Input
              type="date"
              aria-label="من تاريخ"
              value={from}
              onChange={(e) => {
                setFrom(e.target.value);
                setPage(1);
                setSelectedIds(new Set());
              }}
              className="!w-40"
            />
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-muted">إلى</span>
            <Input
              type="date"
              aria-label="إلى تاريخ"
              value={to}
              onChange={(e) => {
                setTo(e.target.value);
                setPage(1);
                setSelectedIds(new Set());
              }}
              className="!w-40"
            />
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

      {/* شريط التحديد المتعدد وتحميل PDF / طباعة المحدد */}
      {!orders.loading && orders.data.orders.length > 0 && (
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-control border border-border bg-surface px-3.5 py-2.5 text-xs">
          <div className="flex items-center gap-2.5">
            <label className="inline-flex cursor-pointer items-center gap-2 font-medium text-text">
              <input
                type="checkbox"
                checked={orders.data.orders.length > 0 && orders.data.orders.every((o) => selectedIds.has(o.id))}
                onChange={(e) => toggleSelectAll(e.target.checked)}
                className="h-4 w-4 cursor-pointer accent-primary-deep"
              />
              <span>تحديد عدة بوالص للتحميل PDF</span>
            </label>
            {selectedOrders.length > 0 && (
              <span className="rounded-full bg-primary/15 px-2.5 py-0.5 font-bold tabular-nums text-primary-deep">
                تم تحديد {selectedOrders.length} بوليصة
              </span>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              icon={<Download size={14} />}
              disabled={selectedOrders.length === 0 || busyPdf}
              onClick={() => void handleDownloadPdfList(selectedOrders)}
            >
              {busyPdf ? "جارٍ تجهيز PDF..." : `تحميل المحدد PDF (${selectedOrders.length})`}
            </Button>
            <Button
              size="sm"
              variant="secondary"
              icon={<Printer size={14} />}
              disabled={selectedOrders.length === 0}
              onClick={() => void handlePrintList(selectedOrders)}
            >
              طباعة المحدد ({selectedOrders.length})
            </Button>
            {selectedOrders.length > 0 && (
              <button
                type="button"
                aria-label="إلغاء تحديد البوالص"
                onClick={() => setSelectedIds(new Set())}
                className="inline-flex h-8 items-center gap-1 rounded-control border border-border px-2.5 text-xs text-muted hover:text-text"
              >
                <X size={13} />
                <span>إلغاء التحديد</span>
              </button>
            )}
          </div>
        </div>
      )}

      {orders.loading ? (
        <LoadingState variant="table" />
      ) : orders.error ? (
        <ErrorState message={orders.error} onRetry={() => void orders.retry()} />
      ) : orders.data.orders.length === 0 ? (
        <Card>
          <EmptyState
            title="لا توجد أوردرات للمتابعة"
            description="تظهر هنا أوردرات الفتيات والأوردرات اليدوية بعد وصولها إلى «تم التنفيذ»."
            action={
              page > 1 && orders.data.total > 0 ? (
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  onClick={() => {
                    setPage(Math.max(1, Math.ceil(orders.data.total / PAGE_SIZE)));
                    setSelectedIds(new Set());
                  }}
                >
                  العودة لآخر صفحة متاحة
                </Button>
              ) : undefined
            }
          />
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <FollowOrdersTable
            orders={orders.data.orders}
            canAct
            canDeleteOrder={canDeleteSalesOrders}
            selectedIds={selectedIds}
            onToggleSelect={toggleSelect}
            onToggleSelectAll={toggleSelectAll}
            onStatus={changeStatus}
            onFlag={flag}
            onShipping={shipping}
            onPrintOne={(o) => void handlePrintList([o])}
            onDelete={setDeletingOrder}
          />
          <PaginationBar
            page={page}
            pageSize={PAGE_SIZE}
            total={orders.data.total}
            onPageChange={(p) => {
              setPage(p);
              setSelectedIds(new Set());
            }}
          />
        </Card>
      )}

      <ConfirmDialog
        open={!!deletingOrder}
        onClose={() => setDeletingOrder(null)}
        onConfirm={() => void confirmDeleteOrder()}
        title="حذف الأوردر نهائياً؟"
        description={
          deletingOrder
            ? `سيُحذف الأوردر ${deletingOrder.waybill || ""} نهائياً (ومعه سجل الفتاة إن وُجد)، مع إعادة أي مكونات مخصومة من المخزون تلقائياً.`
            : undefined
        }
        confirmLabel="حذف نهائياً"
      />
    </AppLayout>
  );
}
