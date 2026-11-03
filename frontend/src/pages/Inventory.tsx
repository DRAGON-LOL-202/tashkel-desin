import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  Activity,
  AlertTriangle,
  Archive,
  ArchiveRestore,
  ArrowDownToLine,
  ArrowUpDown,
  ArrowUpFromLine,
  Boxes,
  CheckCircle2,
  ClipboardCheck,
  Coins,
  Eye,
  FileSpreadsheet,
  FolderTree,
  History,
  Package,
  PackageX,
  Pencil,
  Plus,
  RotateCcw,
  Search,
  Trash2,
  Warehouse,
} from "lucide-react";
import { AppLayout } from "../components/layout/AppLayout";
import { Header } from "../components/header/Header";
import { CategoriesModal } from "../components/inventory/CategoriesModal";
import { CategoryOptions } from "../components/inventory/CategoryOptions";
import { ItemDetailsModal } from "../components/inventory/ItemDetailsModal";
import { ItemModal } from "../components/inventory/ItemModal";
import { MovementModal } from "../components/inventory/MovementModal";
import { MovementsModal } from "../components/inventory/MovementsModal";
import { ReportsModal } from "../components/inventory/ReportsModal";
import { ReturnModal } from "../components/inventory/ReturnModal";
import { StocktakeModal } from "../components/inventory/StocktakeModal";
import { STATUS_META, calcTotalValue, fmtMoney, fmtQty } from "../components/inventory/format";
import { Badge } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import { AttachmentImage } from "../components/ui/ImageAttachments";
import { ConfirmDialog } from "../components/ui/ConfirmDialog";
import { EmptyState } from "../components/ui/EmptyState";
import { ErrorState, LoadingState } from "../components/ui/StatusViews";
import { useToast } from "../components/ui/ToastProvider";
import { useAuth } from "../components/auth/AuthProvider";
import { usePermissions } from "../hooks/usePermissions";
import { useResource } from "../hooks/useResource";
import { useSafeAction } from "../hooks/useSafeAction";
import { ApiError, errorMessage } from "../lib/api";
import { EMPTY_INVENTORY_DATA, inventoryService } from "../services/inventoryService";
import type {
  InventoryCategory,
  InventoryData,
  InventoryItem,
  InventoryItemInput,
  InventoryMovementInput,
  InventoryMovementType,
} from "../types";

type StatusFilter = "ALL" | "AVAILABLE" | "LOW_STOCK" | "OUT_OF_STOCK" | "SHORTAGE";
type SortField = "name" | "quantity" | "value";

