import { useCallback, useMemo, useState } from "react";
import { RotateCcw, Search, Send, X } from "lucide-react";
import { AppLayout } from "../components/layout/AppLayout";
import { Header } from "../components/header/Header";
import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
import { EmptyState } from "../components/ui/EmptyState";
import { Input, Select } from "../components/ui/Field";
import { PaginationBar } from "../components/ui/PaginationBar";
import { ErrorState, LoadingState } from "../components/ui/StatusViews";
import { useToast } from "../components/ui/ToastProvider";
import { CancelModal, ExportModal } from "../components/agent/ExportCancelModals";
import { SupervisorOrdersTable } from "../components/agent/SupervisorOrdersTable";
import { useResource } from "../hooks/useResource";
import { useSafeAction } from "../hooks/useSafeAction";
import type { SyncChannel } from "../lib/liveSync";
import { agentSupervisorService } from "../services/agentService";
import type { SupervisorAgentOrder, SupervisorFilters, SupervisorOrdersList } from "../types";

const NO_ORDERS: SupervisorOrdersList = {
  orders: [],
  total: 0,
  hasMore: false,
  counts: { all: 0, DRAFT: 0, EXPORTED: 0, CANCELLED: 0 },
};
const NO_FILTERS: SupervisorFilters = { agents: [], pages: [] };
const STATUS_TABS = ["DRAFT", "", "EXPORTED", "CANCELLED"] as const;
const STATUS_TAB_LABEL: Record<(typeof STATUS_TABS)[number], string> = {
  DRAFT: "غير مصدَّر",
  "": "الكل",
  EXPORTED: "مصدَّر",
  CANCELLED: "ملغي",
};
const ORDERS_CHANNELS: SyncChannel[] = ["sales", "accounting"];
const FILTER_CHANNELS: SyncChannel[] = ["users", "accounting", "sales"];
const PAGE_SIZE = 20;

