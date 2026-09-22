import { useEffect, useMemo, useState } from "react";
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
import { ConfirmDialog } from "../components/ui/ConfirmDialog";
import { feedbackService } from "../services/feedbackService";
import type { CreateFeedbackInput, Feedback as FeedbackItem, FeedbackType } from "../types";
import { useToast } from "../components/ui/ToastProvider";

type FilterValue = "all" | FeedbackType;
type BulkDeleteScope = "all" | FeedbackType;

const bulkDeleteLabels: Record<BulkDeleteScope, string> = {
  all: "كل الفيدباك",
  problem: "المشاكل",
  operational: "مشاكل التشغيل",
  idea: "الأفكار",
};

export default function FeedbackPage() {
  const [items, setItems] = useState<FeedbackItem[]>([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<FeedbackItem | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [bulkDeleteScope, setBulkDeleteScope] = useState<BulkDeleteScope>("all");
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [filter, setFilter] = useState<FilterValue>("all");
  const [search, setSearch] = useState("");
  const [view, setView] = useState<"list" | "calendar">("list");
  const { show } = useToast();

  useEffect(() => {
    setItems(feedbackService.list());
  }, []);

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

  const bulkDeleteCount = useMemo(
    () =>
      bulkDeleteScope === "all"
        ? items.length
        : items.filter((item) => item.type === bulkDeleteScope).length,
    [items, bulkDeleteScope]
  );

  const handleSubmit = (input: CreateFeedbackInput) => {
    if (editing) {
      setItems(feedbackService.update(editing.id, input));
      show("تم تحديث الملاحظة");
    } else {
      setItems(feedbackService.create(input));
      show("تمت إضافة الملاحظة بنجاح");
    }
    setEditing(null);
  };

  const handleEdit = (item: FeedbackItem) => {
    setEditing(item);
    setModalOpen(true);
  };

  const handleToggleStatus = (id: string) => setItems(feedbackService.toggleStatus(id));

  const handleBulkDelete = () => {
    setItems(feedbackService.removeMany(bulkDeleteScope === "all" ? undefined : bulkDeleteScope));
    show(`تم حذف ${bulkDeleteCount} من ${bulkDeleteLabels[bulkDeleteScope]}`, "info");
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
            <div className="flex items-center gap-2 rounded-control border border-border bg-surface px-2 py-1">
              <select
                value={bulkDeleteScope}
                onChange={(event) => setBulkDeleteScope(event.target.value as BulkDeleteScope)}
                className="h-8 rounded-control bg-surface px-2 text-xs font-medium text-text focus:outline-none"
                aria-label="اختيار تصنيف الحذف"
              >
                <option value="all">كل الفيدباك</option>
                <option value="problem">المشاكل</option>
                <option value="operational">مشاكل التشغيل</option>
                <option value="idea">الأفكار</option>
              </select>
              <Button
                size="sm"
                variant="danger"
                icon={<Trash2 size={14} />}
                disabled={bulkDeleteCount === 0}
                onClick={() => setBulkDeleteOpen(true)}
              >
                حذف
              </Button>
            </div>
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
          <FeedbackCalendar items={filtered} onSelectItem={handleEdit} />
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
                onEdit={handleEdit}
                onDelete={(id) => setDeleteId(id)}
                onToggleStatus={handleToggleStatus}
              />
            ))}
          </div>
        )}
      </div>

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
        onConfirm={() => {
          if (deleteId) {
            setItems(feedbackService.remove(deleteId));
            show("تم حذف الملاحظة", "info");
          }
        }}
        title="حذف الملاحظة"
        description="هل أنت متأكد أنك تريد حذف هذه الملاحظة؟ لا يمكن التراجع عن هذا الإجراء."
        confirmLabel="حذف"
      />
      <ConfirmDialog
        open={bulkDeleteOpen}
        onClose={() => setBulkDeleteOpen(false)}
        onConfirm={handleBulkDelete}
        title="حذف الفيدباك"
        description={`سيتم حذف ${bulkDeleteCount} من ${bulkDeleteLabels[bulkDeleteScope]}. لا يمكن التراجع عن هذا الإجراء.`}
        confirmLabel="حذف"
      />
    </AppLayout>
  );
}
