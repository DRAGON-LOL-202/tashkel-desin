import { useMemo, useState } from "react";
import { History, Minus, Package, PackageMinus, Plus, RotateCcw, Search, Trash2 } from "lucide-react";
import { AppLayout } from "../components/layout/AppLayout";
import { Header } from "../components/header/Header";
import { fmtQty, formatBatchCode } from "../components/inventory/format";
import { Badge } from "../components/ui/Badge";
import { AttachmentImage } from "../components/ui/ImageAttachments";
import { Button } from "../components/ui/Button";
import { EmptyState } from "../components/ui/EmptyState";
import { ErrorState, LoadingState } from "../components/ui/StatusViews";
import { useToast } from "../components/ui/ToastProvider";
import { useAuth } from "../components/auth/AuthProvider";
import { useResource } from "../hooks/useResource";
import { useSafeAction } from "../hooks/useSafeAction";
import { EMPTY_INVENTORY_DATA, inventoryService } from "../services/inventoryService";
import type { InventoryData, InventoryItem, InventoryMovement } from "../types";

const NO_LOG: InventoryMovement[] = [];

function makeRequestId(): string {
  return `w-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

// صفحة السحب: اختر أصنافاً من المخزون وكمياتها ثم أكّد السحب. الرصيد يُخصم فوراً من المخزون (كله أو لا شيء).
export default function WithdrawalsPage() {
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [quickQty, setQuickQty] = useState<Record<string, string>>({});
  const [cart, setCart] = useState<Record<string, string>>({}); // itemId → كمية السحب
  const [note, setNote] = useState("");
  const [requestId, setRequestId] = useState<string>(() => makeRequestId());
  const [submitting, setSubmitting] = useState(false);

  const { show } = useToast();
  const run = useSafeAction();
  const { user } = useAuth();
  const stock = useResource<InventoryData>(inventoryService.listForWithdraw, EMPTY_INVENTORY_DATA);
  const log = useResource<InventoryMovement[]>(inventoryService.withdrawals, NO_LOG);

  const items = useMemo(() => stock.data.items.filter((i) => i.isActive), [stock.data.items]);
  const categories = stock.data.categories;
  // تعبئة/مشغل بلا أي تصنيف ممنوح: الباكند يعيد قائمة فارغة (deny by default)، فنوضح السبب بدل «لا توجد أصناف»
  const noCategoriesGranted = (user?.accessRole === "packer" || user?.accessRole === "operator") && categories.length === 0;

  const byId = useMemo(() => new Map(items.map((i) => [i.id, i])), [items]);
  const cartLines = Object.entries(cart)
    .map(([id, q]) => ({ item: byId.get(id), id, q, n: q.trim() === "" ? NaN : Number(q) }))
    .filter((l): l is { item: InventoryItem; id: string; q: string; n: number } => !!l.item);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items
      .filter((i) => categoryFilter === "all" || i.categoryId === categoryFilter)
      .filter((i) => !q || `${i.name} ${i.sku ?? ""}`.toLowerCase().includes(q));
  }, [items, search, categoryFilter]);

  // سحوبات مجمّعة بحسب رقم العملية (batchId) من السجل
  const batches = useMemo(() => {
    const map = new Map<string, InventoryMovement[]>();
    for (const m of log.data) {
      const key = m.batchId ?? m.id;
      map.set(key, [...(map.get(key) ?? []), m]);
    }
    return [...map.values()];
  }, [log.data]);

  const add = (item: InventoryItem) => {
    const wanted = quickQty[item.id]?.trim();
    const initialQty = wanted && Number(wanted) > 0 ? wanted : "1";
    setCart((c) => (item.id in c ? c : { ...c, [item.id]: initialQty }));
  };

  const remove = (id: string) =>
    setCart((c) => {
      const { [id]: _drop, ...rest } = c;
      return rest;
    });

  const setQty = (id: string, v: string) => setCart((c) => ({ ...c, [id]: v }));
  const step = (id: string, d: number) =>
    setQty(id, String(Math.max(0, Math.round(((Number(cart[id]) || 0) + d) * 1000) / 1000)));

  const cancelOperation = () => {
    setCart({});
    setNote("");
    setRequestId(makeRequestId());
  };

  const totalSelectedQty = useMemo(() => {
    let milli = 0;
    for (const l of cartLines) {
      if (Number.isFinite(l.n) && l.n > 0) milli += Math.round(l.n * 1000);
    }
    return Math.round(milli) / 1000;
  }, [cartLines]);

  const problems = cartLines.map((l) => {
    if (!Number.isFinite(l.n) || l.n <= 0) return "أدخل كمية أكبر من صفر";
    if (l.n > l.item.quantity) return `المتاح ${fmtQty(l.item.quantity)} ${l.item.unit} فقط`;
    return "";
  });
  const canSubmit = cartLines.length > 0 && problems.every((p) => p === "") && !submitting;

  const submit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    const currentReqId = requestId;
    const result = await run(() =>
      inventoryService.withdraw(
        cartLines.map((l) => ({ itemId: l.id, quantity: l.n })),
        note.trim(),
        currentReqId
      )
    );
    setSubmitting(false);
    await Promise.all([stock.reload(), log.reload()]);
    if (!result.ok) return;
    show("تم تأكيد السحب وخُصمت الكميات من المخزون");
    setCart({});
    setNote("");
    setRequestId(makeRequestId());
  };

  const loading = stock.loading || log.loading;
  const error = stock.error ?? log.error;

  return (
    <AppLayout
      headerSlot={(openMobileNav) => (
        <Header
          title="السحب من المخزون"
          description="اختر المنتجات والكميات المطلوبة وسيُخصم الرصيد تلقائياً من المخزون"
          onOpenMobileNav={openMobileNav}
          action={<span className="hidden text-sm font-semibold text-text sm:inline">{user?.name}</span>}
        />
      )}
    >
      {loading ? (
        <LoadingState label="جارٍ تحميل المخزون..." />
      ) : error ? (
        <ErrorState message={error} onRetry={() => void Promise.all([stock.retry(), log.retry()])} />
      ) : (
        <div className="flex flex-col gap-5">
          <div className="grid items-start gap-5 lg:grid-cols-2">
            {/* الأصناف المتاحة */}
            <section className="pp-panel flex flex-col gap-3 p-4" aria-label="الأصناف المتاحة">
              <h2 className="flex items-center gap-2 text-base font-bold text-text">
                <PackageMinus size={18} /> منتجات المخزون المتاحة
              </h2>
              <div className="flex flex-col gap-2 sm:flex-row">
                <div className="relative flex-1">
                  <Search size={16} className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-muted" />
                  <input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="ابحث بالاسم أو الكود..."
                    aria-label="بحث عن صنف"
                    className="pp-input pp-input--icon"
                  />
                </div>
                <select
                  value={categoryFilter}
                  onChange={(e) => setCategoryFilter(e.target.value)}
                  aria-label="فلتر التصنيف"
                  className="pp-input pp-input--select cursor-pointer sm:w-40"
                >
                  <option value="all">كل التصنيفات</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>

              {items.length === 0 && noCategoriesGranted ? (
                <EmptyState icon={<PackageMinus size={24} />} title="لم تُمنح أي تصنيفات للسحب" description="تواصل مع الإدارة لمنحك تصنيفات المخزون المسموح لك السحب منها." />
              ) : items.length === 0 ? (
                <EmptyState icon={<PackageMinus size={24} />} title="لا توجد أصناف في المخزون" description="اطلب من الإدارة إضافة الأصناف أولاً." />
              ) : visible.length === 0 ? (
                <p className="py-4 text-center text-sm text-muted">لا توجد نتائج مطابقة</p>
              ) : (
                <ul className="flex max-h-[28rem] flex-col gap-1.5 overflow-y-auto">
                  {visible.map((i) => {
                    const inCart = i.id in cart;
                    return (
                      <li key={i.id} className="flex flex-wrap items-center justify-between gap-3 rounded-control border border-border/50 px-3 py-2.5 pp-hover-row">
                        <div className="flex min-w-0 flex-1 items-center gap-3">
                          <div className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-control border border-border bg-background">
                            {i.attachments[0] ? (
                              <AttachmentImage attachment={i.attachments[0]} className="h-full w-full object-cover" />
                            ) : (
                              <Package size={20} className="text-muted opacity-50" />
                            )}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <span className="truncate text-sm font-semibold text-text">{i.name}</span>
                              {i.sku && (
                                <span className="rounded bg-background px-1.5 py-0.5 text-[11px] text-muted" dir="ltr">
                                  {i.sku}
                                </span>
                              )}
                            </div>
                            <div className="mt-0.5 text-xs text-muted">
                              التصنيف: {i.categoryName} · المتاح:{" "}
                              <strong className={i.quantity <= 0 ? "text-problem" : "text-text"}>
                                {fmtQty(i.quantity)} {i.unit}
                              </strong>
                              {i.isLow && <span className="mr-2 text-problem">· منخفض</span>}
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          {!inCart && i.quantity > 0 && (
                            <input
                              type="number"
                              inputMode="decimal"
                              min={0.001}
                              max={i.quantity}
                              step="any"
                              value={quickQty[i.id] ?? "1"}
                              onChange={(e) => setQuickQty((prev) => ({ ...prev, [i.id]: e.target.value }))}
                              aria-label={`كمية السحب المبدئية لـ ${i.name}`}
                              className="pp-input !h-8 w-16 px-2 text-center text-xs"
                            />
                          )}
                          <Button
                            type="button"
                            size="sm"
                            variant="secondary"
                            disabled={i.quantity <= 0 || inCart}
                            onClick={() => add(i)}
                            icon={<Plus size={14} />}
                          >
                            {inCart ? "مضاف للسلة" : i.quantity <= 0 ? "نفد" : "إضافة"}
                          </Button>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>

            {/* سلة وطلب السحب */}
            <section className="pp-panel flex flex-col gap-3 p-4" aria-label="طلب السحب">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-base font-bold text-text">
                  سلة السحب{" "}
                  {cartLines.length > 0 && (
                    <span className="text-xs font-normal text-muted">
                      (إجمالي الأصناف المختارة: {cartLines.length} صنف · مجموع الكميات: {fmtQty(totalSelectedQty)})
                    </span>
                  )}
                </h2>
                {cartLines.length > 0 && (
                  <button
                    type="button"
                    onClick={cancelOperation}
                    className="flex items-center gap-1 text-xs text-problem hover:underline"
                  >
                    <RotateCcw size={13} /> إلغاء العملية
                  </button>
                )}
              </div>

              {cartLines.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted">أضف أصنافاً من القائمة لبدء عملية السحب.</p>
              ) : (
                <ul className="flex flex-col gap-2">
                  {cartLines.map((l, idx) => (
                    <li key={l.id} className="rounded-control border border-border p-3">
                      <div className="flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <span className="truncate text-sm font-semibold text-text">{l.item.name}</span>
                          <span className="mr-2 text-xs text-muted">
                            ({l.item.categoryName}
                            {l.item.sku ? ` · ${l.item.sku}` : ""} · المتاح: {fmtQty(l.item.quantity)} {l.item.unit})
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() => remove(l.id)}
                          aria-label={`إزالة ${l.item.name}`}
                          title="إزالة من السلة"
                          className="rounded-full p-1.5 text-problem pp-hover-row"
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                      <div className="mt-2 flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => step(l.id, -1)}
                          aria-label="إنقاص"
                          className="rounded-full border border-border p-1.5 pp-hover-row"
                        >
                          <Minus size={14} />
                        </button>
                        <input
                          type="number"
                          inputMode="decimal"
                          min={0}
                          step="any"
                          value={l.q}
                          onChange={(e) => setQty(l.id, e.target.value)}
                          aria-label={`كمية ${l.item.name}`}
                          className="pp-input w-28 text-center"
                        />
                        <button
                          type="button"
                          onClick={() => step(l.id, 1)}
                          aria-label="زيادة"
                          className="rounded-full border border-border p-1.5 pp-hover-row"
                        >
                          <Plus size={14} />
                        </button>
                        <span className="text-xs text-muted">{l.item.unit}</span>
                      </div>
                      {problems[idx] && <p className="mt-1.5 text-xs text-problem">{problems[idx]}</p>}
                    </li>
                  ))}
                </ul>
              )}

              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                maxLength={1000}
                placeholder="ملاحظات العملية / سبب السحب / اسم المشروع (اختياري)"
                aria-label="ملاحظة السحب"
                className="pp-input min-h-[70px] resize-y"
              />

              <div className="flex items-center justify-end gap-2">
                {cartLines.length > 0 && (
                  <Button type="button" variant="secondary" onClick={cancelOperation} disabled={submitting}>
                    إلغاء العملية
                  </Button>
                )}
                <Button
                  type="button"
                  onClick={() => void submit()}
                  disabled={!canSubmit}
                  icon={<PackageMinus size={16} />}
                  className="flex-1"
                >
                  {submitting ? "جارٍ تنفيذ السحب..." : `تأكيد السحب (${cartLines.length})`}
                </Button>
              </div>
            </section>
          </div>

          {/* سجل السحوبات المجمع حسب رقم العملية */}
          <section className="pp-panel p-4" aria-label="سجل السحوبات">
            <h2 className="mb-3 flex items-center gap-2 text-base font-bold text-text">
              <History size={18} /> سجل عمليات السحب
            </h2>
            {batches.length === 0 ? (
              <p className="py-4 text-center text-sm text-muted">لا توجد عمليات سحب مسجلة بعد</p>
            ) : (
              <ul className="flex flex-col gap-2.5">
                {batches.map((b) => {
                  const opCode = formatBatchCode(b[0].batchId, b[0].id);
                  return (
                    <li key={b[0].batchId ?? b[0].id} className="rounded-control border border-border p-3.5">
                      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="rounded bg-primary/15 px-2 py-0.5 font-mono text-xs font-bold text-primary-deep" dir="ltr">
                            {opCode}
                          </span>
                          <span>
                            الموظف المسؤول: <strong className="text-text">{b[0].createdByName}</strong>
                          </span>
                          <span>· عدد الأصناف: {b.length}</span>
                        </div>
                        <span>{new Date(b[0].createdAt).toLocaleString("ar-EG")}</span>
                      </div>
                      <div className="mt-2.5 flex flex-wrap gap-2">
                        {b.map((m) => (
                          <Badge key={m.id} color="#C0392B">
                            {m.itemName} {m.itemSku ? `(${m.itemSku})` : ""} · {fmtQty(Math.abs(m.delta))} {m.unit}
                          </Badge>
                        ))}
                      </div>
                      {b[0].note && <p className="mt-2 text-xs text-muted">ملاحظات: {b[0].note}</p>}
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </div>
      )}
    </AppLayout>
  );
}
