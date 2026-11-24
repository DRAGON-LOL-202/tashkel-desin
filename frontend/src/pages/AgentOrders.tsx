import { useCallback, useState } from "react";
import { Ban, ChevronDown, ChevronUp, Eye, Pencil, Plus, Search, Trash2 } from "lucide-react";
import { AppLayout } from "../components/layout/AppLayout";
import { Header } from "../components/header/Header";
import { Badge } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
import { ConfirmDialog } from "../components/ui/ConfirmDialog";
import { EmptyState } from "../components/ui/EmptyState";
import { Input } from "../components/ui/Field";
import { PaginationBar } from "../components/ui/PaginationBar";
import { ErrorState, LoadingState } from "../components/ui/StatusViews";
import { useToast } from "../components/ui/ToastProvider";
import { AgentOrderModal } from "../components/agent/AgentOrderModal";
import { CancelModal } from "../components/agent/ExportCancelModals";
import { WaybillPreviewModal } from "../components/agent/WaybillPreviewModal";
import { waybillFromAgentOrder } from "../lib/waybillPdf";
import { BUCKET_LABEL, BUCKET_ORDER, agentOrderBadge } from "../components/agent/meta";
import { fmtMoney } from "../components/inventory/format";
import { formatArabicDate } from "../lib/date";
import type { SyncChannel } from "../lib/liveSync";
import { useResource } from "../hooks/useResource";
import { useSafeAction } from "../hooks/useSafeAction";
import { agentService } from "../services/agentService";
import type { AgentBucket, AgentItem, AgentOrder, AgentOrderInput, AgentProduct, AgentProfile, AgentSalesPage } from "../types";

interface AgentOrdersPageData {
  orders: AgentOrder[];
  total: number;
  hasMore: boolean;
}

const NO_ORDERS_PAGE: AgentOrdersPageData = { orders: [], total: 0, hasMore: false };
const NO_PRODUCTS: AgentProduct[] = [];
const NO_ITEMS: AgentItem[] = [];
const NO_PAGES: AgentSalesPage[] = [];
const PAGE_SIZE = 20;

const ORDER_SYNC_CHANNELS: SyncChannel[] = ["sales", "accounting"];
const CATALOG_SYNC_CHANNELS: SyncChannel[] = ["sales", "inventory"];
const PROFILE_SYNC_CHANNELS: SyncChannel[] = ["accounting", "users"];

