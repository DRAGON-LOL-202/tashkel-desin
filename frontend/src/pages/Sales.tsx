import { useCallback, useEffect, useMemo, useState } from "react";
import { Boxes, Download, Pencil, Plus, Receipt, Search, ShoppingBag, Trash2 } from "lucide-react";
import { AppLayout } from "../components/layout/AppLayout";
import { Header } from "../components/header/Header";
import { DateNavigator } from "../components/tasks/DateNavigator";
import { SalesOrderCard } from "../components/sales/SalesOrderCard";
import { NewOrderModal } from "../components/sales/NewOrderModal";
import { ProductEditorModal } from "../components/sales/ProductEditorModal";
import { SalesProductsModal } from "../components/sales/SalesProductsModal";
import { SALES_STATUS_META, SALES_STATUS_ORDER } from "../components/sales/status";
import { fmtMoney } from "../components/inventory/format";
import { Button } from "../components/ui/Button";
import { ConfirmDialog } from "../components/ui/ConfirmDialog";
import { EmptyState } from "../components/ui/EmptyState";
import { ErrorState, LoadingState } from "../components/ui/StatusViews";
import { useToast } from "../components/ui/ToastProvider";
import { useResource } from "../hooks/useResource";
import { useSafeAction } from "../hooks/useSafeAction";
import { downloadSalesDaily, downloadSalesMonthly } from "../lib/exportSales";
import { formatArabicDate, monthRange, todayISO } from "../lib/date";
import { EMPTY_INVENTORY_DATA, inventoryService } from "../services/inventoryService";
import { salesService } from "../services/salesService";
import type { InventoryData, SalesOrder, SalesOrderPatch, SalesOrderStatus, SalesProduct, SalesProductInput } from "../types";

interface OrdersPayload {
  /** مفتاح الطلب (يوم أو بحث) حتى لا تظهر أوردرات يوم سابق أثناء تحميل يوم آخر */
  key: string;
  orders: SalesOrder[];
}

const NO_ORDERS: SalesOrder[] = [];
const NO_PAYLOAD: OrdersPayload = { key: "", orders: NO_ORDERS };
const NO_PRODUCTS: SalesProduct[] = [];
const NO_STRINGS: string[] = [];