export default function InventoryPage() {
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("ALL");
  const [sortBy, setSortBy] = useState<SortField>("name");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [showInactive, setShowInactive] = useState(false);

  const [itemModal, setItemModal] = useState<{ editing: InventoryItem | null } | null>(null);
  const [detailsItem, setDetailsItem] = useState<InventoryItem | null>(null);
  const [moving, setMoving] = useState<{ item: InventoryItem; type: InventoryMovementType } | null>(null);
  const [stocktakeModal, setStocktakeModal] = useState<{ open: boolean; item: InventoryItem | null }>({ open: false, item: null });
  const [returnModal, setReturnModal] = useState<{ open: boolean; item: InventoryItem | null }>({ open: false, item: null });
  const [categoriesOpen, setCategoriesOpen] = useState(false);
  const [reportsOpen, setReportsOpen] = useState(false);
  const [history, setHistory] = useState<InventoryItem | null>(null);
  const [archiving, setArchiving] = useState<InventoryItem | null>(null);
  const [deleting, setDeleting] = useState<InventoryItem | null>(null);

  const { show } = useToast();
  const run = useSafeAction();
  const { user } = useAuth();
  const { canManageInventory, canDeleteInventory, canAddStock, hideInventoryPrices } = usePermissions();
  const loadInventory = useMemo(() => () => inventoryService.list({ includeGroups: canManageInventory }), [canManageInventory]);
  const { data, loading, error, reload, retry } = useResource<InventoryData>(loadInventory, EMPTY_INVENTORY_DATA);
  const { items, categories, groups, stats, units } = data;

  const activeCategory = categoryFilter === "all" || categories.some((c) => c.id === categoryFilter) ? categoryFilter : "all";

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    const dir = sortDir === "desc" ? -1 : 1;
    const list = items
      .filter((i) => showInactive || i.isActive)
      .filter((i) => activeCategory === "all" || i.categoryId === activeCategory)
      .filter((i) => {
        if (statusFilter === "ALL") return true;
        if (statusFilter === "SHORTAGE") return i.isShortage || i.quantity <= i.minQuantity || i.quantity === 0;
        return i.status === statusFilter;
      })
      .filter((i) => !q || `${i.name} ${i.sku ?? ""}`.toLowerCase().includes(q));

    return [...list].sort((a, b) => {
      if (sortBy === "quantity") {
        return (a.quantity - b.quantity) * dir || a.name.localeCompare(b.name, "ar");
      }
      if (sortBy === "value") {
        const va = a.totalValue ?? calcTotalValue(a.quantity, a.unitPrice);
        const vb = b.totalValue ?? calcTotalValue(b.quantity, b.unitPrice);
        return (va - vb) * dir || a.name.localeCompare(b.name, "ar");
      }
      return a.name.localeCompare(b.name, "ar") * dir;
    });
  }, [items, search, showInactive, activeCategory, statusFilter, sortBy, sortDir]);

  const live = (i: InventoryItem | null) => (i ? (items.find((x) => x.id === i.id) ?? i) : null);

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
          if (existing) {
            show("هذا التصنيف موجود، تم اختياره", "info");
            return existing;
          }
        }
      }
      show(errorMessage(err), "error");
      return null;
    }
  };

  const handleItemSubmit = async (input: InventoryItemInput) => {
    const editing = itemModal?.editing ?? null;
    const result = await run(() => (editing ? inventoryService.update(editing.id, input) : inventoryService.create(input)));
    await reload();
    if (!result.ok) return false;
    show(editing ? "تم تحديث المنتج بنجاح" : "تمت إضافة المنتج إلى المخزون");
    return true;
  };

  const handleMove = async (itemId: string, input: InventoryMovementInput) => {
    const result = await run(() => inventoryService.move(itemId, input));
    await reload();
    if (!result.ok) return false;
    const msg =
      input.type === "IN"
        ? "تمت إضافة الوارد وتحديث الرصيد"
        : input.type === "OUT"
          ? "تم تسجيل السحب وتحديث الرصيد"
          : input.type === "RETURN"
            ? "تم تسجيل المرتجع وإضافته للمخزون"
            : "تم تأكيد الجرد وتسوية الرصيد";
    show(msg);
    return true;
  };

  const handleConfirmArchive = async () => {
    if (!archiving) return;
    const target = archiving;
    setArchiving(null);
    const result = await run(() => inventoryService.update(target.id, { isActive: !target.isActive }));
    await reload();
    if (result.ok) {
      show(target.isActive ? "تمت أرشفة المنتج" : "تمت استعادة المنتج إلى المخزون النشط", "info");
    }
  };

  const handleDelete = async () => {
    if (!deleting) return;
    const target = deleting;
    setDeleting(null);
    const result = await run(() => inventoryService.remove(target.id));
    await reload();
    if (result.ok) show("تم حذف المنتج نهائياً", "info");
  };

  return (
    <AppLayout
      headerSlot={(openMobileNav) => (
        <Header
          title="لوحة إدارة المخزون"
          description="نظام مخزون مستقل للأرصدة والتصنيفات والأسعار والجرد والمرتجعات"
          onOpenMobileNav={openMobileNav}
          action={<span className="hidden text-sm font-semibold text-text sm:inline">{user?.name}</span>}
        />
      )}
    >
      {loading ? (
        <LoadingState label="جارٍ تحميل بيانات المخزون..." />
      ) : error ? (
        <ErrorState message={error} onRetry={() => void retry()} />
      ) : (
        <div className="flex flex-col gap-5">
          {/* الشريط العلوي وأزرار العمليات */}
          <div className="pp-panel flex flex-wrap items-center justify-between gap-4 px-5 py-4">
            <div className="flex items-center gap-3">
              <div className="pp-tint flex h-11 w-11 items-center justify-center rounded-2xl text-primary-deep">
                <Warehouse size={22} />
              </div>
              <div>
                <h2 className="text-xl font-bold text-text">المخزون الرئيسي</h2>
                <p className="mt-0.5 text-xs text-muted">
                  {stats.totalItems} منتج نشط
                  {!hideInventoryPrices ? ` · إجمالي القيمة ${fmtMoney(stats.totalValue)}` : ""}
                  {stats.shortageCount > 0 ? ` · ${stats.shortageCount} منتج يحتاج إعادة طلب` : ""}
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {!hideInventoryPrices && (
                <>
                  <Link
                    to="/inventory/shortages"
                    className="task-btn task-btn--ghost relative text-xs sm:text-sm"
                    title="عرض صفحة نواقص المخزون"
                  >
                    <AlertTriangle size={16} className={stats.shortageCount > 0 ? "text-problem" : "text-muted"} />
                    <span>نواقص المخزون</span>
                    {stats.shortageCount > 0 && (
                      <span className="rounded-full bg-problem px-1.5 py-0.5 text-[11px] font-bold leading-none text-white">
                        {stats.shortageCount}
                      </span>
                    )}
                  </Link>

                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={() => setCategoriesOpen(true)}
                    icon={<FolderTree size={15} />}
                  >
                    التصنيفات ({categories.length})
                  </Button>
                </>
              )}

              {canManageInventory && (
                <>
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={() => setStocktakeModal({ open: true, item: null })}
                    icon={<ClipboardCheck size={15} />}
                  >
                    جرد
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={() => setReturnModal({ open: true, item: null })}
                    icon={<RotateCcw size={15} />}
                  >
                    مرتجع
                  </Button>
                </>
              )}

              {!hideInventoryPrices && (
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => setReportsOpen(true)}
                  icon={<FileSpreadsheet size={15} />}
                >
                  تصدير Excel
                </Button>
              )}

              {canAddStock && (
                <button
                  type="button"
                  onClick={() => setItemModal({ editing: null })}
                  className="task-btn task-btn--primary text-xs sm:text-sm"
                >
                  <Plus size={17} /> إضافة منتج
                </button>
              )}
            </div>
          </div>

          {/* بطاقات الإحصائيات المحسوبة من قاعدة البيانات */}
          <div className={`grid grid-cols-2 gap-3 sm:grid-cols-3 ${hideInventoryPrices ? "lg:grid-cols-6" : "lg:grid-cols-7"}`}>
            <div className="pp-panel flex flex-col justify-between p-3.5">
              <div className="flex items-center justify-between text-xs text-muted">
                <span>إجمالي المنتجات</span>
                <Package size={15} className="text-primary-deep" />
              </div>
              <p className="mt-2 text-xl font-bold text-text">{stats.totalItems}</p>
            </div>

            <div className="pp-panel flex flex-col justify-between p-3.5">
              <div className="flex items-center justify-between text-xs text-muted">
                <span>إجمالي الكميات</span>
                <Boxes size={15} className="text-primary-deep" />
              </div>
              <p className="mt-2 text-xl font-bold text-text">{fmtQty(stats.totalQuantity)}</p>
            </div>

            {!hideInventoryPrices && (
              <div className="pp-panel flex flex-col justify-between p-3.5">
                <div className="flex items-center justify-between text-xs text-muted">
                  <span>قيمة المخزون</span>
                  <Coins size={15} className="text-primary-deep" />
                </div>
                <p className="mt-2 text-lg font-bold text-primary-deep">{fmtMoney(stats.totalValue)}</p>
              </div>
            )}

            <div className="pp-panel flex flex-col justify-between p-3.5">
              <div className="flex items-center justify-between text-xs text-muted">
                <span>المنتجات المتوفرة</span>
                <CheckCircle2 size={15} style={{ color: "#1E8E5A" }} />
              </div>
              <p className="mt-2 text-xl font-bold" style={{ color: "#1E8E5A" }}>
                {stats.availableCount}
              </p>
            </div>

            <div className="pp-panel flex flex-col justify-between p-3.5">
              <div className="flex items-center justify-between text-xs text-muted">
                <span>منخفضة المخزون</span>
                <AlertTriangle size={15} style={{ color: "#D97706" }} />
              </div>
              <p className="mt-2 text-xl font-bold" style={{ color: "#D97706" }}>
                {stats.lowStockCount}
              </p>
            </div>

            <div className="pp-panel flex flex-col justify-between p-3.5">
              <div className="flex items-center justify-between text-xs text-muted">
                <span>المنتجات النافدة</span>
                <PackageX size={15} className="text-problem" />
              </div>
              <p className="mt-2 text-xl font-bold text-problem">{stats.outOfStockCount}</p>
            </div>

            <div className="pp-panel flex flex-col justify-between p-3.5 col-span-2 sm:col-span-1">
              <div className="flex items-center justify-between text-xs text-muted">
                <span>حركات اليوم</span>
                <Activity size={15} className="text-primary-deep" />
              </div>
              <p className="mt-2 text-xl font-bold text-text">{stats.todayMovementsCount}</p>
            </div>
          </div>

          {/* شريط البحث والتصفية والترتيب */}
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative min-w-[220px] flex-1">
              <Search size={16} className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-muted" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="ابحث بالاسم أو الكود..."
                aria-label="بحث في المخزون"
                className="pp-input pp-input--icon"
              />
            </div>

            <select
              value={activeCategory}
              onChange={(e) => setCategoryFilter(e.target.value)}
              aria-label="فلتر التصنيف"
              className="pp-input pp-input--select cursor-pointer sm:w-44"
            >
              <option value="all">كل التصنيفات</option>
              <CategoryOptions categories={categories} />
            </select>

            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
              aria-label="تصفية حسب حالة المخزون"
              className="pp-input pp-input--select cursor-pointer sm:w-44"
            >
              <option value="ALL">كل الحالات</option>
              <option value="AVAILABLE">متوفر ({stats.availableCount})</option>
              <option value="LOW_STOCK">منخفض ({stats.lowStockCount})</option>
              <option value="OUT_OF_STOCK">نافد ({stats.outOfStockCount})</option>
              <option value="SHORTAGE">كل النواقص ({stats.shortageCount})</option>
            </select>

            <div className="flex items-center gap-1.5">
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as SortField)}
                aria-label="ترتيب حسب"
                className="pp-input pp-input--select cursor-pointer sm:w-40"
              >
                <option value="name">الترتيب: الاسم</option>
                <option value="quantity">الترتيب: الكمية</option>
                {!hideInventoryPrices && <option value="value">الترتيب: القيمة</option>}
              </select>
              <button
                type="button"
                onClick={() => setSortDir((d) => (d === "asc" ? "desc" : "asc"))}
                title={sortDir === "asc" ? "تصاعدي (اضغط للتنازلي)" : "تنازلي (اضغط للتصاعدي)"}
                aria-label="عكس اتجاه الترتيب"
                className="task-icon-btn !h-10 !w-10 shrink-0"
              >
                <ArrowUpDown size={16} />
              </button>
            </div>

            {canManageInventory && (
              <label className="flex cursor-pointer items-center gap-2 text-xs font-medium text-text sm:text-sm">
                <input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} />
                عرض المؤرشف
              </label>
            )}
          </div>

          {/* جدول المنتجات */}
          {items.length === 0 ? (
            <EmptyState
              icon={<Warehouse size={24} />}
              title="لا توجد منتجات في المخزون"
              description={canAddStock ? "أضف أول منتج مع تصنيفه وسعره ورصيده الافتتاحي." : "لم تُضف أي منتجات بعد."}
              action={
                canAddStock ? (
                  <button type="button" onClick={() => setItemModal({ editing: null })} className="task-btn task-btn--primary">
                    <Plus size={18} /> إضافة منتج
                  </button>
                ) : undefined
              }
            />
          ) : visible.length === 0 ? (
            <EmptyState icon={<Search size={24} />} title="لا توجد نتائج مطابقة" description="جرّب تغيير البحث أو الفلاتر." />
          ) : (
            <div className="pp-panel overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-right text-xs text-muted">
                    <th className="px-3 py-3 font-medium">الصورة</th>
                    <th className="px-3 py-3 font-medium">اسم المنتج</th>
                    <th className="px-3 py-3 font-medium">الكود</th>
                    <th className="px-3 py-3 font-medium">التصنيف</th>
                    <th className="px-3 py-3 font-medium">الكمية الحالية</th>
                    <th className="px-3 py-3 font-medium">الوحدة</th>
                    {!hideInventoryPrices && (
                      <>
                        <th className="px-3 py-3 font-medium">سعر الوحدة</th>
                        <th className="px-3 py-3 font-medium">سعر البيع</th>
                        <th className="px-3 py-3 font-medium">إجمالي القيمة</th>
                      </>
                    )}
                    <th className="px-3 py-3 font-medium">الحد الأدنى</th>
                    <th className="px-3 py-3 font-medium">حالة المخزون</th>
                    <th className="px-3 py-3 font-medium">الإجراءات</th>
                  </tr>
                </thead>
                <tbody>
                  {visible.map((i) => {
                    const statusMeta = STATUS_META[i.status] ?? STATUS_META.AVAILABLE;
                    const itemTotalValue = i.totalValue ?? calcTotalValue(i.quantity, i.unitPrice);
                    return (
                      <tr key={i.id} className={`border-b border-border/60 align-middle ${i.isActive ? "" : "opacity-60"}`}>
                        <td className="px-3 py-2.5">
                          <button
                            type="button"
                            onClick={() => setDetailsItem(i)}
                            className="flex h-11 w-11 items-center justify-center overflow-hidden rounded-control border border-border bg-background transition-transform hover:scale-105"
                            title="عرض تفاصيل وصور المنتج"
                          >
                            {i.attachments[0] ? (
                              <AttachmentImage attachment={i.attachments[0]} className="h-full w-full object-cover" />
                            ) : (
                              <Package size={20} className="text-muted opacity-50" />
                            )}
                          </button>
                        </td>

                        <td className="px-3 py-2.5">
                          <button
                            type="button"
                            onClick={() => setDetailsItem(i)}
                            className="text-right font-semibold text-text hover:text-primary-deep"
                          >
                            {i.name}
                          </button>
                          {i.notes && <p className="max-w-[180px] truncate text-[11px] text-muted">{i.notes}</p>}
                        </td>

                        <td className="px-3 py-2.5 text-xs text-muted" dir="ltr">
                          {i.sku || "—"}
                        </td>

                        <td className="px-3 py-2.5 text-muted">{i.categoryName}</td>

                        <td className="px-3 py-2.5 font-bold text-text">{fmtQty(i.quantity)}</td>

                        <td className="px-3 py-2.5 text-xs text-muted">{i.unit}</td>

                        {!hideInventoryPrices && (
                          <>
                            <td className="px-3 py-2.5 text-text">{fmtMoney(i.unitPrice ?? 0)}</td>

                            <td className="px-3 py-2.5 text-text">{fmtMoney(i.sellPrice ?? 0)}</td>

                            <td className="px-3 py-2.5 font-bold text-primary-deep">{fmtMoney(itemTotalValue)}</td>
                          </>
                        )}

                        <td className="px-3 py-2.5 text-muted">{i.minQuantity > 0 ? fmtQty(i.minQuantity) : "0"}</td>

                        <td className="px-3 py-2.5">
                          {!i.isActive ? (
                            <Badge>مؤرشف</Badge>
                          ) : (
                            <Badge color={statusMeta.color}>
                              {i.status !== "AVAILABLE" && <AlertTriangle size={12} />} {statusMeta.label}
                            </Badge>
                          )}
                        </td>

                        <td className="px-3 py-2.5">
                          <div className="flex items-center gap-0.5">
                            <button
                              type="button"
                              onClick={() => setDetailsItem(i)}
                              aria-label={`تفاصيل ${i.name}`}
                              title="عرض التفاصيل"
                              className="rounded-full p-1.5 text-muted pp-hover-row"
                            >
                              <Eye size={15} />
                            </button>

                            <button
                              type="button"
                              onClick={() => setHistory(i)}
                              aria-label={`سجل حركات ${i.name}`}
                              title="سجل الحركات"
                              className="rounded-full p-1.5 text-muted pp-hover-row"
                            >
                              <History size={15} />
                            </button>

                            {canAddStock && (
                              <button
                                type="button"
                                onClick={() => setMoving({ item: i, type: "IN" })}
                                disabled={!i.isActive}
                                aria-label={`إضافة وارد لـ ${i.name}`}
                                title="إضافة وارد"
                                className="rounded-full p-1.5 text-primary-deep pp-hover-row disabled:opacity-40"
                              >
                                <ArrowDownToLine size={15} />
                              </button>
                            )}

                            {canManageInventory && (
                              <>
                                <button
                                  type="button"
                                  onClick={() => setMoving({ item: i, type: "OUT" })}
                                  disabled={!i.isActive || i.quantity <= 0}
                                  aria-label={`سحب من ${i.name}`}
                                  title="سحب"
                                  className="rounded-full p-1.5 text-problem pp-hover-row disabled:opacity-40"
                                >
                                  <ArrowUpFromLine size={15} />
                                </button>

                                <button
                                  type="button"
                                  onClick={() => setStocktakeModal({ open: true, item: i })}
                                  disabled={!i.isActive}
                                  aria-label={`جرد ${i.name}`}
                                  title="جرد وتسوية"
                                  className="rounded-full p-1.5 text-muted pp-hover-row disabled:opacity-40"
                                >
                                  <ClipboardCheck size={15} />
                                </button>

                                <button
                                  type="button"
                                  onClick={() => setItemModal({ editing: i })}
                                  aria-label={`تعديل ${i.name}`}
                                  title="تعديل"
                                  className="rounded-full p-1.5 text-muted pp-hover-row"
                                >
                                  <Pencil size={15} />
                                </button>

                                <button
                                  type="button"
                                  onClick={() => setArchiving(i)}
                                  aria-label={i.isActive ? `أرشفة ${i.name}` : `استعادة ${i.name}`}
                                  title={i.isActive ? "أرشفة المنتج" : "استعادة المنتج"}
                                  className="rounded-full p-1.5 text-muted pp-hover-row"
                                >
                                  {i.isActive ? <Archive size={15} /> : <ArchiveRestore size={15} />}
                                </button>
                              </>
                            )}

                            {canDeleteInventory && (
                              <button
                                type="button"
                                onClick={() => setDeleting(i)}
                                aria-label={`حذف ${i.name}`}
                                title="حذف نهائي"
                                className="rounded-full p-1.5 text-problem pp-hover-row"
                              >
                                <Trash2 size={15} />
                              </button>
                            )}
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

      {itemModal && (
        <ItemModal
          key={itemModal.editing?.id ?? "new"}
          open
          onClose={() => setItemModal(null)}
          editing={live(itemModal.editing)}
          categories={categories}
          groups={groups}
          units={units}
          canCreateCategory={canManageInventory}
          hidePricePreview={hideInventoryPrices}
          onCreateCategory={handleCreateCategory}
          onSubmit={handleItemSubmit}
        />
      )}

      {detailsItem && (
        <ItemDetailsModal
          open
          onClose={() => setDetailsItem(null)}
          item={live(detailsItem)!}
          canManage={canManageInventory}
          canAddStock={canAddStock}
          hidePrices={hideInventoryPrices}
          onEdit={(it) => setItemModal({ editing: it })}
          onIn={(it) => setMoving({ item: it, type: "IN" })}
          onOut={(it) => setMoving({ item: it, type: "OUT" })}
          onStocktake={(it) => setStocktakeModal({ open: true, item: it })}
          onReturn={(it) => setReturnModal({ open: true, item: it })}
          onHistory={(it) => setHistory(it)}
          onToggleArchive={(it) => setArchiving(it)}
        />
      )}

      {moving && (
        <MovementModal
          key={`${moving.item.id}-${moving.type}`}
          open
          onClose={() => setMoving(null)}
          item={live(moving.item)!}
          initialType={moving.type}
          inOnly={!canManageInventory}
          hidePrices={hideInventoryPrices}
          onSubmit={(input) => handleMove(moving.item.id, input)}
        />
      )}

      {stocktakeModal.open && (
        <StocktakeModal
          open
          onClose={() => setStocktakeModal({ open: false, item: null })}
          items={items}
          initialItem={live(stocktakeModal.item)}
          onSubmit={handleMove}
        />
      )}

      {returnModal.open && (
        <ReturnModal
          open
          onClose={() => setReturnModal({ open: false, item: null })}
          items={items}
          initialItem={live(returnModal.item)}
          onSubmit={handleMove}
        />
      )}

      {categoriesOpen && (
        <CategoriesModal
          open
          onClose={() => setCategoriesOpen(false)}
          categories={categories}
          groups={groups}
          canManage={canManageInventory}
          onChanged={reload}
        />
      )}

      {reportsOpen && (
        <ReportsModal
          open
          onClose={() => setReportsOpen(false)}
          items={items}
          categories={categories}
        />
      )}

      {history && <MovementsModal open onClose={() => setHistory(null)} item={live(history)!} hidePrices={hideInventoryPrices} />}

      <ConfirmDialog
        open={!!archiving}
        onClose={() => setArchiving(null)}
        onConfirm={() => void handleConfirmArchive()}
        title={archiving?.isActive ? "أرشفة المنتج" : "استعادة المنتج"}
        description={
          archiving
            ? archiving.isActive
              ? `سيتم أرشفة «${archiving.name}» وإخفاؤه من القوائم النشطة مع الحفاظ الكامل على سجل حركاته.`
              : `سيتم استعادة «${archiving.name}» ليظهر ضمن منتجات المخزون النشطة.`
            : undefined
        }
        confirmLabel={archiving?.isActive ? "تأكيد الأرشفة" : "استعادة"}
      />

      <ConfirmDialog
        open={!!deleting}
        onClose={() => setDeleting(null)}
        onConfirm={() => void handleDelete()}
        title="حذف عنصر المخزون نهائياً"
        description={deleting ? `سيُحذف «${deleting.name}» مع كل سجل حركاته نهائياً. يُفضّل استخدام الأرشفة بدلاً من الحذف.` : undefined}
        confirmLabel="حذف نهائي"
      />
    </AppLayout>
  );
}
