import { useCallback, useMemo, useState } from "react";
import { Ban, ChevronDown, ChevronUp, Pencil, Plus, Search, Send, Trash2 } from "lucide-react";
import { AppLayout } from "../components/layout/AppLayout";
import { Header } from "../components/header/Header";
import { Badge } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
import { ConfirmDialog } from "../components/ui/ConfirmDialog";
import { EmptyState } from "../components/ui/EmptyState";
import { Input } from "../components/ui/Field";
import { ErrorState, LoadingState } from "../components/ui/StatusViews";
import { useToast } from "../components/ui/ToastProvider";
import { AgentOrderModal } from "../components/agent/AgentOrderModal";
import { CancelModal, ExportModal } from "../components/agent/ExportCancelModals";
import { StatTile } from "../components/agent/StatTile";
import { BUCKET_LABEL, BUCKET_ORDER, agentOrderBadge } from "../components/agent/meta";
import { fmtMoney } from "../components/inventory/format";
import { formatArabicDate } from "../lib/date";
import type { SyncChannel } from "../lib/liveSync";
import { useResource } from "../hooks/useResource";
import { useSafeAction } from "../hooks/useSafeAction";
import { agentService } from "../services/agentService";
import type { AgentBucket, AgentItem, AgentOrder, AgentOrderInput, AgentProduct, AgentProfile, AgentSummary } from "../types";

const NO_ORDERS: AgentOrder[] = [];
const NO_PRODUCTS: AgentProduct[] = [];
const NO_ITEMS: AgentItem[] = [];
const EMPTY_SUMMARY: AgentSummary = {
  total: 0,
  unexported: 0,
  exported: 0,
  executed: 0,
  shipped: 0,
  delivered: 0,
  returned: 0,
  cancelled: 0,
  deliveredSales: 0,
  deliveredCount: 0,
  fixedFee: 0,
  commission: 0,
  totalDue: 0,
};

const ORDER_SYNC_CHANNELS: SyncChannel[] = ["sales", "accounting"];
const CATALOG_SYNC_CHANNELS: SyncChannel[] = ["sales", "inventory"];
const PROFILE_SYNC_CHANNELS: SyncChannel[] = ["accounting"];

