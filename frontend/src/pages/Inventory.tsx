import { useMemo, useState } from "react";
import { AlertTriangle, ArrowDownUp, History, Pencil, Plus, Search, Trash2, Warehouse } from "lucide-react";
import { AppLayout } from "../components/layout/AppLayout";
import { Header } from "../components/header/Header";
import { ItemModal } from "../components/inventory/ItemModal";
import { MovementModal } from "../components/inventory/MovementModal";
import { MovementsModal } from "../components/inventory/MovementsModal";
import { fmtQty } from "../components/inventory/format";
import { Badge } from "../components/ui/Badge";
import { ConfirmDialog } from "../components/ui/ConfirmDialog";
import { EmptyState } from "../components/ui/EmptyState";
import { ErrorState, LoadingState } from "../components/ui/StatusViews";
import { useToast } from "../components/ui/ToastProvider";
import { useAuth } from "../components/auth/AuthProvider";
import { usePermissions } from "../hooks/usePermissions";
import { useResource } from "../hooks/useResource";
import { useSafeAction } from "../hooks/useSafeAction";
import { inventoryService } from "../services/inventoryService";
import type { InventoryItem, InventoryItemInput, InventoryMovementInput } from "../types";

const EMPTY: InventoryItem[] = [];

export default function InventoryPage() {
  const [search, setSearch] = useState("");
  const [lowOnly, setLowOnly] = useState(false);
  const [showInactive, setShowInactive] = useState(false);
  const [itemModal, setItemModal] = useState<{ editing: InventoryItem | null } | null>(null);
  const [moving, setMoving] = useState<InventoryItem | null>(null);
  const [history, setHistory] = useState<InventoryItem | null>(null);
  const [deleting, setDeleting] = useState<InventoryItem | null>(null);
  const { show } = useToast();
  const run = useSafeAction();
  const { user } = useAuth();
  const { canManageInventory, canDeleteInventory } = usePermissions();
  const { data: items, loading, error, reload, retry } = useResource<InventoryItem[]>(inventoryService.list, EMPTY);

  const lowCount = useMemo(() => items.filter((i) => i.isActive && i.isLow).length, [items]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items
      .filter((i) => showInactive || i.isActive)
      .filter((i) => !lowOnly || i.isLow)
      .filter((i) => !q || `${i.name} ${i.sku ?? ""}`.toLowerCase().includes(q));
  }, [items, search, lowOnly, showInactive]);

  // العنصر المفتوح في النوافذ يُؤخذ من القائمة الحية ليظهر رصيده المحدَّث دائماً
  const live = (i: InventoryItem | null) => (i ? (items.find((x) => x.id === i.id) ?? i) : null);
  const movingLive = live(moving);
  const historyLive = live(history);

  const handleItemSubmit = async (input: InventoryItemInput) => {
    const editing = itemModal?.editing ?? null;
    const result = await run(() => (editing ? inventoryService.update(editing.id, input) : inventoryService.create(input)));
    await reload();
    if (!result.ok) return false;
    show(editing ? "تم تحديث العنصر" : "تمت إضافة العنصر");
    return true;
  };

  const handleMove = async (input: InventoryMovementInput) => {
    if (!moving) return false;
    const target = moving;
    const result = await run(() => inventoryService.move(target.id, input));
    await reload();
    if (!result.ok) return false;
    show("تم تسجيل الحركة");
    return true;
  };

  const handleDelete = async () => {
    if (!deleting) return;
    const target = deleting;
    setDeleting(null);
    const result = await run(() => inventoryService.remove(target.id));
    await reload();
    if (result.ok) show("تم حذف العنصر", "info");
  };

  const addButton = canManageInventory ? (
    <button type="button" onClick={() => setItemModal({ editing: null })} className="task-btn task-btn--primary">
      <Plus size={18} /> إضافة عنصر
    </button>
  ) : null;

  return (
    <AppLayout
      headerSlot={(openMobileNav) => <Header title="المخزون" description="الأرصدة وحركات الإدخال والإخراج" onOpenMobileNav={openMobileNav} action={<span className="hidden text-sm font-semibold text-text sm:inline">{user?.name}</span>} />}
    >
      {loading ? (
        <LoadingState label="جارٍ تحميل المخزون..." />
      ) : error ? (
        <ErrorState message={error} onRetry={() => void retry()} />
      ) : (
        <div className="flex flex-col gap-5">
          <div className="pp-panel flex flex-wrap items-center justify-between gap-4 px-5 py-4">
            <div className="flex items-center gap-3">
              <div className="pp-tint flex h-11 w-11 items-center justify-center rounded-2xl text-primary-deep">
                <Warehouse size={22} />
              </div>
              <div>
                <h2 className="text-xl font-bold text-text">المخزون</h2>
                <p className="mt-0.5 text-xs text-muted">
                  {items.filter((i) => i.isActive).length} عنصر{lowCount > 0 ? ` — ${lowCount} تحت الحد الأدنى` : ""}
                </p>
              </div>
            </div>
            {addButton}
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="relative min-w-0 flex-1">
              <Search size={16} className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-muted" />
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="ابحث بالاسم أو الكود..." aria-label="بحث في المخزون" className="pp-input pp-input--icon" />
            </div>
            <label className="flex items-center gap-2 text-sm text-text">
              <input type="checkbox" checked={lowOnly} onChange={(e) => setLowOnly(e.target.checked)} />
              النقص فقط
            </label>
            <label className="flex items-center gap-2 text-sm text-text">
              <input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} />
              عرض المعطّل
            </label>
          </div>

          {items.length === 0 ? (
            <EmptyState icon={<Warehouse size={24} />} title="لا توجد عناصر في المخزون" description={canManageInventory ? "أضف أول عنصر مع رصيده الافتتاحي." : "لم تُضف أي عناصر بعد."} action={addButton ?? undefined} />
          ) : visible.length === 0 ? (
            <EmptyState icon={<Search size={24} />} title="لا توجد نتائج" description="جرّب تغيير البحث أو الفلاتر." />
          ) : (
            <div className="pp-panel overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-right text-xs text-muted">
                    <th className="px-4 py-3 font-medium">العنصر</th>
                    <th className="px-4 py-3 font-medium">الرصيد</th>
                    <th className="px-4 py-3 font-medium">الحد الأدنى</th>
                    <th className="px-4 py-3 font-medium">الحالة</th>
                    <th className="px-4 py-3 font-medium">إجراءات</th>
                  </tr>
                </thead>
                <tbody>
                  {visible.map((i) => (
                    <tr key={i.id} className={`border-b border-border/60 ${i.isActive ? "" : "opacity-60"}`}>
                      <td className="px-4 py-3">
                        <div className="font-semibold text-text">{i.name}</div>
                        <div className="text-xs text-muted">{i.sku ?? ""}</div>
                      </td>
                      <td className="px-4 py-3 font-semibold text-text">
                        {fmtQty(i.quantity)} <span className="text-xs font-normal text-muted">{i.unit}</span>
                      </td>
                      <td className="px-4 py-3 text-muted">{i.minQuantity > 0 ? fmtQty(i.minQuantity) : "—"}</td>
                      <td className="px-4 py-3">
                        {!i.isActive ? (
                          <Badge>معطّل</Badge>
                        ) : i.isLow ? (
                          <Badge color="#C0392B">
                            <AlertTriangle size={12} /> نقص
                          </Badge>
                        ) : (
                          <Badge color="#1E8E5A">متوفر</Badge>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1">
                          <button type="button" onClick={() => setHistory(i)} aria-label={`سجل حركات ${i.name}`} title="سجل الحركات" className="rounded-full p-1.5 text-muted pp-hover-row">
                            <History size={16} />
                          </button>
                          {canManageInventory && (
                            <>
                              <button type="button" onClick={() => setMoving(i)} disabled={!i.isActive} aria-label={`حركة على ${i.name}`} title="حركة مخزون" className="rounded-full p-1.5 text-muted pp-hover-row disabled:opacity-40">
                                <ArrowDownUp size={16} />
                              </button>
                              <button type="button" onClick={() => setItemModal({ editing: i })} aria-label={`تعديل ${i.name}`} title="تعديل" className="rounded-full p-1.5 text-muted pp-hover-row">
                                <Pencil size={16} />
                              </button>
                            </>
                          )}
                          {canDeleteInventory && (
                            <button type="button" onClick={() => setDeleting(i)} aria-label={`حذف ${i.name}`} title="حذف نهائي" className="rounded-full p-1.5 text-problem pp-hover-row">
                              <Trash2 size={16} />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {itemModal && (
        <ItemModal key={itemModal.editing?.id ?? "new"} open onClose={() => setItemModal(null)} editing={itemModal.editing} onSubmit={handleItemSubmit} />
      )}
      {movingLive && <MovementModal key={movingLive.id} open onClose={() => setMoving(null)} item={movingLive} onSubmit={handleMove} />}
      {historyLive && <MovementsModal open onClose={() => setHistory(null)} item={historyLive} />}

      <ConfirmDialog
        open={!!deleting}
        onClose={() => setDeleting(null)}
        onConfirm={() => void handleDelete()}
        title="حذف عنصر المخزون"
        description={deleting ? `سيُحذف «${deleting.name}» مع كل سجل حركاته نهائياً. يمكنك تعطيله بدل حذفه.` : undefined}
        confirmLabel="حذف نهائي"
      />
    </AppLayout>
  );
}
