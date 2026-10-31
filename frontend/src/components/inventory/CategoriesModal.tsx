import { useMemo, useState, type FormEvent } from "react";
import { AlertTriangle, Check, FolderTree, Pencil, Plus, Search, Trash2, X } from "lucide-react";
import { Modal } from "../ui/Modal";
import { Button } from "../ui/Button";
import { Badge } from "../ui/Badge";
import { Input } from "../ui/Field";
import { useToast } from "../ui/ToastProvider";
import { errorMessage } from "../../lib/api";
import { inventoryService } from "../../services/inventoryService";
import type { InventoryCategory } from "../../types";

interface CategoriesModalProps {
  open: boolean;
  onClose: () => void;
  categories: InventoryCategory[];
  canManage: boolean;
  onChanged: () => Promise<void>;
}

export function CategoriesModal({ open, onClose, categories, canManage, onChanged }: CategoriesModalProps) {
  const [search, setSearch] = useState("");
  const [newName, setNewName] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [adding, setAdding] = useState(false);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editDesc, setEditDesc] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);

  const [deletingCat, setDeletingCat] = useState<InventoryCategory | null>(null);
  const [reassignId, setReassignId] = useState("");
  const [deleting, setDeleting] = useState(false);

  const { show } = useToast();

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return categories;
    return categories.filter(
      (c) => c.name.toLowerCase().includes(q) || (c.description ?? "").toLowerCase().includes(q)
    );
  }, [categories, search]);

  const otherCategories = useMemo(
    () => (deletingCat ? categories.filter((c) => c.id !== deletingCat.id) : []),
    [categories, deletingCat]
  );

  const handleCreate = async (e: FormEvent) => {
    e.preventDefault();
    const name = newName.trim();
    if (!name || adding) return;
    setAdding(true);
    try {
      await inventoryService.createCategory(name, newDesc.trim());
      setNewName("");
      setNewDesc("");
      await onChanged();
      show("تمت إضافة التصنيف بنجاح");
    } catch (err) {
      show(errorMessage(err), "error");
    } finally {
      setAdding(false);
    }
  };

  const startEdit = (c: InventoryCategory) => {
    setEditingId(c.id);
    setEditName(c.name);
    setEditDesc(c.description ?? "");
  };

  const handleSaveEdit = async (id: string) => {
    const name = editName.trim();
    if (!name || savingEdit) return;
    setSavingEdit(true);
    try {
      await inventoryService.updateCategory(id, { name, description: editDesc.trim() });
      setEditingId(null);
      await onChanged();
      show("تم تحديث التصنيف");
    } catch (err) {
      show(errorMessage(err), "error");
    } finally {
      setSavingEdit(false);
    }
  };

  const openDelete = (c: InventoryCategory) => {
    setDeletingCat(c);
    const others = categories.filter((x) => x.id !== c.id);
    setReassignId(others[0]?.id ?? "");
  };

  const handleConfirmDelete = async () => {
    if (!deletingCat || deleting) return;
    if (deletingCat.itemsCount > 0 && !reassignId) {
      show("يجب اختيار تصنيف بديل لنقل المنتجات المرتبطة أولاً", "error");
      return;
    }
    setDeleting(true);
    try {
      const res = await inventoryService.deleteCategory(
        deletingCat.id,
        deletingCat.itemsCount > 0 ? reassignId : undefined
      );
      setDeletingCat(null);
      await onChanged();
      show(
        res.movedItems > 0
          ? `تم نقل ${res.movedItems} منتج وحذف التصنيف بنجاح`
          : "تم حذف التصنيف",
        "info"
      );
    } catch (err) {
      show(errorMessage(err), "error");
    } finally {
      setDeleting(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="إدارة تصنيفات المخزون"
      description="تصنيفات مستقلة خاصة بمنتجات وخامات المخزون فقط"
      size="lg"
    >
      <div className="flex flex-col gap-4">
        {canManage && (
          <form onSubmit={(e) => void handleCreate(e)} className="rounded-control border border-border bg-background/50 p-3.5">
            <p className="mb-2.5 text-xs font-bold text-text">إضافة تصنيف جديد</p>
            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
              <Input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                maxLength={60}
                placeholder="اسم التصنيف (مثال: ألواح خشب MDF)"
                aria-label="اسم التصنيف الجديد"
              />
              <Input
                value={newDesc}
                onChange={(e) => setNewDesc(e.target.value)}
                maxLength={500}
                placeholder="وصف التصنيف (اختياري)"
                aria-label="وصف التصنيف الجديد"
              />
            </div>
            <div className="mt-2.5 flex justify-end">
              <Button type="submit" size="sm" disabled={!newName.trim() || adding} icon={<Plus size={15} />}>
                {adding ? "جارٍ الإضافة..." : "إضافة تصنيف"}
              </Button>
            </div>
          </form>
        )}

        <div className="relative">
          <Search size={16} className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-muted" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="ابحث عن تصنيف بالاسم أو الوصف..."
            aria-label="بحث في التصنيفات"
            className="pp-input pp-input--icon"
          />
        </div>

        {deletingCat && (
          <div className="rounded-control border border-problem/40 bg-problem/10 p-4">
            <div className="flex items-start gap-2.5">
              <AlertTriangle size={18} className="mt-0.5 shrink-0 text-problem" />
              <div className="flex-1 text-sm">
                <p className="font-bold text-text">تأكيد حذف التصنيف «{deletingCat.name}»</p>
                {deletingCat.itemsCount > 0 ? (
                  <div className="mt-2 flex flex-col gap-2">
                    <p className="text-xs text-muted">
                      يحتوي هذا التصنيف على <strong>{deletingCat.itemsCount}</strong> منتج. لمنع فقدان ارتباط المنتجات، اختر تصنيفاً بديلاً لنقلها إليه قبل الحذف:
                    </p>
                    {otherCategories.length === 0 ? (
                      <p className="text-xs font-semibold text-problem">
                        لا يوجد تصنيف آخر لنقل المنتجات إليه. أضف تصنيفاً جديداً أولاً قبل حذف هذا التصنيف.
                      </p>
                    ) : (
                      <select
                        value={reassignId}
                        onChange={(e) => setReassignId(e.target.value)}
                        className="pp-input pp-input--select"
                        aria-label="التصنيف البديل لنقل المنتجات"
                      >
                        {otherCategories.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name} ({c.itemsCount} منتج)
                          </option>
                        ))}
                      </select>
                    )}
                  </div>
                ) : (
                  <p className="mt-1 text-xs text-muted">هذا التصنيف فارغ ولا يحتوي على أي منتجات. هل تريد حذفه؟</p>
                )}
                <div className="mt-3 flex justify-end gap-2">
                  <Button type="button" size="sm" variant="secondary" onClick={() => setDeletingCat(null)}>
                    إلغاء
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="danger"
                    disabled={deleting || (deletingCat.itemsCount > 0 && !reassignId)}
                    onClick={() => void handleConfirmDelete()}
                  >
                    {deleting ? "جارٍ الحذف..." : deletingCat.itemsCount > 0 ? "نقل المنتجات وحذف التصنيف" : "تأكيد الحذف"}
                  </Button>
                </div>
              </div>
            </div>
          </div>
        )}

        {filtered.length === 0 ? (
          <div className="py-8 text-center text-sm text-muted">
            <FolderTree size={28} className="mx-auto mb-2 opacity-50" />
            {categories.length === 0 ? "لا توجد تصنيفات بعد. أضف أول تصنيف للمخزون." : "لا توجد تصنيفات مطابقة للبحث."}
          </div>
        ) : (
          <div className="max-h-[22rem] overflow-y-auto rounded-control border border-border">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-background/60 text-right text-xs text-muted">
                  <th className="px-3 py-2.5 font-medium">التصنيف</th>
                  <th className="px-3 py-2.5 font-medium">الوصف</th>
                  <th className="px-3 py-2.5 font-medium">عدد المنتجات</th>
                  {canManage && <th className="px-3 py-2.5 font-medium">إجراءات</th>}
                </tr>
              </thead>
              <tbody>
                {filtered.map((c) => {
                  const isEditing = editingId === c.id;
                  return (
                    <tr key={c.id} className="border-b border-border/60 align-middle">
                      <td className="px-3 py-2.5">
                        {isEditing ? (
                          <Input
                            value={editName}
                            onChange={(e) => setEditName(e.target.value)}
                            maxLength={60}
                            aria-label="تعديل اسم التصنيف"
                          />
                        ) : (
                          <span className="font-semibold text-text">{c.name}</span>
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-muted">
                        {isEditing ? (
                          <Input
                            value={editDesc}
                            onChange={(e) => setEditDesc(e.target.value)}
                            maxLength={500}
                            placeholder="وصف التصنيف"
                            aria-label="تعديل وصف التصنيف"
                          />
                        ) : (
                          c.description || "—"
                        )}
                      </td>
                      <td className="px-3 py-2.5">
                        <Badge color={c.itemsCount > 0 ? "#148D72" : "#78847F"}>{c.itemsCount} منتج</Badge>
                      </td>
                      {canManage && (
                        <td className="px-3 py-2.5">
                          {isEditing ? (
                            <div className="flex items-center gap-1">
                              <button
                                type="button"
                                onClick={() => void handleSaveEdit(c.id)}
                                disabled={!editName.trim() || savingEdit}
                                title="حفظ التعديل"
                                className="rounded-full p-1.5 text-primary-deep pp-hover-row"
                              >
                                <Check size={16} />
                              </button>
                              <button
                                type="button"
                                onClick={() => setEditingId(null)}
                                title="إلغاء"
                                className="rounded-full p-1.5 text-muted pp-hover-row"
                              >
                                <X size={16} />
                              </button>
                            </div>
                          ) : (
                            <div className="flex items-center gap-1">
                              <button
                                type="button"
                                onClick={() => startEdit(c)}
                                title="تعديل التصنيف"
                                aria-label={`تعديل ${c.name}`}
                                className="rounded-full p-1.5 text-muted pp-hover-row"
                              >
                                <Pencil size={15} />
                              </button>
                              <button
                                type="button"
                                onClick={() => openDelete(c)}
                                title="حذف التصنيف"
                                aria-label={`حذف ${c.name}`}
                                className="rounded-full p-1.5 text-problem pp-hover-row"
                              >
                                <Trash2 size={15} />
                              </button>
                            </div>
                          )}
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        <div className="flex justify-end">
          <Button type="button" variant="secondary" onClick={onClose}>
            إغلاق
          </Button>
        </div>
      </div>
    </Modal>
  );
}
