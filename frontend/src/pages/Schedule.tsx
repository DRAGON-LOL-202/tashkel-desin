import { useState } from "react";
import { Plus, CalendarRange } from "lucide-react";
import { AppLayout } from "../components/layout/AppLayout";
import { Header } from "../components/header/Header";
import { Button } from "../components/ui/Button";
import { EmptyState } from "../components/ui/EmptyState";
import { ScheduleCalendar } from "../components/schedule/ScheduleCalendar";
import { ScheduleTimeline } from "../components/schedule/ScheduleTimeline";
import { SeasonModal } from "../components/schedule/SeasonModal";
import { YearCalendar } from "../components/schedule/YearCalendar";
import { EventModal } from "../components/schedule/EventModal";
import { ConfirmDialog } from "../components/ui/ConfirmDialog";
import { scheduleService } from "../services/scheduleService";
import type { CreateSeasonInput, Season } from "../types";
import { useToast } from "../components/ui/ToastProvider";
import { ErrorState, LoadingState } from "../components/ui/StatusViews";
import { useResource } from "../hooks/useResource";
import { useSafeAction } from "../hooks/useSafeAction";

export default function SchedulePage() {
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Season | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [selectedEvents, setSelectedEvents] = useState<Season[]>([]);
  const { show } = useToast();
  const run = useSafeAction();
  const { data: seasons, loading, error, reload, retry } = useResource<Season[]>(scheduleService.list, []);

  const handleSubmit = async (input: CreateSeasonInput) => {
    const wasEditing = editing;
    const result = await run(() => (wasEditing ? scheduleService.update(wasEditing.id, input) : scheduleService.create(input)));
    await reload();
    if (!result.ok) return false;
    show(wasEditing ? "تم تحديث الموسم" : "تمت إضافة الموسم بنجاح");
    setEditing(null);
    return true;
  };

  const handleConfirmDelete = async () => {
    if (!deleteId) return;
    const id = deleteId;
    setDeleteId(null);
    const result = await run(() => scheduleService.remove(id));
    await reload();
    if (result.ok) show("تم حذف الموسم", "info");
  };

  const handleEdit = (season: Season) => {
    setEditing(season);
    setModalOpen(true);
  };

  return (
    <AppLayout
      headerSlot={(openMobileNav) => (
        <Header
          title="الجدولة"
          description="إدارة المواسم والحملات التصميمية على مدار العام"
          onOpenMobileNav={openMobileNav}
          action={
            <Button
              icon={<Plus size={16} />}
              onClick={() => {
                setEditing(null);
                setModalOpen(true);
              }}
            >
              إضافة موسم
            </Button>
          }
        />
      )}
    >
      {loading ? (
        <LoadingState label="جارٍ تحميل الجدولة..." />
      ) : error ? (
        <ErrorState message={error} onRetry={() => void retry()} />
      ) : seasons.length === 0 ? (
        <EmptyState
          icon={<CalendarRange size={22} />}
          title="لا توجد مواسم مضافة."
          description="أضف أول موسم أو حملة تصميمية لعرضها في الجدول الزمني."
          action={
            <Button icon={<Plus size={16} />} onClick={() => setModalOpen(true)}>
              إضافة موسم
            </Button>
          }
        />
      ) : (
        <div className="flex flex-col gap-6">
          <ScheduleTimeline seasons={seasons} onEdit={handleEdit} onDelete={(id) => setDeleteId(id)} />
          <ScheduleCalendar seasons={seasons} />
          <YearCalendar seasons={seasons} onSelectEvents={setSelectedEvents} />
        </div>
      )}

      <SeasonModal
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
        title="حذف الموسم"
        description="هل أنت متأكد أنك تريد حذف هذا الموسم؟"
        confirmLabel="حذف"
      />
      <EventModal
        open={selectedEvents.length > 0}
        seasons={selectedEvents}
        onClose={() => setSelectedEvents([])}
        onEdit={handleEdit}
        onDelete={(id) => setDeleteId(id)}
      />
    </AppLayout>
  );
}