// شاشة مشرف الفتيات (والإدارة): تجميع كل مسودات الفتيات، معاينة البوليصة، وتصديرها فردياً أو جماعياً للإنتاج.
export default function AgentSupervisorOrdersPage() {
  const [status, setStatus] = useState<(typeof STATUS_TABS)[number]>("DRAFT");
  const [agentId, setAgentId] = useState("");
  const [salesPageId, setSalesPageId] = useState("");
  const [search, setSearch] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [page, setPage] = useState(1);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [exporting, setExporting] = useState<SupervisorAgentOrder[] | null>(null);
  const [cancelling, setCancelling] = useState<SupervisorAgentOrder | null>(null);
  const { show } = useToast();
  const run = useSafeAction();

  const q = search.trim();
  const loader = useCallback(
    () =>
      agentSupervisorService.orders({
        status,
        agentId,
        salesPageId,
        q,
        from,
        to,
        limit: String(PAGE_SIZE),
        offset: String((page - 1) * PAGE_SIZE),
      }),
    [status, agentId, salesPageId, q, from, to, page]
  );
  const orders = useResource<SupervisorOrdersList>(loader, NO_ORDERS, ORDERS_CHANNELS);
  const filters = useResource<SupervisorFilters>(agentSupervisorService.filters, NO_FILTERS, FILTER_CHANNELS);

  const draftsOnPage = useMemo(() => orders.data.orders.filter((o) => o.status === "DRAFT"), [orders.data.orders]);
  const selectedDrafts = useMemo(
    () => draftsOnPage.filter((o) => selectedIds.has(o.id)),
    [draftsOnPage, selectedIds]
  );

  const toggleSelect = (id: string) =>
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const toggleSelectAllDrafts = (checked: boolean) =>
    setSelectedIds(checked ? new Set(draftsOnPage.map((o) => o.id)) : new Set());

  const doExport = async (list: SupervisorAgentOrder[]) => {
    const r = await run(() => agentSupervisorService.exportOrders(list.map((o) => o.id)));
    if (r.ok) {
      const done = r.value.results.filter((x) => x.result === "EXPORTED").length;
      const already = r.value.results.filter((x) => x.result === "ALREADY_EXPORTED").length;
      const failed = r.value.results.filter((x) => x.result === "ERROR" || x.result === "CANCELLED");
      if (done > 0) show(`تم تصدير ${done} ${done === 1 ? "أوردر" : "أوردرات"} للإنتاج`);
      if (already > 0) show(`${already} مصدَّر بالفعل`);
      for (const f of failed) show(f.message ?? "تعذّر تصدير أوردر", "error");
      setSelectedIds(new Set());
    }
    await orders.reload();
  };

  const doCancel = async (o: SupervisorAgentOrder, reason: string) => {
    const r = await run(() => agentSupervisorService.cancel(o.id, reason));
    if (r.ok) show("تم إلغاء الأوردر");
    await orders.reload();
    return r.ok;
  };

  const tabCount = (tab: (typeof STATUS_TABS)[number]) => {
    const c = orders.data.counts;
    return tab === "" ? c.all : c[tab];
  };

  const hasFilters = Boolean(status !== "DRAFT" || agentId || salesPageId || q || from || to);
  const resetFilters = () => {
    setStatus("DRAFT");
    setAgentId("");
    setSalesPageId("");
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
          title="تصدير أوردرات الفتيات"
          description="تجميع الأوردرات غير المصدَّرة من جميع الفتيات ومراجعتها وتصديرها للإنتاج"
          onOpenMobileNav={openMobileNav}
        />
      )}
    >
      {/* شريط تبويبات الحالة */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 border-b border-border pb-3">
        <div className="flex flex-wrap items-center gap-1.5" role="tablist" aria-label="حالة أوردر الفتاة">
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
                <span>{STATUS_TAB_LABEL[s]}</span>
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
          <div className="relative min-w-[220px] flex-1">
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
            className="!w-40"
          >
            <option value="">كل الفتيات</option>
            {filters.data.agents.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}{a.isActive ? "" : " (معطّلة)"}
              </option>
            ))}
          </Select>
          <Select
            aria-label="الصفحة"
            value={salesPageId}
            onChange={(e) => {
              setSalesPageId(e.target.value);
              setPage(1);
              setSelectedIds(new Set());
            }}
            className="!w-40"
          >
            <option value="">كل الصفحات</option>
            <option value="__NONE__">بلا صفحة</option>
            {filters.data.pages.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}{p.isActive ? "" : " (موقوفة)"}
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

      {/* شريط التحديد المتعدد وتصدير المحدد للإنتاج */}
      {!orders.loading && draftsOnPage.length > 0 && (
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-control border border-border bg-surface px-3.5 py-2.5 text-xs">
          <div className="flex items-center gap-2.5">
            <label className="inline-flex cursor-pointer items-center gap-2 font-medium text-text">
              <input
                type="checkbox"
                checked={draftsOnPage.length > 0 && draftsOnPage.every((o) => selectedIds.has(o.id))}
                onChange={(e) => toggleSelectAllDrafts(e.target.checked)}
                className="h-4 w-4 cursor-pointer accent-primary-deep"
              />
              <span>تحديد كل المسودات المعروضة للتصدير</span>
            </label>
            {selectedDrafts.length > 0 && (
              <span className="rounded-full bg-primary/15 px-2.5 py-0.5 font-bold tabular-nums text-primary-deep">
                تم تحديد {selectedDrafts.length} {selectedDrafts.length === 1 ? "أوردر" : "أوردرات"}
              </span>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              icon={<Send size={14} />}
              disabled={selectedDrafts.length === 0}
              onClick={() => setExporting(selectedDrafts)}
            >
              {`تصدير المحدد للإنتاج (${selectedDrafts.length})`}
            </Button>
            {selectedDrafts.length > 0 && (
              <button
                type="button"
                aria-label="إلغاء تحديد الأوردرات"
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
            title={status === "DRAFT" ? "لا توجد أوردرات غير مصدَّرة" : "لا توجد أوردرات مطابقة"}
            description={
              status === "DRAFT"
                ? "كل أوردرات الفتيات الحالية مصدَّرة بالفعل أو لم تُسجَّل مسودات جديدة بعد."
                : "جرّب تغيير الفلاتر أو البحث."
            }
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
          <SupervisorOrdersTable
            orders={orders.data.orders}
            selectedIds={selectedIds}
            onToggleSelect={toggleSelect}
            onToggleSelectAllDrafts={toggleSelectAllDrafts}
            onExportOne={(o) => setExporting([o])}
            onCancelOne={setCancelling}
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

      {exporting && (
        <ExportModal
          open
          orders={exporting}
          onClose={() => setExporting(null)}
          onConfirm={() => doExport(exporting)}
        />
      )}
      {cancelling && (
        <CancelModal
          open
          order={cancelling}
          onClose={() => setCancelling(null)}
          onConfirm={(reason) => doCancel(cancelling, reason)}
        />
      )}
    </AppLayout>
  );
}