// أوردراتي: مساحة الفتاة. ترى أوردراتها فقط وتدخل بيانات الفاتورة وتعاين البوليصة (بدون بطاقات العمولات، وبدون طباعة/PDF).
export default function AgentOrdersPage() {
  const [bucket, setBucket] = useState<AgentBucket>("all");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<AgentOrder | "new" | null>(null);
  const [previewing, setPreviewing] = useState<AgentOrder | null>(null);
  const [expandedBoxes, setExpandedBoxes] = useState<Set<string>>(new Set());
  const [cancelling, setCancelling] = useState<AgentOrder | null>(null);
  const [deleting, setDeleting] = useState<AgentOrder | null>(null);

  const { show } = useToast();
  const run = useSafeAction();

  const q = search.trim();
  const ordersLoader = useCallback(
    () => agentService.ordersPage(bucket, q, { limit: PAGE_SIZE, offset: (page - 1) * PAGE_SIZE }),
    [bucket, q, page]
  );
  const orders = useResource<AgentOrdersPageData>(ordersLoader, NO_ORDERS_PAGE, ORDER_SYNC_CHANNELS);
  const products = useResource<AgentProduct[]>(agentService.products, NO_PRODUCTS, CATALOG_SYNC_CHANNELS);
  const items = useResource<AgentItem[]>(agentService.items, NO_ITEMS, CATALOG_SYNC_CHANNELS);
  const pages = useResource<AgentSalesPage[]>(agentService.pages, NO_PAGES, CATALOG_SYNC_CHANNELS);
  const profile = useResource<AgentProfile | null>(agentService.me, null, PROFILE_SYNC_CHANNELS);

  const refresh = useCallback(async () => {
    await Promise.all([orders.reload(), profile.reload()]);
  }, [orders, profile]);

  const orderRows = orders.data.orders;

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

  return (
    <AppLayout
      headerSlot={(openMobileNav) => (
        <Header
          title="أوردراتي"
          description={profile.data ? `الرقم التالي: ${profile.data.prefix * 100 + profile.data.nextSeq}` : "أدخل أوردراتك وتابع حالتها — يتم تصديرها للإنتاج عبر مشرف الفتيات"}
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

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="تصفية الأوردرات">
          {BUCKET_ORDER.map((b) => (
            <button
              key={b}
              role="tab"
              aria-selected={bucket === b}
              onClick={() => {
                setBucket(b);
                setPage(1);
              }}
              className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${bucket === b ? "border-primary-deep bg-primary/15 text-primary-deep" : "border-border text-muted hover:text-text"}`}
            >
              {BUCKET_LABEL[b]}
            </button>
          ))}
        </div>
        <div className="relative min-w-[200px] flex-1 sm:max-w-xs">
          <Search size={15} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-muted" />
          <Input
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            placeholder="بحث برقم البوليصة أو اسم/هاتف العميل"
            aria-label="بحث"
            className="!pr-9"
          />
        </div>
      </div>

      {orders.loading ? (
        <LoadingState variant="cards" />
      ) : orders.error ? (
        <ErrorState message={orders.error} onRetry={() => void orders.retry()} />
      ) : orderRows.length === 0 ? (
        <Card>
          <EmptyState
            title={q || bucket !== "all" ? "لا أوردرات مطابقة" : "لا توجد أوردرات بعد"}
            description={q || bucket !== "all" ? "غيّر التصفية أو البحث." : "اضغط «أوردر جديد» لإضافة أول أوردر."}
            action={
              page > 1 && orders.data.total > 0 ? (
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  onClick={() => {
                    setPage(Math.max(1, Math.ceil(orders.data.total / PAGE_SIZE)));
                  }}
                >
                  العودة لآخر صفحة متاحة
                </Button>
              ) : undefined
            }
          />
        </Card>
      ) : (
        <div className="flex flex-col gap-2.5">
          {orderRows.map((o) => {
            const badge = agentOrderBadge(o);
            const isDraft = o.status === "DRAFT";
            const canCancelOrder = o.status === "EXPORTED" && (o.salesStatus === null || o.salesStatus === "REGISTERED");
            const hasComponents = o.lines.some((l) => l.components.length > 0);
            const isExpanded = expandedBoxes.has(o.id);
            return (
              <Card key={o.id} className="p-3.5">
                <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                  <span className="text-base font-bold tabular-nums text-text">{o.waybill}</span>
                  <Badge color={badge.color}>{badge.label}</Badge>
                  {o.salesPageName && <Badge color="#2E8BC0">{o.salesPageName}</Badge>}
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

                <div className="mt-2.5 flex flex-wrap items-center justify-end gap-1.5">
                  {isDraft && (
                    <span className="me-auto text-[11px] text-muted">بانتظار التصدير عبر مشرف الفتيات</span>
                  )}
                  <Button size="sm" variant="secondary" icon={<Eye size={14} />} onClick={() => setPreviewing(o)}>
                    معاينة البوليصة
                  </Button>
                  {isDraft && (
                    <>
                      <Button size="sm" variant="secondary" icon={<Pencil size={13} />} onClick={() => setEditing(o)}>
                        تعديل
                      </Button>
                      <Button size="sm" variant="danger" icon={<Trash2 size={13} />} onClick={() => setDeleting(o)}>
                        حذف
                      </Button>
                    </>
                  )}
                  {canCancelOrder && (
                    <Button size="sm" variant="danger" icon={<Ban size={13} />} onClick={() => setCancelling(o)}>
                      إلغاء الأوردر
                    </Button>
                  )}
                </div>
              </Card>
            );
          })}
          {orders.data.total > PAGE_SIZE && (
            <Card className="overflow-hidden">
              <PaginationBar
                page={page}
                pageSize={PAGE_SIZE}
                total={orders.data.total}
                onPageChange={(p) => {
                  setPage(p);
                }}
                className="!border-t-0"
              />
            </Card>
          )}
        </div>
      )}

      {previewing && (
        <WaybillPreviewModal
          key={previewing.id}
          open
          waybill={waybillFromAgentOrder(previewing)}
          salesPageName={previewing.salesPageName}
          canPrint={false}
          canDownloadPdf={false}
          statusLabel={agentOrderBadge(previewing).label}
          statusColor={agentOrderBadge(previewing).color}
          onEdit={
            previewing.status === "DRAFT"
              ? () => {
                  const target = previewing;
                  setPreviewing(null);
                  setEditing(target);
                }
              : undefined
          }
          onClose={() => setPreviewing(null)}
        />
      )}

      {editing && (
        <AgentOrderModal
          key={editing === "new" ? "new" : editing.id}
          open
          products={products.data}
          items={items.data}
          pages={pages.data}
          editing={editing === "new" ? undefined : editing}
          nextWaybill={profile.data ? profile.data.prefix * 100 + profile.data.nextSeq : null}
          onClose={() => setEditing(null)}
          onSubmit={save}
        />
      )}
      {cancelling && <CancelModal open order={cancelling} onClose={() => setCancelling(null)} onConfirm={(reason) => doCancel(cancelling, reason)} />}
      <ConfirmDialog open={!!deleting} onClose={() => setDeleting(null)} onConfirm={() => deleting && void doDelete(deleting)} title="حذف المسودة؟" description={deleting ? `سيُحذف الأوردر ${deleting.waybill} نهائياً قبل التصدير، ولن يُعاد استخدام رقمه.` : undefined} confirmLabel="حذف" />
    </AppLayout>
  );
}
