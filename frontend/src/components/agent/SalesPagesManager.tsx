import { useState, type FormEvent } from "react";
import { Archive, ArchiveRestore, Check, Globe, Pencil, Plus, Trash2, X } from "lucide-react";
import { Badge } from "../ui/Badge";
import { Button } from "../ui/Button";
import { Card } from "../ui/Card";
import { ConfirmDialog } from "../ui/ConfirmDialog";
import { Input } from "../ui/Field";
import { ErrorState, LoadingState } from "../ui/StatusViews";
import { useToast } from "../ui/ToastProvider";
import { useResource } from "../../hooks/useResource";
import { useSafeAction } from "../../hooks/useSafeAction";
import type { SyncChannel } from "../../lib/liveSync";
import { agentAdminService } from "../../services/agentService";
import type { SalesPageAdminRow } from "../../types";

const NONE: SalesPageAdminRow[] = [];
const PAGE_CHANNELS: SyncChannel[] = ["accounting", "sales"];

function PageRow({
  page,
  onUpdated,
  onDeleteRequest,
}: {
  page: SalesPageAdminRow;
  onUpdated: () => Promise<void>;
  onDeleteRequest: (p: SalesPageAdminRow) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(page.name);
  const [busy, setBusy] = useState(false);
  const { show } = useToast();
  const run = useSafeAction();

  const saveName = async () => {
    const trimmed = name.trim();
    if (!trimmed || busy) return;
    if (trimmed === page.name) {
      setEditing(false);
      return;
    }
    setBusy(true);
    try {
      const r = await run(() => agentAdminService.updatePage(page.id, { name: trimmed }));
      if (r.ok) {
        show("تم تحديث اسم الصفحة");
        setEditing(false);
        await onUpdated();
      }
    } finally {
      setBusy(false);
    }
  };

  const toggleActive = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const r = await run(() => agentAdminService.updatePage(page.id, { isActive: !page.isActive }));
      if (r.ok) {
        show(page.isActive ? "تم إيقاف الصفحة" : "تم تفعيل الصفحة");
        await onUpdated();
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={`flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-border px-3 py-2.5 text-sm last:border-b-0 ${page.isActive ? "" : "opacity-65"}`}>
      {editing ? (
        <div className="flex min-w-[200px] flex-1 items-center gap-1.5">
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={80}
            aria-label={`تعديل اسم ${page.name}`}
            className="!h-8 text-sm"
            autoFocus
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                void saveName();
              } else if (e.key === "Escape") {
                setName(page.name);
                setEditing(false);
              }
            }}
          />
          <button
            type="button"
            disabled={!name.trim() || busy}
            onClick={() => void saveName()}
            aria-label="حفظ اسم الصفحة"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-control border border-primary-deep/40 bg-primary/15 text-primary-deep hover:bg-primary/25 disabled:opacity-40"
          >
            <Check size={14} />
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              setName(page.name);
              setEditing(false);
            }}
            aria-label="إلغاء التعديل"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-control border border-border text-muted hover:text-text"
          >
            <X size={14} />
          </button>
        </div>
      ) : (
        <div className="flex min-w-[160px] flex-1 flex-wrap items-center gap-2">
          <span className="font-medium text-text">{page.name}</span>
          {!page.isActive && <Badge color="#8A8F98">موقوفة</Badge>}
          <span className="text-xs tabular-nums text-muted">
            ({page.ordersCount} {page.ordersCount === 1 ? "أوردر" : "أوردرات"})
          </span>
        </div>
      )}

      <div className="flex items-center gap-1.5">
        {!editing && (
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              setName(page.name);
              setEditing(true);
            }}
            aria-label={`تعديل ${page.name}`}
            title="تعديل الاسم"
            className="flex h-8 w-8 items-center justify-center rounded-control border border-border text-muted hover:text-text"
          >
            <Pencil size={14} />
          </button>
        )}
        <button
          type="button"
          disabled={busy}
          onClick={() => void toggleActive()}
          aria-label={page.isActive ? `إيقاف ${page.name}` : `تفعيل ${page.name}`}
          title={page.isActive ? "إيقاف (تختفي من الخيارات الجديدة مع بقاء حساباتها)" : "تفعيل"}
          className="flex h-8 w-8 items-center justify-center rounded-control border border-border text-muted hover:text-text"
        >
          {page.isActive ? <Archive size={14} /> : <ArchiveRestore size={14} />}
        </button>
        <button
          type="button"
          disabled={busy || page.ordersCount > 0}
          onClick={() => onDeleteRequest(page)}
          aria-label={`حذف ${page.name}`}
          title={page.ordersCount > 0 ? "لا يمكن حذف صفحة لها أوردرات؛ أوقفها بدلاً من حذفها" : "حذف الصفحة نهائياً"}
          className="flex h-8 w-8 items-center justify-center rounded-control border border-border text-problem hover:bg-problem/10 disabled:cursor-not-allowed disabled:opacity-35"
        >
          <Trash2 size={14} />
        </button>
      </div>
    </div>
  );
}

