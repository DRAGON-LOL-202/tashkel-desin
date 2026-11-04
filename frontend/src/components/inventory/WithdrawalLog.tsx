import { useMemo, useState } from "react";
import { Check, ChevronDown, ClipboardList, Copy, FileText, History, Search, User } from "lucide-react";
import { fmtQty, formatBatchCode } from "./format";
import { EmptyState } from "../ui/EmptyState";
import type { InventoryMovement } from "../../types";

type RangeKey = "all" | "today" | "7d" | "30d";

const RANGES: { key: RangeKey; label: string }[] = [
  { key: "all", label: "الكل" },
  { key: "today", label: "اليوم" },
  { key: "7d", label: "آخر 7 أيام" },
  { key: "30d", label: "آخر 30 يوماً" },
];

const PAGE_SIZE = 15;

interface Operation {
  key: string;
  code: string;
  createdAt: Date;
  employee: string;
  note: string;
  lines: InventoryMovement[];
}

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
const dayKey = (d: Date) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;

function dayLabel(d: Date): string {
  const diff = Math.round((startOfDay(new Date()) - startOfDay(d)) / 86_400_000);
  if (diff === 0) return "اليوم";
  if (diff === 1) return "أمس";
  return d.toLocaleDateString("ar-EG", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
}

const timeLabel = (d: Date) => d.toLocaleTimeString("ar-EG", { hour: "2-digit", minute: "2-digit" });

function CopyCode({ code }: { code: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      title="نسخ رقم العملية"
      aria-label={`نسخ رقم العملية ${code}`}
      onClick={(e) => {
        e.stopPropagation();
        void navigator.clipboard?.writeText(code).then(() => {
          setDone(true);
          setTimeout(() => setDone(false), 1500);
        });
      }}
      className="inline-flex items-center gap-1.5 rounded-md bg-primary/15 px-2 py-1 font-mono text-xs font-bold text-primary-deep"
      dir="ltr"
    >
      {code}
      {done ? <Check size={12} /> : <Copy size={12} />}
    </button>
  );
}

function OperationCard({ op }: { op: Operation }) {
  const [open, setOpen] = useState(false);
  const preview = op.lines.slice(0, 2);
  const rest = op.lines.length - preview.length;

  return (
    <li className="overflow-hidden rounded-control border border-border bg-background/30">
      <div
        role="button"
        tabIndex={0}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setOpen((v) => !v);
          }
        }}
        className="pp-hover-row flex cursor-pointer flex-col gap-2.5 p-3.5"
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-3">
            <CopyCode code={op.code} />
            <span className="flex items-center gap-1.5 text-sm text-text">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/15 text-primary-deep">
                <User size={13} />
              </span>
              <strong className="font-semibold">{op.employee || "—"}</strong>
            </span>
          </div>
          <div className="flex items-center gap-3 text-xs text-muted">
            <span className="rounded-full border border-border px-2.5 py-0.5">{op.lines.length} صنف</span>
            <span>{timeLabel(op.createdAt)}</span>
            <ChevronDown size={16} className={`transition-transform ${open ? "rotate-180" : ""}`} />
          </div>
        </div>

        {!open && (
          <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted">
            {preview.map((m) => (
              <span key={m.id} className="rounded-md bg-surface px-2 py-1 text-text">
                {m.itemName} <span className="text-muted">· {fmtQty(Math.abs(m.delta))} {m.unit}</span>
              </span>
            ))}
            {rest > 0 && <span className="px-1">+{rest} أصناف أخرى</span>}
          </div>
        )}
      </div>

      {open && (
        <div className="border-t border-border/70 bg-surface/60 px-3.5 pb-3.5 pt-3">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[34rem] border-collapse text-sm">
              <thead>
                <tr className="text-xs text-muted">
                  <th className="w-8 px-2 py-1.5 text-start font-medium">م</th>
                  <th className="px-2 py-1.5 text-start font-medium">الصنف</th>
                  <th className="px-2 py-1.5 text-start font-medium">التصنيف</th>
                  <th className="px-2 py-1.5 text-center font-medium">الكمية المسحوبة</th>
                  <th className="px-2 py-1.5 text-center font-medium">الرصيد قبل ← بعد</th>
                </tr>
              </thead>
              <tbody>
                {op.lines.map((m, i) => (
                  <tr key={m.id} className="border-t border-border/50">
                    <td className="px-2 py-2 text-xs text-muted">{i + 1}</td>
                    <td className="px-2 py-2">
                      <div className="font-semibold text-text">{m.itemName}</div>
                      {m.itemSku && (
                        <div className="text-[11px] text-muted" dir="ltr" style={{ textAlign: "start" }}>
                          {m.itemSku}
                        </div>
                      )}
                    </td>
                    <td className="px-2 py-2 text-xs text-muted">{m.categoryName ?? "—"}</td>
                    <td className="px-2 py-2 text-center">
                      <span className="font-bold text-problem">−{fmtQty(Math.abs(m.delta))}</span>{" "}
                      <span className="text-xs text-muted">{m.unit}</span>
                    </td>
                    <td className="px-2 py-2 text-center text-xs text-muted" dir="ltr">
                      {fmtQty(m.previousBalance)} → <strong className="text-text">{fmtQty(m.balanceAfter)}</strong>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {op.note && (
            <p className="mt-3 flex items-start gap-2 rounded-md bg-background px-3 py-2 text-xs text-muted">
              <FileText size={14} className="mt-0.5 shrink-0" />
              <span>
                <strong className="text-text">ملاحظات: </strong>
                {op.note}
              </span>
            </p>
          )}
          <p className="mt-2 text-[11px] text-muted">
            {op.createdAt.toLocaleString("ar-EG", { dateStyle: "full", timeStyle: "short" })}
          </p>
        </div>
      )}
    </li>
  );
}

/** سجل عمليات السحب: مجمّع حسب اليوم، قابل للبحث والتصفية، وكل عملية قابلة للتوسيع لعرض جدول أصنافها. */
export function WithdrawalLog({ movements }: { movements: InventoryMovement[] }) {
  const [search, setSearch] = useState("");
  const [range, setRange] = useState<RangeKey>("all");
  const [employee, setEmployee] = useState("all");
  const [limit, setLimit] = useState(PAGE_SIZE);

  const operations = useMemo<Operation[]>(() => {
    const map = new Map<string, InventoryMovement[]>();
    for (const m of movements) {
      const key = m.batchId ?? m.id;
      map.set(key, [...(map.get(key) ?? []), m]);
    }
    return [...map.entries()]
      .map(([key, lines]) => ({
        key,
        code: formatBatchCode(lines[0].batchId, lines[0].id),
        createdAt: new Date(lines[0].createdAt),
        employee: lines[0].createdByName,
        note: lines.find((l) => l.note)?.note ?? "",
        lines,
      }))
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }, [movements]);

  const employees = useMemo(() => [...new Set(operations.map((o) => o.employee).filter(Boolean))].sort(), [operations]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const now = Date.now();
    const today = startOfDay(new Date());
    return operations.filter((o) => {
      if (employee !== "all" && o.employee !== employee) return false;
      const t = o.createdAt.getTime();
      if (range === "today" && t < today) return false;
      if (range === "7d" && t < now - 7 * 86_400_000) return false;
      if (range === "30d" && t < now - 30 * 86_400_000) return false;
      if (!q) return true;
      const hay = `${o.code} ${o.employee} ${o.note} ${o.lines.map((l) => `${l.itemName} ${l.itemSku ?? ""}`).join(" ")}`.toLowerCase();
      return hay.includes(q);
    });
  }, [operations, search, range, employee]);

  const shown = filtered.slice(0, limit);
  const totalLines = filtered.reduce((s, o) => s + o.lines.length, 0);

  // تجميع العمليات الظاهرة حسب اليوم
  const days = useMemo(() => {
    const groups: { key: string; label: string; ops: Operation[] }[] = [];
    for (const o of shown) {
      const k = dayKey(o.createdAt);
      const last = groups[groups.length - 1];
      if (last && last.key === k) last.ops.push(o);
      else groups.push({ key: k, label: dayLabel(o.createdAt), ops: [o] });
    }
    return groups;
  }, [shown]);

  const resetPaging = () => setLimit(PAGE_SIZE);

  return (
    <section className="pp-panel flex flex-col gap-4 p-4" aria-label="سجل السحوبات">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-base font-bold text-text">
          <History size={18} /> سجل عمليات السحب
        </h2>
        <div className="flex items-center gap-2 text-xs text-muted">
          <span className="rounded-full border border-border px-3 py-1">
            <strong className="text-text">{filtered.length}</strong> عملية
          </span>
          <span className="rounded-full border border-border px-3 py-1">
            <strong className="text-text">{totalLines}</strong> سطر صنف
          </span>
        </div>
      </div>

      {operations.length > 0 && (
        <div className="flex flex-col gap-2.5">
          <div className="flex flex-col gap-2 sm:flex-row">
            <div className="relative flex-1">
              <Search size={16} className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-muted" />
              <input
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  resetPaging();
                }}
                placeholder="ابحث برقم العملية أو الموظف أو الصنف أو الملاحظة..."
                aria-label="بحث في سجل السحب"
                className="pp-input pp-input--icon"
              />
            </div>
            {employees.length > 1 && (
              <select
                value={employee}
                onChange={(e) => {
                  setEmployee(e.target.value);
                  resetPaging();
                }}
                aria-label="فلتر الموظف"
                className="pp-input pp-input--select cursor-pointer sm:w-48"
              >
                <option value="all">كل الموظفين</option>
                {employees.map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            )}
          </div>
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="الفترة الزمنية">
            {RANGES.map((r) => (
              <button
                key={r.key}
                type="button"
                onClick={() => {
                  setRange(r.key);
                  resetPaging();
                }}
                aria-pressed={range === r.key}
                className={`rounded-full border px-3 py-1 text-xs transition-colors ${
                  range === r.key ? "border-primary-deep bg-primary/15 font-bold text-primary-deep" : "border-border text-muted pp-hover-row"
                }`}
              >
                {r.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {operations.length === 0 ? (
        <EmptyState icon={<ClipboardList size={24} />} title="لا توجد عمليات سحب مسجلة بعد" description="ستظهر هنا كل عملية سحب بعد تأكيدها." />
      ) : filtered.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted">لا توجد عمليات مطابقة للبحث أو الفلاتر الحالية</p>
      ) : (
        <>
          <div className="flex flex-col gap-5">
            {days.map((g) => (
              <div key={g.key} className="flex flex-col gap-2.5">
                <div className="flex items-center gap-3">
                  <h3 className="text-sm font-bold text-text">{g.label}</h3>
                  <span className="text-xs text-muted">{g.ops.length} عملية</span>
                  <span className="h-px flex-1 bg-border" />
                </div>
                <ul className="flex flex-col gap-2">
                  {g.ops.map((o) => (
                    <OperationCard key={o.key} op={o} />
                  ))}
                </ul>
              </div>
            ))}
          </div>
          {filtered.length > shown.length && (
            <button
              type="button"
              onClick={() => setLimit((l) => l + PAGE_SIZE)}
              className="pp-hover-row mx-auto rounded-full border border-border px-5 py-2 text-sm text-text"
            >
              عرض المزيد ({filtered.length - shown.length} متبقية)
            </button>
          )}
        </>
      )}
    </section>
  );
}
