import { useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, PackageSearch, Plus, Search, Tag, UserCheck, X } from "lucide-react";
import { AppLayout } from "../components/layout/AppLayout";
import { Header } from "../components/header/Header";
import { ProductCard } from "../components/products/ProductCard";
import { ProductModal } from "../components/products/ProductModal";
import { ConfirmDialog } from "../components/ui/ConfirmDialog";
import { EmptyState } from "../components/ui/EmptyState";
import { ErrorState, LoadingState } from "../components/ui/StatusViews";
import { useToast } from "../components/ui/ToastProvider";
import { useAuth } from "../components/auth/AuthProvider";
import { useResource } from "../hooks/useResource";
import { useSafeAction } from "../hooks/useSafeAction";
import { ApiError, errorMessage } from "../lib/api";
import { productsService } from "../services/productsService";
import type { Product, ProductCategory, ProductInput, ProductsData } from "../types";

const EMPTY: ProductsData = { products: [], categories: [] };

interface CategoryFilterProps {
  categories: ProductCategory[];
  counts: Record<string, number>;
  total: number;
  value: string;
  onChange: (id: string) => void;
}

/** فلتر التصنيفات: حقل بحث بقائمة منسدلة (الكل + كل تصنيف بعدد منتجاته). التصنيف الجديد يظهر فيه تلقائياً. */
function CategoryFilter({ categories, counts, total, value, onChange }: CategoryFilterProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const ref = useRef<HTMLDivElement>(null);
  const selected = categories.find((c) => c.id === value);
  const shown = categories.filter((c) => c.name.toLowerCase().includes(query.trim().toLowerCase()));

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const pick = (id: string) => {
    onChange(id);
    setOpen(false);
    setQuery("");
  };

  return (
    <div ref={ref} className="relative min-w-0 flex-1">
      <Search size={16} className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-muted" />
      <input
        value={open ? query : (selected?.name ?? "")}
        onFocus={() => {
          setOpen(true);
          setQuery("");
        }}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="ابحث التصنيف..."
        aria-label="فلتر التصنيف"
        aria-expanded={open}
        className="pp-input pr-10 pl-16"
      />
      <div className="absolute left-2 top-1/2 flex -translate-y-1/2 items-center gap-1">
        {selected && (
          <button type="button" onClick={() => pick("all")} aria-label="إلغاء فلتر التصنيف" className="flex h-6 w-6 items-center justify-center rounded-full text-muted pp-hover-row">
            <X size={14} />
          </button>
        )}
        <ChevronDown size={16} className="pointer-events-none text-muted" />
      </div>

      {open && (
        <div role="listbox" className="pp-menu absolute inset-x-0 top-full z-20 mt-1 max-h-64 overflow-y-auto p-1">
          {query.trim() === "" && (
            <button
              type="button"
              role="option"
              aria-selected={value === "all"}
              onClick={() => pick("all")}
              className={`flex w-full items-center justify-between gap-2 rounded-control px-3 py-2 text-sm ${value === "all" ? "pp-active" : "text-text pp-hover-row"}`}
            >
              <span>الكل</span>
              <span className="pp-price text-xs text-muted">{total}</span>
            </button>
          )}
          {shown.map((c) => (
            <button
              key={c.id}
              type="button"
              role="option"
              aria-selected={value === c.id}
              onClick={() => pick(c.id)}
              className={`flex w-full items-center justify-between gap-2 rounded-control px-3 py-2 text-sm ${value === c.id ? "pp-active" : "text-text pp-hover-row"}`}
            >
              <span className="flex min-w-0 items-center gap-2">
                {value === c.id ? <Check size={14} className="shrink-0" /> : <Tag size={14} className="shrink-0 text-muted" />}
                <span className="truncate">{c.name}</span>
              </span>
              <span className="pp-price text-xs text-muted">{counts[c.id] ?? 0}</span>
            </button>
          ))}
          {shown.length === 0 && <p className="px-3 py-2 text-sm text-muted">{categories.length === 0 ? "لا توجد تصنيفات بعد" : "لا توجد نتائج"}</p>}
        </div>
      )}
    </div>
  );
}