// المبيعات الإلكترونية: أوردرات يومية (بوليصة + مقفل + منتجات ثابتة بمحتوياتها من المخزون).
// التنفيذ يخصم المكونات من المخزون تلقائياً، والمرتجع يعيدها. التكلفة وسعر البيع يُحسبان من بيانات المخزون.
export default function SalesPage() {
  const [date, setDate] = useState(todayISO());
  const [searchInput, setSearchInput] = useState("");
  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState<SalesOrderStatus | "ALL">("ALL");
  const [newOrderOpen, setNewOrderOpen] = useState(false);
  const [productsOpen, setProductsOpen] = useState(false);
  const [editor, setEditor] = useState<{ editing: SalesProduct | null } | null>(null);
  const [deletingOrder, setDeletingOrder] = useState<SalesOrder | null>(null);
  const [deletingProduct, setDeletingProduct] = useState<SalesProduct | null>(null);
  const [exporting, setExporting] = useState<"day" | "month" | null>(null);

  const { show } = useToast();
  const run = useSafeAction();

  useEffect(() => {
    const t = setTimeout(() => setQ(searchInput.trim()), 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  const key = q ? `q:${q}` : `d:${date}`;
  const ordersLoader = useCallback(async (): Promise<OrdersPayload> => ({ key, orders: q ? await salesService.searchOrders(q) : await salesService.listOrders(date) }), [key, q, date]);
  const orders = useResource<OrdersPayload>(ordersLoader, NO_PAYLOAD);
  const products = useResource<SalesProduct[]>(salesService.listProducts, NO_PRODUCTS);
  const closers = useResource<string[]>(salesService.closers, NO_STRINGS);
  const stock = useResource<InventoryData>(inventoryService.list, EMPTY_INVENTORY_DATA);

  const refresh = useCallback(async () => {
    await Promise.all([orders.reload(), products.reload(), closers.reload(), stock.reload()]);
  }, [orders, products, closers, stock]);

  const stale = orders.data.key !== key;
  const dayOrders = useMemo(() => (stale ? NO_ORDERS : orders.data.orders), [stale, orders.data.orders]);
  const visible = useMemo(() => (statusFilter === "ALL" ? dayOrders : dayOrders.filter((o) => o.status === statusFilter)), [dayOrders, statusFilter]);
  const activeProducts = useMemo(() => products.data.filter((p) => p.isActive && p.components.length > 0), [products.data]);
  const activeItems = useMemo(() => stock.data.items.filter((i) => i.isActive), [stock.data.items]);

  // أرقام اليوم (بدون المرتجع) بدقة القروش
  const summary = useMemo(() => {
    let cost = 0;
    let sell = 0;
    let count = 0;
    for (const o of dayOrders) {
      if (o.status === "RETURNED") continue;
      count += 1;
      cost += Math.round(o.costTotal * 100);
      sell += Math.round(o.sellTotal * 100);
    }
    return { count, cost: cost / 100, sell: sell / 100, profit: (sell - cost) / 100 };
  }, [dayOrders]);

  // إجمالي تالف اليوم (من مرتجعات أوردرات هذا اليوم)
  const damaged = useMemo(() => {
    let cents = 0;
    let orders = 0;
    for (const o of dayOrders) {
      if (o.status !== "RETURNED" || o.damagedTotal <= 0) continue;
      orders += 1;
      cents += Math.round(o.damagedTotal * 100);
    }
    return { total: cents / 100, orders };
  }, [dayOrders]);

  const countsByStatus = useMemo(() => {
    const m = new Map<SalesOrderStatus, number>();
    for (const o of dayOrders) m.set(o.status, (m.get(o.status) ?? 0) + 1);
    return m;
  }, [dayOrders]);

  // ===== الأوردرات =====
  const createOrder = async (input: Parameters<typeof salesService.createOrder>[0]) => {
    const r = await run(() => salesService.createOrder(input));
    if (r.ok) {
      setSearchInput("");
      setQ("");
      setStatusFilter("ALL");
      show("أُضيف الأوردر");
    }
    await refresh();
    return r.ok;
  };

  const quickAdd = (p: SalesProduct) => void createOrder({ date, lines: [{ productId: p.id, quantity: 1 }] });

  const patchOrder = async (o: SalesOrder, patch: SalesOrderPatch) => {
    const r = await run(() => salesService.updateOrder(o.id, patch));
    await refresh();
    return r.ok;
  };

  const changeStatus = async (o: SalesOrder, status: SalesOrderStatus) => {
    const r = await run(() => salesService.updateOrder(o.id, { status }));
    await refresh();
    if (!r.ok) return;
    const was = o.stockDeducted;
    const now = r.value.stockDeducted;
    show(!was && now ? "تم التنفيذ وخُصمت المكونات من المخزون" : was && !now ? "أُعيدت المكونات إلى المخزون" : `تم تغيير الحالة إلى «${SALES_STATUS_META[status].label}»`);
  };

  // مرتجع مع تحديد التالف: التالف لا يعود للمخزون ويدخل في تالف اليوم
  const returnOrder = async (o: SalesOrder, damagedComponentIds: string[]) => {
    const r = await run(() => salesService.updateOrder(o.id, { status: "RETURNED", damagedComponentIds }));
    await refresh();
    if (r.ok) show(damagedComponentIds.length > 0 ? `تم المرتجع: ${damagedComponentIds.length} تالف، وأُعيد الباقي إلى المخزون` : "تم المرتجع وأُعيدت المكونات إلى المخزون");
    return r.ok;
  };

  // تصدير Excel: يومي (اليوم المختار) أو شهري (شهر اليوم المختار). يُجلب من الخادم وقت الضغط ليكون محدّثاً.
  const month = date.slice(0, 7);
  const exportExcel = async (kind: "day" | "month") => {
    if (exporting) return;
    setExporting(kind);
    try {
      const { from, to } = monthRange(month);
      const r = await run(() => (kind === "day" ? salesService.listOrders(date) : salesService.listOrdersRange(from, to)));
      if (!r.ok) return;
      if (r.value.length === 0) {
        show(kind === "day" ? "لا توجد أوردرات في هذا اليوم للتصدير" : "لا توجد أوردرات في هذا الشهر للتصدير");
        return;
      }
      if (kind === "day") downloadSalesDaily(date, r.value);
      else downloadSalesMonthly(month, r.value);
    } finally {
      setExporting(null);
    }
  };

  const confirmDeleteOrder = async () => {
    if (!deletingOrder) return;
    const target = deletingOrder;
    const r = await run(() => salesService.removeOrder(target.id));
    await refresh();
    if (r.ok) show(target.stockDeducted ? "حُذف الأوردر وأُعيدت مكوناته إلى المخزون" : "حُذف الأوردر");
  };

  const lineAction = (fn: (o: SalesOrder) => Promise<unknown>) => async (o: SalesOrder) => {
    await run(() => fn(o));
    await refresh();
  };
  const addLine = (o: SalesOrder, productId: string) => lineAction((x) => salesService.addLine(x.id, productId, 1))(o);
  const setLineQty = (o: SalesOrder, lineId: string, quantity: number) => lineAction((x) => salesService.setLineQuantity(x.id, lineId, quantity))(o);
  const removeLine = (o: SalesOrder, lineId: string) => lineAction((x) => salesService.removeLine(x.id, lineId))(o);
  // تعديل مكوّنات أوردر واحد (لا يغيّر المنتج الثابت ولا الأوردرات الأخرى)
  const addComponent = (o: SalesOrder, lineId: string, itemId: string) => lineAction((x) => salesService.addComponent(x.id, lineId, itemId, 1))(o);
  const setComponentQty = (o: SalesOrder, lineId: string, componentId: string, quantity: number) => lineAction((x) => salesService.setComponentQuantity(x.id, lineId, componentId, quantity))(o);
  const removeComponent = (o: SalesOrder, lineId: string, componentId: string) => lineAction((x) => salesService.removeComponent(x.id, lineId, componentId))(o);

  // ===== المنتجات الثابتة =====
  const submitProduct = async (input: SalesProductInput) => {
    const editing = editor?.editing ?? null;
    const r = await run(() => (editing ? salesService.updateProduct(editing.id, input) : salesService.createProduct(input)));
    await refresh();
    if (r.ok) show(editing ? "تم تحديث المنتج الثابت" : "أُضيف المنتج الثابت");
    return r.ok;
  };

  const toggleProduct = async (p: SalesProduct) => {
    const r = await run(() => salesService.updateProduct(p.id, { isActive: !p.isActive }));
    await refresh();
    if (r.ok) show(p.isActive ? "أُوقف المنتج" : "تم تفعيل المنتج");
  };

  const confirmDeleteProduct = async () => {
    if (!deletingProduct) return;
    const target = deletingProduct;
    const r = await run(() => salesService.removeProduct(target.id));
    await refresh();
    if (r.ok) show("حُذف المنتج الثابت");
  };

  const loading = (orders.loading || products.loading || stock.loading) && orders.data === NO_PAYLOAD;
  const error = orders.error ?? products.error;
  const searching = q !== "";

  return (
    <AppLayout
      headerSlot={(openMobileNav) => (
        <Header
          title="مبيعات إلكترونية"
          description="أوردرات يومية من منتجات ثابتة، ويُخصم المخزون تلقائياً عند التنفيذ"
          onOpenMobileNav={openMobileNav}
          action={
            <Button size="sm" variant="secondary" icon={<Boxes size={15} />} onClick={() => setProductsOpen(true)}>
              <span className="hidden sm:inline">المنتجات الثابتة</span>
            </Button>
          }
        />
      )}
    >
      {loading ? (
        <LoadingState label="جارٍ تحميل المبيعات..." />
      ) : error ? (
        <ErrorState message={error} onRetry={() => void Promise.all([orders.retry(), products.retry()])} />
      ) : (
        <div className="flex flex-col gap-5">
          <DateNavigator value={date} onChange={(d) => { setDate(d); setSearchInput(""); setQ(""); }} />

          {/* تصدير Excel يومي وشهري */}
          <div className="flex flex-wrap items-center gap-2" role="group" aria-label="تصدير Excel">
            <Button variant="secondary" size="sm" icon={<Download size={15} />} disabled={exporting !== null} onClick={() => void exportExcel("day")}>
              {exporting === "day" ? "جارٍ التصدير..." : "Excel يومي"}
            </Button>
            <Button variant="secondary" size="sm" icon={<Download size={15} />} disabled={exporting !== null} onClick={() => void exportExcel("month")}>
              {exporting === "month" ? "جارٍ التصدير..." : `Excel شهري — ${formatArabicDate(`${month}-01`, "MMMM yyyy")}`}
            </Button>
          </div>

          {/* إضافة سريعة: اضغط على المنتج فيُضاف أوردر جديد بمحتوياته */}
          <section className="pp-panel flex flex-col gap-3 p-4" aria-label="إضافة أوردر">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="flex items-center gap-2 text-base font-bold text-text">
                <ShoppingBag size={18} /> إضافة أوردر
              </h2>
              <Button size="sm" icon={<Plus size={14} />} onClick={() => setNewOrderOpen(true)}>
                أوردر بعدة منتجات
              </Button>
            </div>
            {activeProducts.length === 0 ? (
              <div className="flex flex-wrap items-center gap-3 text-sm text-muted">
                <span>لا توجد منتجات ثابتة بعد.</span>
                <Button size="sm" variant="secondary" icon={<Plus size={14} />} onClick={() => setEditor({ editing: null })}>
                  إنشاء أول منتج ثابت
                </Button>
              </div>
            ) : (
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs text-muted">اضغط لإضافة أوردر لهذا اليوم:</span>
                {activeProducts.map((p) => (
                  <div key={p.id} className="inline-flex items-center gap-1">
                    <button type="button" onClick={() => quickAdd(p)} className="task-btn task-btn--secondary" title={p.components.map((c) => c.itemName).join("، ")}>
                      <Plus size={14} /> {p.name}
                    </button>
                    <button type="button" onClick={() => setEditor({ editing: p })} aria-label={`تعديل ${p.name}`} title="تعديل المنتج الثابت" className="task-icon-btn !h-8 !w-8">
                      <Pencil size={14} />
                    </button>
                    <button type="button" onClick={() => setDeletingProduct(p)} aria-label={`حذف ${p.name}`} title="حذف المنتج الثابت" className="task-icon-btn task-icon-btn--danger !h-8 !w-8">
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))}
                <button type="button" onClick={() => setEditor({ editing: null })} className="task-btn task-btn--ghost">
                  <Plus size={14} /> منتج ثابت جديد
                </button>
              </div>
            )}
          </section>

          {/* ملخص اليوم */}
          {!searching && (
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-5" aria-label="ملخص اليوم">
              <div className="pp-card p-3.5">
                <p className="text-xs text-muted">عدد الأوردرات</p>
                <p className="mt-1 text-lg font-bold text-text">{summary.count}</p>
              </div>
              <div className="pp-card p-3.5">
                <p className="text-xs text-muted">إجمالي التكلفة</p>
                <p className="mt-1 text-lg font-bold text-text">{fmtMoney(summary.cost)}</p>
              </div>
              <div className="pp-card p-3.5">
                <p className="text-xs text-muted">إجمالي البيع</p>
                <p className="mt-1 text-lg font-bold text-primary-deep">{fmtMoney(summary.sell)}</p>
              </div>
              <div className="pp-card p-3.5">
                <p className="text-xs text-muted">الربح</p>
                <p className={`mt-1 text-lg font-bold ${summary.profit < 0 ? "text-problem" : "text-text"}`}>{fmtMoney(summary.profit)}</p>
              </div>
              <div className="pp-card p-3.5">
                <p className="text-xs text-muted">تالف اليوم{damaged.orders > 0 ? ` (${damaged.orders} أوردر)` : ""}</p>
                <p className={`mt-1 text-lg font-bold ${damaged.total > 0 ? "text-problem" : "text-text"}`}>{fmtMoney(damaged.total)}</p>
              </div>
            </div>
          )}

          {/* بحث وفلتر الحالة */}
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="فلتر الحالة">
              <button
                type="button"
                onClick={() => setStatusFilter("ALL")}
                aria-pressed={statusFilter === "ALL"}
                className={`task-btn !px-3 !py-1.5 !text-xs ${statusFilter === "ALL" ? "task-btn--primary" : "task-btn--secondary"}`}
              >
                الكل ({dayOrders.length})
              </button>
              {SALES_STATUS_ORDER.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setStatusFilter(s)}
                  aria-pressed={statusFilter === s}
                  className={`task-btn !px-3 !py-1.5 !text-xs ${statusFilter === s ? "task-btn--primary" : "task-btn--secondary"}`}
                >
                  {SALES_STATUS_META[s].label} ({countsByStatus.get(s) ?? 0})
                </button>
              ))}
            </div>
            <div className="relative lg:w-72">
              <Search size={16} className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-muted" />
              <input
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder="ابحث برقم البوليصة أو المقفل (كل الأيام)"
                aria-label="بحث في الأوردرات"
                className="pp-input pp-input--icon"
              />
            </div>
          </div>

          {/* الأوردرات */}
          {stale ? (
            <LoadingState label="جارٍ التحميل..." />
          ) : visible.length === 0 ? (
            <div className="pp-panel">
              <EmptyState
                icon={<Receipt size={24} />}
                title={searching ? "لا توجد أوردرات مطابقة" : dayOrders.length === 0 ? "لا توجد أوردرات في هذا اليوم" : "لا توجد أوردرات بهذه الحالة"}
                description={searching ? "جرّب رقم بوليصة أو اسم مقفل آخر." : dayOrders.length === 0 ? "اضغط على أحد المنتجات الثابتة أعلاه لإضافة أوردر." : undefined}
              />
            </div>
          ) : (
            <div className="grid items-start gap-3 xl:grid-cols-2 2xl:grid-cols-3">
              {visible.map((o) => (
                <SalesOrderCard
                  key={o.id}
                  order={o}
                  index={dayOrders.findIndex((x) => x.id === o.id) + 1}
                  showDate={searching}
                  products={products.data}
                  closers={closers.data}
                  onPatch={patchOrder}
                  onStatus={changeStatus}
                  onReturn={returnOrder}
                  onDelete={setDeletingOrder}
                  onAddLine={addLine}
                  onSetLineQty={setLineQty}
                  onRemoveLine={removeLine}
                  items={activeItems}
                  onAddComponent={addComponent}
                  onSetComponentQty={setComponentQty}
                  onRemoveComponent={removeComponent}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {newOrderOpen && <NewOrderModal open onClose={() => setNewOrderOpen(false)} date={date} products={products.data} closers={closers.data} onSubmit={createOrder} />}

      <SalesProductsModal
        open={productsOpen}
        onClose={() => setProductsOpen(false)}
        products={products.data}
        onCreate={() => setEditor({ editing: null })}
        onEdit={(p) => setEditor({ editing: p })}
        onToggleActive={(p) => void toggleProduct(p)}
        onDelete={setDeletingProduct}
      />

      {editor && <ProductEditorModal key={editor.editing?.id ?? "new"} open onClose={() => setEditor(null)} editing={editor.editing} items={activeItems} categories={stock.data.categories} onSubmit={submitProduct} />}

      <ConfirmDialog
        open={!!deletingOrder}
        onClose={() => setDeletingOrder(null)}
        onConfirm={() => void confirmDeleteOrder()}
        title="حذف الأوردر؟"
        description={deletingOrder?.stockDeducted ? "الأوردر منفّذ؛ ستُعاد مكوناته المخصومة إلى المخزون ثم يُحذف." : "سيُحذف الأوردر نهائياً (لم يُخصم منه شيء من المخزون)."}
        confirmLabel="حذف"
      />
      <ConfirmDialog
        open={!!deletingProduct}
        onClose={() => setDeletingProduct(null)}
        onConfirm={() => void confirmDeleteProduct()}
        title={deletingProduct ? `حذف «${deletingProduct.name}»؟` : "حذف المنتج؟"}
        description="لن تتأثر الأوردرات السابقة؛ ويمكنك إيقافه بدل حذفه."
        confirmLabel="حذف"
      />
    </AppLayout>
  );
}