// أوردراتي: مساحة الفتاة. ترى أوردراتها وحسابها فقط (العزل في الباكند). الأوردر يبقى هنا حتى تصدّره بعد التأكيد.
export default function AgentOrdersPage() {
  const [bucket, setBucket] = useState<AgentBucket>("all");
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<AgentOrder | "new" | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [expandedBoxes, setExpandedBoxes] = useState<Set<string>>(new Set());
  const [exporting, setExporting] = useState<AgentOrder[] | null>(null);
  const [cancelling, setCancelling] = useState<AgentOrder | null>(null);
  const [deleting, setDeleting] = useState<AgentOrder | null>(null);

  const { show } = useToast();
  const run = useSafeAction();

  const q = search.trim();
  const ordersLoader = useCallback(() => agentService.orders(bucket, q), [bucket, q]);
  const orders = useResource<AgentOrder[]>(ordersLoader, NO_ORDERS, ORDER_SYNC_CHANNELS);
  const dashboard = useResource<AgentSummary>(agentService.dashboard, EMPTY_SUMMARY, ORDER_SYNC_CHANNELS);
  const products = useResource<AgentProduct[]>(agentService.products, NO_PRODUCTS, CATALOG_SYNC_CHANNELS);
  const items = useResource<AgentItem[]>(agentService.items, NO_ITEMS, CATALOG_SYNC_CHANNELS);
  const profile = useResource<AgentProfile | null>(agentService.me, null, PROFILE_SYNC_CHANNELS);

  const refresh = useCallback(async () => {
    await Promise.all([orders.reload(), dashboard.reload(), profile.reload()]);
  }, [orders, dashboard, profile]);

  const drafts = useMemo(() => orders.data.filter((o) => o.status === "DRAFT"), [orders.data]);
  const selectedDrafts = useMemo(() => drafts.filter((o) => selected.has(o.id)), [drafts, selected]);

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const toggleBoxes = (id: string) =>
    setExpandedBoxes((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const save = async (input: AgentOrderInput) => {
    const target = editing;
    const r = await run(() => (target && target !== "new" ? agentService.update(target.id, input) : agentService.create(input)));
    if (r.ok) show(target && target !== "new" ? "تم حفظ التعديل" : `أُضيف الأوردر ${r.value.waybill}`);
    await refresh();
    return r.ok;
  };

  const doExport = async (list: AgentOrder[]) => {
    const r = await run(() => agentService.exportOrders(list.map((o) => o.id)));
    if (r.ok) {
      const done = r.value.results.filter((x) => x.result === "EXPORTED").length;
      const already = r.value.results.filter((x) => x.result === "ALREADY_EXPORTED").length;
      const failed = r.value.results.filter((x) => x.result === "ERROR" || x.result === "CANCELLED");
      if (done > 0) show(`تم تصدير ${done} ${done === 1 ? "أوردر" : "أوردرات"}`);
      if (already > 0) show(`${already} مصدَّر بالفعل`);
      for (const f of failed) show(f.message ?? "تعذّر تصدير أوردر", "error");
      setSelected(new Set());
    }
    await refresh();
  };

  const doDelete = async (o: AgentOrder) => {
    const r = await run(() => agentService.remove(o.id));
    if (r.ok) show("تم حذف المسودة");
    await refresh();
  };

  const doCancel = async (o: AgentOrder, reason: string) => {
    const r = await run(() => agentService.cancel(o.id, reason));
    if (r.ok) show("تم إلغاء الأوردر");
    await refresh();
    return r.ok;
  };

  const s = dashboard.data;

  return (
    <AppLayout
      headerSlot={(openMobileNav) => (
        <Header
          title="أوردراتي"
          description={profile.data ? `الرقم التالي: ${profile.data.prefix * 100 + profile.data.nextSeq}` : "أدخل أوردراتك وصدّرها بعد المراجعة"}
          onOpenMobileNav={openMobileNav}
          action={
            <Button icon={<Plus size={16} />} onClick={() => setEditing("new")} disabled={!profile.data}>
              أوردر جديد
            </Button>
          }
        />
      )}
    >
      {!profile.loading && !profile.data && (
        <p className="mb-4 rounded-control border border-operational/40 bg-operational/10 px-4 py-3 text-sm text-text" role="alert">
          لم تحدد الإدارة Prefix لحسابك بعد، لذلك لا يمكن إضافة أوردرات. تواصل مع الإدارة.
        </p>
      )}

      {!dashboard.loading && !dashboard.error && (
        <section aria-label="ملخص حسابي" className="mb-4 grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-6">
          <StatTile label="إجمالي الأوردرات" value={s.total} onClick={() => setBucket("all")} active={bucket === "all"} />
          <StatTile label="المسلّمة" value={s.delivered} color="#1E8E5A" onClick={() => setBucket("delivered")} active={bucket === "delivered"} />
          <StatTile label="مبيعات مسلّمة" value={fmtMoney(s.deliveredSales)} />
          <StatTile label="المقابل الثابت" value={fmtMoney(s.fixedFee)} hint="7 ج × المسلّمة" />
          <StatTile label="عمولة 3%" value={fmtMoney(s.commission)} />
          <StatTile label="إجمالي المستحقات" value={fmtMoney(s.totalDue)} color="#1E8E5A" />
        </section>
      )}

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="تصفية الأوردرات">
          {BUCKET_ORDER.map((b) => (
            <button
              key={b}
              role="tab"
              aria-selected={bucket === b}
              onClick={() => setBucket(b)}
              className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${bucket === b ? "border-primary-deep bg-primary/15 text-primary-deep" : "border-border text-muted hover:text-text"}`}
            >
              {BUCKET_LABEL[b]}
            </button>
          ))}
        </div>
        <div className="relative min-w-[200px] flex-1 sm:max-w-xs">
          <Search size={15} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-muted" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="بحث برقم البوليصة أو اسم/هاتف العميل" aria-label="بحث" className="!pr-9" />
        </div>
        {selectedDrafts.length > 0 && (
          <Button icon={<Send size={15} />} onClick={() => setExporting(selectedDrafts)}>
            تصدير المحدد ({selectedDrafts.length})
          </Button>
        )}
      </div>

      {orders.loading ? (
        <LoadingState />
      ) : orders.error ? (
        <ErrorState message={orders.error} onRetry={() => void orders.retry()} />
      ) : orders.data.length === 0 ? (
        <Card>
          <EmptyState title={q || bucket !== "all" ? "لا أوردرات مطابقة" : "لا توجد أوردرات بعد"} description={q || bucket !== "all" ? "غيّر التصفية أو البحث." : "اضغط «أوردر جديد» لإضافة أول أوردر."} />
        </Card>
      ) : (
        <div className="flex flex-col gap-2.5">
          {drafts.length > 1 && (
            <label className="flex items-center gap-2 px-1 text-xs text-muted">
              <input type="checkbox" checked={selectedDrafts.length === drafts.length} onChange={(e) => setSelected(e.target.checked ? new Set(drafts.map((d) => d.id)) : new Set())} />
              تحديد كل المسودات المعروضة
            </label>
          )}
          {orders.data.map((o) => {
            const badge = agentOrderBadge(o);
            const isDraft = o.status === "DRAFT";
            const canCancelOrder = o.status === "EXPORTED" && (o.salesStatus === null || o.salesStatus === "REGISTERED");
            const hasComponents = o.lines.some((l) => l.components.length > 0);
            const isExpanded = expandedBoxes.has(o.id);
            return (
              <Card key={o.id} className="p-3.5">
                <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                  {isDraft && <input type="checkbox" aria-label={`تحديد ${o.waybill}`} checked={selected.has(o.id)} onChange={() => toggle(o.id)} />}
                  <span className="text-base font-bold tabular-nums text-text">{o.waybill}</span>
                  <Badge color={badge.color}>{badge.label}</Badge>
                  <span className="text-xs text-muted">{formatArabicDate(o.date)}</span>
                  <div className="ms-auto flex flex-wrap items-baseline gap-2 text-end">
                    <span className="text-sm font-bold tabular-nums text-text">{fmtMoney(o.sellPrice)}</span>
                    {o.shippingPrice != null && (
                      <span className="text-xs tabular-nums text-muted">
                        + شحن {fmtMoney(o.shippingPrice)} = <strong className="text-primary-deep">{fmtMoney(o.totalWithShipping ?? o.sellPrice + o.shippingPrice)}</strong>
                      </span>
                    )}
                  </div>
                </div>
                <div className="mt-2 grid grid-cols-1 gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
                  <p className="text-text">
                    {o.customerName}
                    {o.customerPhone && (
                      <span dir="ltr" className="ms-2 text-xs text-muted">
                        {o.customerPhone}
                      </span>
                    )}
                  </p>
                  <p className="text-muted">
                    {o.lines
                      .map((l) => {
                        const base = l.quantity > 1 ? `${l.productName} × ${l.quantity}` : l.productName;
                        return l.boxPrice != null ? `${base} (${fmtMoney(l.boxPrice)})` : base;
                      })
                      .join("، ")}
                  </p>
                  {o.customerAddress && <p className="text-xs text-muted sm:col-span-2">{o.customerAddress}</p>}
                  {o.notes && <p className="text-xs text-muted sm:col-span-2">ملاحظات: {o.notes}</p>}
                  {o.status === "CANCELLED" && <p className="text-xs text-problem sm:col-span-2">سبب الإلغاء: {o.cancelReason}</p>}
                </div>

                {hasComponents && (
                  <div className="mt-2">
                    <button
                      type="button"
                      aria-expanded={isExpanded}
                      onClick={() => toggleBoxes(o.id)}
                      className="inline-flex items-center gap-1 text-xs font-medium text-primary-deep hover:underline"
                    >
                      {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                      محتويات البوكسات
                    </button>
                    {isExpanded && (
                      <div className="mt-1.5 flex flex-col gap-1.5 rounded-control border border-border bg-surface/60 p-2.5 text-xs">
                        {o.lines.map((l) => (
                          <div key={l.id}>
                            <p className="font-semibold text-text">
                              {l.productName}
                              {l.quantity > 1 ? ` × ${l.quantity}` : ""}
                            </p>
                            <p className="mt-0.5 text-muted">
                              {l.components.map((c) => `${c.itemName} (${c.quantity} ${c.unit})`).join("، ")}
                            </p>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {(isDraft || canCancelOrder) && (
                  <div className="mt-2.5 flex flex-wrap justify-end gap-1.5">
                    {isDraft ? (
                      <>
                        <Button size="sm" variant="secondary" icon={<Pencil size={13} />} onClick={() => setEditing(o)}>
                          تعديل
                        </Button>
                        <Button size="sm" variant="secondary" icon={<Send size={13} />} onClick={() => setExporting([o])}>
                          تصدير
                        </Button>
                        <Button size="sm" variant="danger" icon={<Trash2 size={13} />} onClick={() => setDeleting(o)}>
                          حذف
                        </Button>
                      </>
                    ) : (
                      <Button size="sm" variant="danger" icon={<Ban size={13} />} onClick={() => setCancelling(o)}>
                        إلغاء الأوردر
                      </Button>
                    )}
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}

      {editing && (
        <AgentOrderModal
          key={editing === "new" ? "new" : editing.id}
          open
          products={products.data}
          items={items.data}
          editing={editing === "new" ? undefined : editing}
          nextWaybill={profile.data ? profile.data.prefix * 100 + profile.data.nextSeq : null}
          onClose={() => setEditing(null)}
          onSubmit={save}
        />
      )}
      {exporting && <ExportModal open orders={exporting} onClose={() => setExporting(null)} onConfirm={() => doExport(exporting)} />}
      {cancelling && <CancelModal open order={cancelling} onClose={() => setCancelling(null)} onConfirm={(reason) => doCancel(cancelling, reason)} />}
      <ConfirmDialog open={!!deleting} onClose={() => setDeleting(null)} onConfirm={() => deleting && void doDelete(deleting)} title="حذف المسودة؟" description={deleting ? `سيُحذف الأوردر ${deleting.waybill} نهائياً قبل التصدير، ولن يُعاد استخدام رقمه.` : undefined} confirmLabel="حذف" />
    </AppLayout>
  );
}