// إدارة أسماء صفحات البيع (الإدارة فقط): تظهر للفتيات كخيار إجباري، وتُخرج حسابات مستقلة لكل صفحة في الحسابات العامة.
export function SalesPagesManager() {
  const pages = useResource<SalesPageAdminRow[]>(agentAdminService.listPages, NONE, PAGE_CHANNELS);
  const [newName, setNewName] = useState("");
  const [adding, setAdding] = useState(false);
  const [deleting, setDeleting] = useState<SalesPageAdminRow | null>(null);
  const { show } = useToast();
  const run = useSafeAction();

  const addPage = async (e: FormEvent) => {
    e.preventDefault();
    const trimmed = newName.trim();
    if (!trimmed || adding) return;
    setAdding(true);
    try {
      const r = await run(() => agentAdminService.createPage(trimmed));
      if (r.ok) {
        show(`أُضيفت صفحة «${r.value.name}»`);
        setNewName("");
        await pages.reload();
      }
    } finally {
      setAdding(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleting) return;
    const target = deleting;
    setDeleting(null);
    const r = await run(() => agentAdminService.deletePage(target.id));
    if (r.ok) {
      show(`حُذفت صفحة «${target.name}»`);
      await pages.reload();
    }
  };

  return (
    <>
      <Card className="mb-6 overflow-hidden">
        <div className="border-b border-border px-3 py-2.5">
          <h2 className="flex items-center gap-1.5 text-sm font-semibold text-text">
            <Globe size={15} className="text-primary-deep" />
            <span>صفحات البيع (أسماء الصفحات)</span>
          </h2>
          <p className="mt-0.5 text-xs text-muted">
            تظهر هذه الصفحات كخيار إجباري للفتيات عند تسجيل كل أوردر وتُعرض كملاحظة خارج الفاتورة، مع استخراج حسابات منفردة لكل صفحة في «الحسابات العامة».
          </p>
        </div>

        <form onSubmit={(e) => void addPage(e)} className="flex flex-wrap items-center gap-2 border-b border-border bg-background/40 px-3 py-2.5">
          <Input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            maxLength={80}
            placeholder="أدخل اسم الصفحة يدوياً (مثال: بيدج التشكيل الرئيسية)..."
            aria-label="اسم الصفحة الجديدة"
            className="min-w-[220px] flex-1 !py-1.5 text-sm"
          />
          <Button type="submit" size="sm" icon={<Plus size={14} />} disabled={!newName.trim() || adding}>
            {adding ? "جارٍ الإضافة..." : "إضافة صفحة"}
          </Button>
        </form>

        {pages.loading ? (
          <LoadingState />
        ) : pages.error ? (
          <ErrorState message={pages.error} onRetry={() => void pages.retry()} />
        ) : pages.data.length === 0 ? (
          <p className="px-3 py-5 text-center text-sm text-muted">لم تُضف أسماء صفحات بعد. أضف أول صفحة أعلاه لتظهر للفتيات.</p>
        ) : (
          pages.data.map((p) => (
            <PageRow
              key={`${p.id}:${p.name}:${p.isActive}`}
              page={p}
              onUpdated={pages.reload}
              onDeleteRequest={setDeleting}
            />
          ))
        )}
      </Card>

      <ConfirmDialog
        open={!!deleting}
        onClose={() => setDeleting(null)}
        onConfirm={() => void confirmDelete()}
        title={deleting ? `حذف صفحة «${deleting.name}»؟` : "حذف الصفحة؟"}
        description="سيتم حذف الصفحة نهائياً لعدم ارتباطها بأي أوردرات."
        confirmLabel="حذف"
      />
    </>
  );
}
