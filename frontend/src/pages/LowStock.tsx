import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  AlertTriangle,
  ArrowDownToLine,
  ArrowRight,
  Eye,
  FileSpreadsheet,
  History,
  Package,
  PackageX,
  Search,
} from "lucide-react";
import { AppLayout } from "../components/layout/AppLayout";
import { Header } from "../components/header/Header";
import { MovementModal } from "../components/inventory/MovementModal";
import { MovementsModal } from "../components/inventory/MovementsModal";
import { ItemDetailsModal } from "../components/inventory/ItemDetailsModal";
import { CategoryOptions } from "../components/inventory/CategoryOptions";
import { ItemModal } from "../components/inventory/ItemModal";
import { StocktakeModal } from "../components/inventory/StocktakeModal";
import { ReturnModal } from "../components/inventory/ReturnModal";
import { STATUS_META, calcTotalValue, fmtMoney, fmtQty } from "../components/inventory/format";
import { Badge } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import { AttachmentImage } from "../components/ui/ImageAttachments";
import { EmptyState } from "../components/ui/EmptyState";
import { ErrorState, LoadingState } from "../components/ui/StatusViews";
import { useToast } from "../components/ui/ToastProvider";
import { useAuth } from "../components/auth/AuthProvider";
import { usePermissions } from "../hooks/usePermissions";
import { useResource } from "../hooks/useResource";
import { useSafeAction } from "../hooks/useSafeAction";
import { ApiError, errorMessage } from "../lib/api";
import { exportInventoryReport } from "../lib/exportInventory";
import { EMPTY_INVENTORY_DATA, inventoryService } from "../services/inventoryService";
import type { InventoryCategory, InventoryData, InventoryItem, InventoryItemInput, InventoryMovementInput } from "../types";

