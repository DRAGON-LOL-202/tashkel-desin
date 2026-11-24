import { useState } from "react";
import { Ban, Eye, Pencil, Phone, Send } from "lucide-react";
import { Badge } from "../ui/Badge";
import { Button } from "../ui/Button";
import { fmtMoney } from "../inventory/format";
import { formatArabicDate } from "../../lib/date";
import { waybillFromAgentOrder } from "../../lib/waybillPdf";
import { agentOrderBadge } from "./meta";
import { WaybillPreviewModal } from "./WaybillPreviewModal";
import type { SupervisorAgentOrder } from "../../types";

interface SupervisorOrdersTableProps {
  orders: SupervisorAgentOrder[];
  selectedIds: Set<string>;
  onToggleSelect: (id: string) => void;
  onToggleSelectAllDrafts: (checked: boolean) => void;
  onEditOne: (o: SupervisorAgentOrder) => void;
  onExportOne: (o: SupervisorAgentOrder) => void;
  onCancelOne: (o: SupervisorAgentOrder) => void;
}

function initialChar(name: string): string {
  const clean = name.trim();
  return clean ? clean[0] : "؟";
}

// جدول تجميع وتصدير أوردرات الفتيات لمشرف الفتيات: يطابق شكل جدول متابعة المبيعات مع معاينة البوليصة وتصدير المسودات للإنتاج.
export function SupervisorOrdersTable({
  orders,
  selectedIds,
  onToggleSelect,
  onToggleSelectAllDrafts,
  onEditOne,
  onExportOne,
  onCancelOne,
}: SupervisorOrdersTableProps) {
  const [previewId, setPreviewId] = useState<string | null>(null);
  const previewOrder = previewId ? orders.find((x) => x.id === previewId) ?? null : null;
  const drafts = orders.filter((o) => o.status === "DRAFT");
  const allDraftsSelected = drafts.length > 0 && drafts.every((o) => selectedIds.has(o.id));

  return (
    <>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[940px] border-collapse text-right text-sm">
          <thead>
            <tr className="border-b border-border bg-primary/10 text-xs font-semibold text-muted dark:bg-[#0c2720]">
              <th className="w-10 px-3 py-3 text-center">
                <input
                  type="checkbox"
                  aria-label="تحديد كل الأوردرات غير المصدّرة المعروضة"
                  disabled={drafts.length === 0}
                  checked={allDraftsSelected}
                  onChange={(e) => onToggleSelectAllDrafts(e.target.checked)}
                  className="h-4 w-4 cursor-pointer accent-primary-deep disabled:cursor-not-allowed disabled:opacity-40"
                />
              </th>
              <th className="whitespace-nowrap px-3 py-3">رقم البوليصة</th>
              <th className="whitespace-nowrap px-4 py-3">اسم العميل</th>
              <th className="whitespace-nowrap px-4 py-3">الأوردر والقيمة</th>
              <th className="whitespace-nowrap px-4 py-3">التاريخ</th>
              <th className="whitespace-nowrap px-4 py-3">الحالة</th>
              <th className="whitespace-nowrap px-4 py-3">الفتاة</th>
              <th className="whitespace-nowrap px-4 py-3">إجراء</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/70">
            {orders.map((o) => {
              const isDraft = o.status === "DRAFT";
              const canCancelOrder = o.status === "EXPORTED" && (o.salesStatus === null || o.salesStatus === "REGISTERED");
              const isChecked = isDraft && selectedIds.has(o.id);
              const badge = agentOrderBadge(o);
              const displayCustomer = o.customerName || "—";

              return (
                <tr
                  key={o.id}
                  style={{ contain: "layout style" }}
                  className={`transition-colors hover:bg-primary/5 dark:hover:bg-[#103027]/70 ${
                    isChecked ? "bg-primary/10 dark:bg-[#12372c]/70" : ""
                  }`}
                >
                  <td className="px-3 py-3 text-center align-middle">
                    <input
                      type="checkbox"
                      aria-label={`تحديد بوليصة ${o.waybill || o.id}`}
                      disabled={!isDraft}
                      checked={isChecked}
                      onChange={() => onToggleSelect(o.id)}
                      className="h-4 w-4 cursor-pointer accent-primary-deep disabled:cursor-not-allowed disabled:opacity-30"
                    />
                  </td>

                  <td className="whitespace-nowrap px-3 py-3 align-middle">
                    <span className="font-bold tabular-nums text-primary-deep">{o.waybill || "—"}</span>
                  </td>

                  <td className="px-4 py-3 align-middle">
                    <div className="flex items-center gap-2.5">
                      <span
                        aria-hidden="true"
                        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-primary-deep/25 bg-primary/15 text-xs font-bold text-primary-deep"
                      >
                        {initialChar(displayCustomer)}
                      </span>
                      <div className="min-w-0">
                        <p className="truncate font-semibold text-text" title={displayCustomer}>
                          {displayCustomer}
                        </p>
                        {o.customerPhone && (
                          <p dir="ltr" className="mt-0.5 flex items-center justify-end gap-1 text-[11px] tabular-nums text-muted">
                            <Phone size={10} />
                            <span>{o.customerPhone}</span>
                          </p>
                        )}
                      </div>
                    </div>
                  </td>

                  <td className="max-w-[240px] px-4 py-3 align-middle">
                    <p className="truncate font-medium text-text" title={o.boxName}>
                      {o.boxName || "—"}
                    </p>
                    <p className="mt-0.5 text-xs font-semibold tabular-nums text-muted">
                      {fmtMoney(o.sellPrice)}
                      {o.shippingPrice != null && (
                        <span className="ms-1.5 font-normal">+ شحن {fmtMoney(o.shippingPrice)}</span>
                      )}
                      {(o.deposit ?? 0) > 0 && (
                        <span className="ms-1.5 text-accent">- عربون {fmtMoney(o.deposit ?? 0)}</span>
                      )}
                    </p>
                  </td>

                  <td className="whitespace-nowrap px-4 py-3 align-middle text-xs text-muted">
                    {formatArabicDate(o.date, "EEEE، d MMMM yyyy")}
                  </td>

                  <td className="max-w-[180px] px-4 py-3 align-middle">
                    <div className="flex flex-col items-start gap-1">
                      <Badge color={badge.color}>{badge.label}</Badge>
                      {o.status === "CANCELLED" && o.cancelReason && (
                        <span className="max-w-full truncate text-[11px] text-problem" title={o.cancelReason}>
                          {o.cancelReason}
                        </span>
                      )}
                      {o.status === "CANCELLED" && o.cancelledByName && (
                        <span className="max-w-full truncate text-[11px] text-muted" title={`ألغاه: ${o.cancelledByName}`}>
                          ألغاه: {o.cancelledByName}
                        </span>
                      )}
                      {o.status === "EXPORTED" && o.exportedByName && (
                        <span className="max-w-full truncate text-[11px] text-muted" title={`صدّره: ${o.exportedByName}`}>
                          بواسطة: {o.exportedByName}
                        </span>
                      )}
                    </div>
                  </td>

                  <td className="whitespace-nowrap px-4 py-3 align-middle text-xs font-medium text-text">
                    <div>{o.agentName || "—"}</div>
                    {o.salesPageName && (
                      <div className="mt-0.5 text-[11px] font-normal text-primary-deep">{o.salesPageName}</div>
                    )}
                  </td>

                  <td className="whitespace-nowrap px-4 py-3 align-middle">
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        aria-label={`معاينة بوليصة ${o.waybill || o.id}`}
                        title="معاينة البوليصة"
                        onClick={() => setPreviewId(o.id)}
                        className="flex h-8 w-8 items-center justify-center rounded-control border border-border text-muted transition-colors hover:border-primary-deep/50 hover:bg-primary/10 hover:text-primary-deep"
                      >
                        <Eye size={15} />
                      </button>
                      {isDraft && (
                        <>
                          <Button
                            size="sm"
                            variant="secondary"
                            icon={<Pencil size={13} />}
                            onClick={() => onEditOne(o)}
                          >
                            تعديل
                          </Button>
                          <Button
                            size="sm"
                            icon={<Send size={13} />}
                            onClick={() => onExportOne(o)}
                          >
                            تصدير للإنتاج
                          </Button>
                        </>
                      )}
                      {canCancelOrder && (
                        <Button
                          size="sm"
                          variant="danger"
                          icon={<Ban size={13} />}
                          onClick={() => onCancelOne(o)}
                        >
                          إلغاء الأوردر
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {previewOrder && (
        <WaybillPreviewModal
          key={previewOrder.id}
          open
          waybill={waybillFromAgentOrder(previewOrder)}
          salesPageName={previewOrder.salesPageName}
          canPrint={false}
          canDownloadPdf={false}
          statusLabel={agentOrderBadge(previewOrder).label}
          statusColor={agentOrderBadge(previewOrder).color}
          onClose={() => setPreviewId(null)}
        />
      )}
    </>
  );
}
