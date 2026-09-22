import { useEffect, useState } from "react";
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

export default function SchedulePage() {
  const [seasons, setSeasons] = useState<Season[]>([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Season | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [selectedEvents, setSelectedEvents] = useState<Season[]>([]);
  const { show } = useToast();

  useEffect(() => {
    setSeasons(scheduleService.list());
  }, []);

  const handleSubmit = (input: CreateSeasonInput) => {
    if (editing) {
      setSeasons(scheduleService.update(editing.id, input));
      show("تم تحديث الموسم");
    } else {
      setSeasons(scheduleService.create(input));
      show("تمت إضافة الموسم بنجاح");
    }
    setEditing(null);
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
      {seasons.length === 0 ? (
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
        onConfirm={() => {
          if (deleteId) {
            setSeasons(scheduleService.remove(deleteId));
            show("تم حذف الموسم", "info");
          }
        }}
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