export default function LowStockPage() {
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState<"ALL" | "LOW_STOCK" | "OUT_OF_STOCK">("ALL");

  const [detailsItem, setDetailsItem] = useState<InventoryItem | null>(null);
  const [editingItem, setEditingItem] = useState<InventoryItem | null>(null);
  const [movingItem, setMovingItem] = useState<{ item: InventoryItem; type: "IN" | "OUT" } | null>(null);
  const [stocktakeItem, setStocktakeItem] = useState<InventoryItem | null>(null);
  const [returnItem, setReturnItem] = useState<InventoryItem | null>(null);
  const [historyItem, setHistoryItem] = useState<InventoryItem | null>(null);

  const { show } = useToast();
  const run = useSafeAction();
  const { user } = useAuth();
  const { canManageInventory } = usePermissions();
  const { data, loading, error, reload, retry } = useResource<InventoryData>(inventoryService.list, EMPTY_INVENTORY_DATA);
  const { items, categories, groups, units } = data;

  const shortages = useMemo(
    () => items.filter((i) => i.isActive && (i.isShortage || i.quantity <= i.minQuantity || i.quantity === 0)),
    [items]
  );

  const lowCount = useMemo(() => shortages.filter((i) => i.status === "LOW_STOCK").length, [shortages]);
  const outCount = useMemo(() => shortages.filter((i) => i.status === "OUT_OF_STOCK").length, [shortages]);
  const totalReorderCost = useMemo(() => {
    let cents = 0;
    for (const i of shortages) {
      cents += Math.round(calcTotalValue(i.suggestedReorderQty, i.unitPrice) * 100);
    }
    return Math.round(cents) / 100;
  }, [shortages]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return shortages
      .filter((i) => categoryFilter === "all" || i.categoryId === categoryFilter)
      .filter((i) => statusFilter === "ALL" || i.status === statusFilter)
      .filter((i) => !q || `${i.name} ${i.sku ?? ""}`.toLowerCase().includes(q));
  }, [shortages, categoryFilter, statusFilter, search]);

  const live = (i: InventoryItem | null) => (i ? (items.find((x) => x.id === i.id) ?? i) : null);

  const handleMove = async (itemId: string, input: InventoryMovementInput) => {
    const result = await run(() => inventoryService.move(itemId, input));
    await reload();
    if (!result.ok) return false;
    show("تم تحديث رصيد المنتج وحالته تلقائياً");
    return true;
  };

  const handleCreateCategory = async (name: string, groupId: string, description = ""): Promise<InventoryCategory | null> => {
    try {
      const created = await inventoryService.createCategory(name, groupId, description);
      await reload();
      show("تمت إضافة التصنيف");
      return created;
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        const fresh = await inventoryService.list().catch(() => null);
        if (fresh) {
          const existing = fresh.categories.find((c) => c.name.toLowerCase() === name.trim().toLowerCase());
          await reload();
          if (existing) return existing;
        }
      }
      show(errorMessage(err), "error");
      return null;
    }
  };

  const handleItemSubmit = async (input: Partial<InventoryItemInput>) => {
    if (!editingItem) return false;
    const result = await run(() => inventoryService.update(editingItem.id, input));
    await reload();
    if (!result.ok) return false;
    show("تم تحديث المنتج");
    return true;
  };

  const handleToggleArchive = async (item: InventoryItem) => {
    const result = await run(() => inventoryService.update(item.id, { isActive: !item.isActive }));
    await reload();
    if (result.ok) show(item.isActive ? "تمت أرشفة المنتج" : "تمت استعادة المنتج");
  };

  const handleExportShortages = () => {
    exportInventoryReport({ reportType: "shortages" }, items, []);
    show("تم تصدير تقرير نواقص المخزون إلى Excel");
  };

  return (
    <AppLayout
      headerSlot={(openMobileNav) => (
        <Header
          title="نواقص المخزون"
          description="المنتجات التي وصلت للحد الأدنى أو نفدت وتحتاج إلى إعادة طلب"
          onOpenMobileNav={openMobileNav}
          action={<span className="hidden text-sm font-semibold text-text sm:inline">{user?.name}</span>}
        />
      )}
    >
      {loading ? (
        <LoadingState label="جارٍ تحميل نواقص المخزون..." />
      ) : error ? (
        <ErrorState message={error} onRetry={() => void retry()} />
      ) : (
        <div className="flex flex-col gap-5">
          {/* الشريط العلوي */}
          <div className="pp-panel flex flex-wrap items-center justify-between gap-4 px-5 py-4">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-problem/15 text-problem">
                <AlertTriangle size={22} />
              </div>
              <div>
                <h2 className="text-xl font-bold text-text">نواقص المخزون والتنبيهات</h2>
                <p className="mt-0.5 text-xs text-muted">
                  تتحدث القائمة تلقائياً بعد كل عملية وارد أو سحب أو جرد أو مرتجع
                </p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button type="button" variant="secondary" size="sm" onClick={handleExportShortages} icon={<FileSpreadsheet size={16} />}>
                تصدير النواقص Excel
              </Button>
              <Link to="/inventory" className="task-btn task-btn--ghost text-sm">
                <ArrowRight size={16} /> العودة للوحة المخزون
              </Link>
            </div>
          </div>

          {/* بطاقات ملخص النواقص */}
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <div className="pp-panel p-4">
              <span className="text-xs text-muted">إجمالي المنتجات الناقصة</span>
              <p className="mt-1 text-2xl font-bold text-text">{shortages.length}</p>
            </div>
            <div className="pp-panel p-4">
              <span className="text-xs text-muted">منتجات منخفضة المخزون</span>
              <p className="mt-1 text-2xl font-bold" style={{ color: "#D97706" }}>
                {lowCount}
              </p>
            </div>
            <div className="pp-panel p-4">
              <span className="text-xs text-muted">منتجات نافدة (الرصيد 0)</span>
              <p className="mt-1 text-2xl font-bold text-problem">{outCount}</p>
            </div>
            <div className="pp-panel p-4">
              <span className="text-xs text-muted">التكلفة التقديرية لإعادة الطلب</span>
              <p className="mt-1 text-xl font-bold text-primary-deep">{fmtMoney(totalReorderCost)}</p>
            </div>
          </div>

          {/* الفلاتر */}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="relative min-w-0 flex-1">
              <Search size={16} className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-muted" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="ابحث بالاسم أو الكود..."
                aria-label="بحث في نواقص المخزون"
                className="pp-input pp-input--icon"
              />
            </div>
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              aria-label="فلتر التصنيف"
              className="pp-input pp-input--select cursor-pointer sm:w-48"
            >
              <option value="all">كل التصنيفات</option>
              <CategoryOptions categories={categories} />
            </select>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as "ALL" | "LOW_STOCK" | "OUT_OF_STOCK")}
              aria-label="فلتر الحالة"
              className="pp-input pp-input--select cursor-pointer sm:w-44"
            >
              <option value="ALL">كل النواقص ({shortages.length})</option>
              <option value="LOW_STOCK">منخفض فقط ({lowCount})</option>
              <option value="OUT_OF_STOCK">نافد فقط ({outCount})</option>
            </select>
          </div>

          {shortages.length === 0 ? (
            <EmptyState
              icon={<Package size={24} />}
              title="لا توجد نواقص في المخزون حالياً"
              description="جميع المنتجات النشطة أعلى من الحد الأدنى المسموح."
            />
          ) : visible.length === 0 ? (
            <EmptyState icon={<PackageX size={24} />} title="لا توجد نتائج مطابقة" description="جرّب تغيير البحث أو الفلاتر." />
          ) : (
            <div className="pp-panel overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-right text-xs text-muted">
                    <th className="px-3.5 py-3 font-medium">الصورة</th>
                    <th className="px-3.5 py-3 font-medium">المنتج والكود</th>
                    <th className="px-3.5 py-3 font-medium">التصنيف</th>
                    <th className="px-3.5 py-3 font-medium">الكمية الحالية</th>
                    <th className="px-3.5 py-3 font-medium">الحد الأدنى</th>
                    <th className="px-3.5 py-3 font-medium">الحالة</th>
                    <th className="px-3.5 py-3 font-medium">الكمية المقترحة للطلب</th>
                    <th className="px-3.5 py-3 font-medium">تكلفة الطلب التقديرية</th>
                    <th className="px-3.5 py-3 font-medium">الإجراءات</th>
                  </tr>
                </thead>
                <tbody>
                  {visible.map((i) => {
                    const meta = STATUS_META[i.status] ?? STATUS_META.LOW_STOCK;
                    const reorderCost = calcTotalValue(i.suggestedReorderQty, i.unitPrice);
                    return (
                      <tr key={i.id} className="border-b border-border/60 align-middle">
                        <td className="px-3.5 py-3">
                          <button
                            type="button"
                            onClick={() => setDetailsItem(i)}
                            className="flex h-11 w-11 items-center justify-center overflow-hidden rounded-control border border-border bg-background"
                            title="عرض تفاصيل المنتج"
                          >
                            {i.attachments[0] ? (
                              <AttachmentImage attachment={i.attachments[0]} className="h-full w-full object-cover" />
                            ) : (
                              <Package size={20} className="text-muted opacity-50" />
                            )}
                          </button>
                        </td>
                        <td className="px-3.5 py-3">
                          <button
                            type="button"
                            onClick={() => setDetailsItem(i)}
                            className="text-right font-semibold text-text hover:text-primary-deep"
                          >
                            {i.name}
                          </button>
                          <div className="text-xs text-muted" dir="ltr">
                            {i.sku ?? "بدون كود"}
                          </div>
                        </td>
                        <td className="px-3.5 py-3 text-muted">{i.categoryName}</td>
                        <td className="px-3.5 py-3 font-bold text-problem">
                          {fmtQty(i.quantity)} <span className="text-xs font-normal text-muted">{i.unit}</span>
                        </td>
                        <td className="px-3.5 py-3 text-muted">
                          {fmtQty(i.minQuantity)} {i.unit}
                        </td>
                        <td className="px-3.5 py-3">
                          <Badge color={meta.color}>
                            <AlertTriangle size={12} /> {meta.label}
                          </Badge>
                        </td>
                        <td className="px-3.5 py-3 font-bold text-primary-deep">
                          {fmtQty(i.suggestedReorderQty)} <span className="text-xs font-normal text-muted">{i.unit}</span>
                        </td>
                        <td className="px-3.5 py-3 font-semibold text-text">{fmtMoney(reorderCost)}</td>
                        <td className="px-3.5 py-3">
                          <div className="flex items-center gap-1.5">
                            {canManageInventory && (
                              <Button
                                type="button"
                                size="sm"
                                variant="secondary"
                                onClick={() => setMovingItem({ item: i, type: "IN" })}
                                icon={<ArrowDownToLine size={14} />}
                              >
                                إضافة وارد
                              </Button>
                            )}
                            <button
                              type="button"
                              onClick={() => setDetailsItem(i)}
                              title="عرض التفاصيل"
                              className="rounded-full p-1.5 text-muted pp-hover-row"
                            >
                              <Eye size={16} />
                            </button>
                            <button
                              type="button"
                              onClick={() => setHistoryItem(i)}
                              title="سجل الحركات"
                              className="rounded-full p-1.5 text-muted pp-hover-row"
                            >
                              <History size={16} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {detailsItem && (
        <ItemDetailsModal
          open
          onClose={() => setDetailsItem(null)}
          item={live(detailsItem)!}
          canManage={canManageInventory}
          onEdit={(it) => setEditingItem(it)}
          onIn={(it) => setMovingItem({ item: it, type: "IN" })}
          onOut={(it) => setMovingItem({ item: it, type: "OUT" })}
          onStocktake={(it) => setStocktakeItem(it)}
          onReturn={(it) => setReturnItem(it)}
          onHistory={(it) => setHistoryItem(it)}
          onToggleArchive={(it) => void handleToggleArchive(it)}
        />
      )}

      {editingItem && (
        <ItemModal
          key={editingItem.id}
          open
          onClose={() => setEditingItem(null)}
          editing={live(editingItem)}
          categories={categories}
          groups={groups}
          units={units}
          onCreateCategory={handleCreateCategory}
          onSubmit={handleItemSubmit}
        />
      )}

      {movingItem && (
        <MovementModal
          key={`${movingItem.item.id}-${movingItem.type}`}
          open
          onClose={() => setMovingItem(null)}
          item={live(movingItem.item)!}
          initialType={movingItem.type}
          onSubmit={(input) => handleMove(movingItem.item.id, input)}
        />
      )}

      {stocktakeItem && (
        <StocktakeModal
          open
          onClose={() => setStocktakeItem(null)}
          items={items}
          initialItem={live(stocktakeItem)}
          onSubmit={handleMove}
        />
      )}

      {returnItem && (
        <ReturnModal
          open
          onClose={() => setReturnItem(null)}
          items={items}
          initialItem={live(returnItem)}
          onSubmit={handleMove}
        />
      )}

      {historyItem && <MovementsModal open onClose={() => setHistoryItem(null)} item={live(historyItem)!} />}
    </AppLayout>
  );
}
