import { useMemo, useState } from "react";
import { History, Minus, PackageMinus, Plus, Search, Trash2 } from "lucide-react";
import { AppLayout } from "../components/layout/AppLayout";
import { Header } from "../components/header/Header";
import { fmtQty } from "../components/inventory/format";
import { Badge } from "../components/ui/Badge";
import { AttachmentImage } from "../components/ui/ImageAttachments";
import { Button } from "../components/ui/Button";
import { EmptyState } from "../components/ui/EmptyState";
import { ErrorState, LoadingState } from "../components/ui/StatusViews";
import { useToast } from "../components/ui/ToastProvider";
import { useAuth } from "../components/auth/AuthProvider";
import { useResource } from "../hooks/useResource";
import { useSafeAction } from "../hooks/useSafeAction";
import { inventoryService } from "../services/inventoryService";
import type { InventoryItem, InventoryMovement } from "../types";

const NO_ITEMS: InventoryItem[] = [];
const NO_LOG: InventoryMovement[] = [];

// صفحة السحب: اختر أصنافاً من المخزون وكمياتها ثم أكّد السحب. الرصيد يُخصم فوراً من المخزون (كله أو لا شيء).
async function listActive() {
  return (await inventoryService.list()).items.filter((i) => i.isActive);
}

export default function WithdrawalsPage() {
  const [search, setSearch] = useState("");
  const [cart, setCart] = useState<Record<string, string>>({}); // itemId → كمية (نص ليسهل الكتابة)
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const { show } = useToast();
  const run = useSafeAction();
  const { user } = useAuth();
  const stock = useResource<InventoryItem[]>(listActive, NO_ITEMS);
  const log = useResource<InventoryMovement[]>(inventoryService.withdrawals, NO_LOG);
  const items = stock.data;

  const byId = useMemo(() => new Map(items.map((i) => [i.id, i])), [items]);
  const cartLines = Object.entries(cart)
    .map(([id, q]) => ({ item: byId.get(id), id, q, n: q.trim() === "" ? NaN : Number(q) }))
    .filter((l): l is { item: InventoryItem; id: string; q: string; n: number } => !!l.item);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items.filter((i) => !q || `${i.name} ${i.sku ?? ""}`.toLowerCase().includes(q));
  }, [items, search]);

  // سحوبات مجمّعة بحسب الطلب (batchId) من السجل
  const batches = useMemo(() => {
    const map = new Map<string, InventoryMovement[]>();
    for (const m of log.data) {
      const key = m.batchId ?? m.id;
      map.set(key, [...(map.get(key) ?? []), m]);
    }
    return [...map.values()];
  }, [log.data]);

  const add = (item: InventoryItem) => setCart((c) => (item.id in c ? c : { ...c, [item.id]: "1" }));
  const remove = (id: string) =>
    setCart((c) => {
      const { [id]: _drop, ...rest } = c;
      return rest;
    });
  const setQty = (id: string, v: string) => setCart((c) => ({ ...c, [id]: v }));
  const step = (id: string, d: number) => setQty(id, String(Math.max(0, Math.round(((Number(cart[id]) || 0) + d) * 1000) / 1000)));

  const problems = cartLines.map((l) => {
    if (!Number.isFinite(l.n) || l.n <= 0) return "أدخل كمية أكبر من صفر";
    if (l.n > l.item.quantity) return `المتاح ${fmtQty(l.item.quantity)} ${l.item.unit} فقط`;
    return "";
  });
  const canSubmit = cartLines.length > 0 && problems.every((p) => p === "") && !submitting;

  const submit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    const result = await run(() => inventoryService.withdraw(cartLines.map((l) => ({ itemId: l.id, quantity: l.n })), note.trim()));
    setSubmitting(false);
    // نحدّث الأرصدة والسجل في كل الأحوال (قد يكون غيرنا سحب قبلنا)
    await Promise.all([stock.reload(), log.reload()]);
    if (!result.ok) return;
    show("تم السحب وخُصم من المخزون");
    setCart({});
    setNote("");
  };

  const loading = stock.loading || log.loading;
  const error = stock.error ?? log.error;

  return (
    <AppLayout
      headerSlot={(openMobileNav) => <Header title="السحب من المخزون" description="اسحب الخامات المطلوبة وسيُخصم الرصيد تلقائياً" onOpenMobileNav={openMobileNav} action={<span className="hidden text-sm font-semibold text-text sm:inline">{user?.name}</span>} />}
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
                <PackageMinus size={18} /> الأصناف المتاحة
              </h2>
              <div className="relative">
                <Search size={16} className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-muted" />
                <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="ابحث بالاسم أو الكود..." aria-label="بحث عن صنف" className="pp-input pp-input--icon" />
              </div>
              {items.length === 0 ? (
                <EmptyState icon={<PackageMinus size={24} />} title="لا توجد أصناف في المخزون" description="اطلب من الإدارة إضافة الأصناف أولاً." />
              ) : visible.length === 0 ? (
                <p className="py-4 text-center text-sm text-muted">لا توجد نتائج</p>
              ) : (
                <ul className="flex max-h-[26rem] flex-col gap-1 overflow-y-auto">
                  {visible.map((i) => (
                    <li key={i.id} className="flex items-center justify-between gap-3 rounded-control px-3 py-2 pp-hover-row">
                      <div className="flex min-w-0 items-center gap-3">
                        {i.attachments[0] && (
                          <div className="h-11 w-11 shrink-0 overflow-hidden rounded-control border border-border bg-background">
                            <AttachmentImage attachment={i.attachments[0]} className="h-full w-full object-cover" />
                          </div>
                        )}
                        <div className="min-w-0">
                        <div className="truncate text-sm font-semibold text-text">{i.name}</div>
                        <div className="text-xs text-muted">
                          {i.categoryName} · المتاح {fmtQty(i.quantity)} {i.unit}
                          {i.isLow && <span className="mr-2 text-problem">· نقص</span>}
                        </div>
                        </div>
                      </div>
                      <Button type="button" size="sm" variant="secondary" disabled={i.quantity <= 0 || i.id in cart} onClick={() => add(i)} icon={<Plus size={14} />}>
                        {i.id in cart ? "مضاف" : i.quantity <= 0 ? "نفد" : "إضافة"}
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            {/* طلب السحب */}
            <section className="pp-panel flex flex-col gap-3 p-4" aria-label="طلب السحب">
              <h2 className="text-base font-bold text-text">طلب السحب {cartLines.length > 0 && <span className="text-sm font-normal text-muted">({cartLines.length})</span>}</h2>
              {cartLines.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted">أضف أصنافاً من القائمة لبدء السحب.</p>
              ) : (
                <ul className="flex flex-col gap-2">
                  {cartLines.map((l, idx) => (
                    <li key={l.id} className="rounded-control border border-border p-3">
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate text-sm font-semibold text-text">{l.item.name}</span>
                        <button type="button" onClick={() => remove(l.id)} aria-label={`إزالة ${l.item.name}`} className="rounded-full p-1.5 text-problem pp-hover-row">
                          <Trash2 size={15} />
                        </button>
                      </div>
                      <div className="mt-2 flex items-center gap-2">
                        <button type="button" onClick={() => step(l.id, -1)} aria-label="إنقاص" className="rounded-full border border-border p-1.5 pp-hover-row">
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
                        <button type="button" onClick={() => step(l.id, 1)} aria-label="زيادة" className="rounded-full border border-border p-1.5 pp-hover-row">
                          <Plus size={14} />
                        </button>
                        <span className="text-xs text-muted">{l.item.unit}</span>
                      </div>
                      {problems[idx] && <p className="mt-1.5 text-xs text-problem">{problems[idx]}</p>}
                    </li>
                  ))}
                </ul>
              )}
              <textarea value={note} onChange={(e) => setNote(e.target.value)} maxLength={1000} placeholder="سبب السحب / اسم المشروع (اختياري)" aria-label="ملاحظة السحب" className="pp-input min-h-[70px] resize-y" />
              <Button type="button" onClick={() => void submit()} disabled={!canSubmit} icon={<PackageMinus size={16} />}>
                {submitting ? "جارٍ السحب..." : "تأكيد السحب"}
              </Button>
            </section>
          </div>

          {/* سجل السحوبات */}
          <section className="pp-panel p-4" aria-label="سجل السحوبات">
            <h2 className="mb-3 flex items-center gap-2 text-base font-bold text-text">
              <History size={18} /> سجل السحوبات
            </h2>
            {batches.length === 0 ? (
              <p className="py-4 text-center text-sm text-muted">لا توجد سحوبات بعد</p>
            ) : (
              <ul className="flex flex-col gap-2">
                {batches.map((b) => (
                  <li key={b[0].batchId ?? b[0].id} className="rounded-control border border-border p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted">
                      <span className="font-semibold text-text">{b[0].createdByName}</span>
                      <span>{new Date(b[0].createdAt).toLocaleString("ar-EG")}</span>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {b.map((m) => (
                        <Badge key={m.id} color="#C0392B">
                          {m.itemName} · {fmtQty(Math.abs(m.delta))} {m.unit}
                        </Badge>
                      ))}
                    </div>
                    {b[0].note && <p className="mt-2 text-sm text-muted">{b[0].note}</p>}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      )}
    </AppLayout>
  );
}
