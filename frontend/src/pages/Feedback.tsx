import { useMemo, useState } from "react";
import { Plus, MessageSquare, Search, Trash2 } from "lucide-react";
import { AppLayout } from "../components/layout/AppLayout";
import { Header } from "../components/header/Header";
import { Button } from "../components/ui/Button";
import { EmptyState } from "../components/ui/EmptyState";
import { Tabs } from "../components/ui/Tabs";
import { FeedbackStats } from "../components/feedback/FeedbackStats";
import { FeedbackCard } from "../components/feedback/FeedbackCard";
import { FeedbackModal } from "../components/feedback/FeedbackModal";
import { FeedbackCalendar } from "../components/feedback/FeedbackCalendar";
import { BulkDeleteModal } from "../components/feedback/BulkDeleteModal";
import { ConfirmDialog } from "../components/ui/ConfirmDialog";
import { feedbackService } from "../services/feedbackService";
import type { CreateFeedbackInput, Feedback as FeedbackItem, FeedbackType } from "../types";
import { useToast } from "../components/ui/ToastProvider";
import { ErrorState, LoadingState } from "../components/ui/StatusViews";
import { useResource } from "../hooks/useResource";
import { useSafeAction } from "../hooks/useSafeAction";
import { usePermissions } from "../hooks/usePermissions";

type FilterValue = "all" | FeedbackType;
export default function FeedbackPage() {
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<FeedbackItem | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [filter, setFilter] = useState<FilterValue>("all");
  const [search, setSearch] = useState("");
  const [view, setView] = useState<"list" | "calendar">("list");
  const { show } = useToast();
  const run = useSafeAction();
  const { isStaff } = usePermissions();
  const { data: items, loading, error, reload, retry } = useResource<FeedbackItem[]>(feedbackService.list, []);

  const stats = useMemo(
    () => ({
      total: items.length,
      problems: items.filter((i) => i.type === "problem").length,
      operational: items.filter((i) => i.type === "operational").length,
      ideas: items.filter((i) => i.type === "idea").length,
    }),
    [items]
  );

  const filtered = useMemo(
    () =>
      items
        .filter((i) => filter === "all" || i.type === filter)
        .filter((i) => i.title.toLowerCase().includes(search.toLowerCase()))
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
    [items, filter, search]
  );

  const handleSubmit = async (input: CreateFeedbackInput) => {
    const wasEditing = editing;
    const result = await run(() => (wasEditing ? feedbackService.update(wasEditing.id, input) : feedbackService.create(input)));
    await reload();
    if (!result.ok) return false;
    show(wasEditing ? "تم تحديث الملاحظة" : "تمت إضافة الملاحظة بنجاح");
    setEditing(null);
    return true;
  };

  const handleEdit = (item: FeedbackItem) => {
    setEditing(item);
    setModalOpen(true);
  };

  const handleToggleStatus = async (id: string) => {
    const item = items.find((candidate) => candidate.id === id);
    if (!item) return;
    await run(() => feedbackService.toggleStatus(item));
    await reload();
  };

  const handleBulkDelete = async (options: { type?: FeedbackType; fromDate?: string; toDate?: string }) => {
    const result = await run(() => feedbackService.removeMany(options));
    await reload();
    setBulkDeleteOpen(false);
    if (result.ok) show(`تم حذف ${result.value} من الملاحظات`, "info");
  };

  const handleConfirmDelete = async () => {
    if (!deleteId) return;
    const id = deleteId;
    setDeleteId(null);
    const result = await run(() => feedbackService.remove(id));
    await reload();
    if (result.ok) show("تم حذف الملاحظة", "info");
  };

  return (
    <AppLayout
      headerSlot={(openMobileNav) => (
        <Header
          title="Feedback"
          description="سجل المشاكل، مشاكل التشغيل، والأفكار"
          onOpenMobileNav={openMobileNav}
          action={
            <Button
              icon={<Plus size={16} />}
              onClick={() => {
                setEditing(null);
                setModalOpen(true);
              }}
            >
              + Feedback
            </Button>
          }
        />
      )}
    >
      {loading ? (
        <LoadingState label="جارٍ تحميل الملاحظات..." />
      ) : error ? (
        <ErrorState message={error} onRetry={() => void retry()} />
      ) : (
      <div className="flex flex-col gap-6">
        <FeedbackStats {...stats} />

        <div className="flex flex-col sm:flex-row sm:items-center gap-3 justify-between">
          <Tabs
            options={[
              { value: "all", label: "الكل" },
              { value: "problem", label: "مشكلة" },
              { value: "operational", label: "مشكلة تشغيل" },
              { value: "idea", label: "فكرة" },
            ]}
            value={filter}
            onChange={(v) => setFilter(v as FilterValue)}
          />
          <div className="flex items-center gap-2">
            {isStaff && (
              <Button
                size="sm"
                variant="danger"
                icon={<Trash2 size={14} />}
                className="h-10 px-3.5"
                onClick={() => setBulkDeleteOpen(true)}
              >
                حذف
              </Button>
            )}
            <div className="relative w-full sm:w-56">
              <Search size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="بحث..."
                className="w-full rounded-control border border-border bg-surface pr-9 pl-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
              />
            </div>
            <Tabs
              options={[
                { value: "list", label: "قائمة" },
                { value: "calendar", label: "تقويم" },
              ]}
              value={view}
              onChange={(v) => setView(v as "list" | "calendar")}
            />
          </div>
        </div>

        {view === "calendar" ? (
          <FeedbackCalendar items={filtered} onSelectItem={isStaff ? handleEdit : () => {}} />
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={<MessageSquare size={22} />}
            title="لا توجد ملاحظات بعد."
            description="سجل أول مشكلة أو فكرة لفريق التصميم."
            action={
              <Button icon={<Plus size={16} />} onClick={() => setModalOpen(true)}>
                + Feedback
              </Button>
            }
          />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {filtered.map((item) => (
              <FeedbackCard
                key={item.id}
                item={item}
                canManage={isStaff}
                onEdit={handleEdit}
                onDelete={(id) => setDeleteId(id)}
                onToggleStatus={handleToggleStatus}
              />
            ))}
          </div>
        )}
      </div>
      )}

      <FeedbackModal
        open={modalOpen}
        onClose={() => {
          setModalOpen(false);
          setEditing(null);
        }}
        onSubmit={handleSubmit}
        editing={editing}
      />

      <ConfirmDialog
        open={!!deleteId}
        onClose={() => setDeleteId(null)}
        onConfirm={handleConfirmDelete}
        title="حذف الملاحظة"
        description="هل أنت متأكد أنك تريد حذف هذه الملاحظة؟ لا يمكن التراجع عن هذا الإجراء."
        confirmLabel="حذف"
      />
      <BulkDeleteModal
        open={bulkDeleteOpen}
        items={items}
        onClose={() => setBulkDeleteOpen(false)}
        onConfirm={handleBulkDelete}
      />
    </AppLayout>
  );
}