export default function ProductsPage() {
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Product | null>(null);
  const [deleting, setDeleting] = useState<Product | null>(null);
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");
  const { show } = useToast();
  const run = useSafeAction();
  const { user } = useAuth();
  const { data, loading, error, reload, retry } = useResource<ProductsData>(productsService.list, EMPTY);
  const { products, categories } = data;

  // تصنيف محدد حُذف/اختفى: نعود إلى «الكل»
  const activeFilter = filter === "all" || categories.some((c) => c.id === filter) ? filter : "all";

  const counts = useMemo(() => {
    const map: Record<string, number> = {};
    products.forEach((p) => {
      map[p.categoryId] = (map[p.categoryId] ?? 0) + 1;
    });
    return map;
  }, [products]);

  const visible = useMemo(() => {
    const query = search.trim().toLowerCase();
    return products
      .filter((p) => activeFilter === "all" || p.categoryId === activeFilter)
      .filter((p) => !query || `${p.name} ${p.variants.map((v) => v.label).join(" ")}`.toLowerCase().includes(query));
  }, [products, activeFilter, search]);

  const handleCreateCategory = async (name: string): Promise<ProductCategory | null> => {
    try {
      const created = await productsService.createCategory(name);
      await reload(); // يظهر في الفلتر والقائمة فوراً
      show("تمت إضافة التصنيف");
      return created;
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        // موجود مسبقاً (بغض النظر عن حالة الأحرف): نختاره بدل الرفض
        const fresh = await productsService.list().catch(() => null);
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

  const handleSubmit = async (input: ProductInput) => {
    const wasEditing = editing;
    const result = await run(() => (wasEditing ? productsService.update(wasEditing.id, input) : productsService.create(input)));
    await reload();
    if (!result.ok) return false;
    show(wasEditing ? "تم تحديث المنتج" : "تمت إضافة المنتج بنجاح");
    setEditing(null);
    return true;
  };

  const handleAdd = () => {
    setEditing(null);
    setModalOpen(true);
  };

  const handleEdit = (product: Product) => {
    setEditing(product);
    setModalOpen(true);
  };

  const handleConfirmDelete = async () => {
    if (!deleting) return;
    const target = deleting;
    setDeleting(null);
    const result = await run(() => productsService.remove(target.id));
    await reload();
    if (result.ok) show("تم حذف المنتج", "info");
  };

  return (
    <AppLayout
      headerSlot={(openMobileNav) => (
        <Header
          title="أسعار منتجات"
          description="أضف المنتجات وحدد فئاتها وأسعارها"
          onOpenMobileNav={openMobileNav}
          action={
            <div className="pp-tint hidden items-center gap-2 rounded-control px-3 py-2 text-sm sm:flex">
              <UserCheck size={16} className="text-primary-deep" />
              <span className="font-semibold text-text">{user?.name}</span>
            </div>
          }
        />
      )}
    >
      {loading ? (
        <LoadingState label="جارٍ تحميل المنتجات..." />
      ) : error ? (
        <ErrorState message={error} onRetry={() => void retry()} />
      ) : (
        <div className="flex flex-col gap-5">
          <div className="pp-panel flex flex-wrap items-center justify-between gap-4 px-5 py-4">
            <div className="flex items-center gap-3">
              <div className="pp-tint flex h-11 w-11 items-center justify-center rounded-2xl text-primary-deep">
                <Tag size={22} />
              </div>
              <div>
                <h2 className="text-xl font-bold text-text">أسعار منتجات</h2>
                <p className="mt-0.5 text-xs text-muted">أضف المنتجات وحدد فئاتها وأسعارها</p>
              </div>
            </div>
            <button type="button" onClick={handleAdd} className="task-btn task-btn--primary">
              <Plus size={18} /> إضافة منتج
            </button>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row">
            <CategoryFilter categories={categories} counts={counts} total={products.length} value={activeFilter} onChange={setFilter} />
            <div className="relative min-w-0 flex-1">
              <Search size={16} className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-muted" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="ابحث عن منتج..."
                aria-label="بحث عن منتج"
                className="pp-input pr-10"
              />
            </div>
          </div>

          {products.length === 0 ? (
            <EmptyState
              icon={<Tag size={24} />}
              title="لا توجد منتجات بعد"
              description="أضف أول منتج مع تصنيفه وأسعار تكلفته وبيعه."
              action={
                <button type="button" onClick={handleAdd} className="task-btn task-btn--primary">
                  <Plus size={18} /> إضافة منتج
                </button>
              }
            />
          ) : visible.length === 0 ? (
            <EmptyState icon={<PackageSearch size={24} />} title="لا توجد نتائج" description="جرّب تغيير التصنيف أو كلمة البحث." />
          ) : (
            <div className="grid grid-cols-1 items-start gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {visible.map((product) => (
                <ProductCard key={product.id} product={product} onEdit={handleEdit} onDelete={setDeleting} />
              ))}
            </div>
          )}
        </div>
      )}

      {modalOpen && (
        <ProductModal
          key={editing?.id ?? "new"}
          open={modalOpen}
          onClose={() => {
            setModalOpen(false);
            setEditing(null);
          }}
          editing={editing}
          categories={categories}
          onCreateCategory={handleCreateCategory}
          onSubmit={handleSubmit}
        />
      )}

      <ConfirmDialog
        open={!!deleting}
        onClose={() => setDeleting(null)}
        onConfirm={() => void handleConfirmDelete()}
        title="حذف المنتج"
        description={deleting ? `هل أنت متأكد من حذف «${deleting.name}» مع كل أسعاره؟` : undefined}
        confirmLabel="حذف المنتج"
      />
    </AppLayout>
  );
}
