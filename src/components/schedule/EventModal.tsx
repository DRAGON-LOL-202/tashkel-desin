import { AlignRight, CalendarRange, Palette, Pencil, Trash2 } from "lucide-react";
import { format } from "date-fns";
import { ar } from "date-fns/locale";
import type { Season } from "../../types";
import { Modal } from "../ui/Modal";
import { Button } from "../ui/Button";

interface EventModalProps {
  open: boolean;
  seasons: Season[];
  onClose: () => void;
  onEdit: (season: Season) => void;
  onDelete: (id: string) => void;
}

function formatDate(value: string): string {
  return format(new Date(`${value}T12:00:00`), "d MMMM yyyy", { locale: ar });
}

export function EventModal({ open, seasons, onClose, onEdit, onDelete }: EventModalProps) {
  const title = seasons.length > 1 ? "أحداث اليوم" : seasons[0]?.title ?? "تفاصيل الحدث";

  return (
    <Modal open={open} onClose={onClose} title={title} description="تفاصيل الموسم أو الحدث داخل التقويم السنوي" size="lg">
      <div className="flex flex-col gap-3">
        {seasons.map((season) => (
          <article key={season.id} className="rounded-card border border-border bg-background/45 p-4">
            <div className="mb-3 flex items-start justify-between gap-3">
              <div>
                <h4 className="font-bold text-text">{season.title}</h4>
                <p className="mt-1 text-xs text-muted">موسم / حدث مجدول</p>
              </div>
              <span
                className="h-9 w-9 shrink-0 rounded-full border border-white/30 shadow-sm"
                style={{ backgroundColor: season.color }}
                aria-label={season.color}
              />
            </div>

            <div className="grid gap-3 text-sm sm:grid-cols-2">
              <div className="flex items-start gap-2 rounded-control bg-surface p-3">
                <CalendarRange size={16} className="mt-0.5 text-primary-deep" />
                <div>
                  <p className="text-xs text-muted">تاريخ البداية</p>
                  <p className="font-semibold text-text">{formatDate(season.startDate)}</p>
                </div>
              </div>
              <div className="flex items-start gap-2 rounded-control bg-surface p-3">
                <CalendarRange size={16} className="mt-0.5 text-primary-deep" />
                <div>
                  <p className="text-xs text-muted">تاريخ النهاية</p>
                  <p className="font-semibold text-text">{formatDate(season.endDate)}</p>
                </div>
              </div>
              <div className="flex items-start gap-2 rounded-control bg-surface p-3">
                <Palette size={16} className="mt-0.5 text-primary-deep" />
                <div>
                  <p className="text-xs text-muted">اللون</p>
                  <p className="font-semibold text-text">{season.color}</p>
                </div>
              </div>
              <div className="flex items-start gap-2 rounded-control bg-surface p-3">
                <AlignRight size={16} className="mt-0.5 text-primary-deep" />
                <div>
                  <p className="text-xs text-muted">الوصف</p>
                  <p className="font-semibold text-text">{season.description || "لا يوجد وصف"}</p>
                </div>
              </div>
            </div>

            <div className="mt-4 flex justify-end gap-2">
              <Button
                variant="secondary"
                icon={<Trash2 size={15} />}
                onClick={() => {
                  onClose();
                  onDelete(season.id);
                }}
              >
                حذف
              </Button>
              <Button
                icon={<Pencil size={15} />}
                onClick={() => {
                  onClose();
                  onEdit(season);
                }}
              >
                تعديل
              </Button>
            </div>
          </article>
        ))}
      </div>
    </Modal>
  );
}
