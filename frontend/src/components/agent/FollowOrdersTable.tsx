import { useState } from "react";
import { ChevronDown, Eye, Flag, History, Phone, Printer, Trash2 } from "lucide-react";
import { Badge } from "../ui/Badge";
import { fmtMoney } from "../inventory/format";
import { formatArabicDate } from "../../lib/date";
import { waybillFromFollowOrder } from "../../lib/waybillPdf";
import { SALES_STATUS_META } from "../sales/status";
import { DepositCell } from "./DepositCell";
import { rowBadge } from "./meta";
import { ShippingCell } from "./ShippingCell";
import { WaybillPreviewModal } from "./WaybillPreviewModal";
import type { FollowOrder } from "../../types";

interface FollowOrdersTableProps {
  orders: FollowOrder[];
  canAct: boolean;
  canDeleteOrder?: boolean;
  selectedIds: Set<string>;
  onToggleSelect: (id: string) => void;
  onToggleSelectAll: (checked: boolean) => void;
  onStatus: (o: FollowOrder, status: "SHIPPED" | "DELIVERED") => Promise<void>;
  onFlag: (o: FollowOrder, flagged: boolean) => Promise<void>;
  onShipping: (o: FollowOrder, price: number | null) => Promise<boolean>;
  onExtraDeposit: (o: FollowOrder, amount: number | null) => Promise<boolean>;
  onPrintOne: (o: FollowOrder) => void;
  onDelete?: (o: FollowOrder) => void;
}

function initialChar(name: string): string {
  const clean = name.trim();
  return clean ? clean[0] : "؟";
}

// جدول متابعة أوردرات المبيعات: تحديد متعدد لتحميل PDF، رقم البوليصة، العميل، الأوردر، التاريخ، الحالة، الفتاة، الشحن، وأزرار المعاينة والطباعة
export function FollowOrdersTable({
  orders,
  canAct,
  canDeleteOrder = false,
  selectedIds,
  onToggleSelect,
  onToggleSelectAll,
  onStatus,
  onFlag,
  onShipping,
  onExtraDeposit,
  onPrintOne,
  onDelete,
}: FollowOrdersTableProps) {
  const [busyId, setBusyId] = useState<string | null>(null);
  const [previewState, setPreviewState] = useState<{ id: string; tab: "preview" | "details" | "log" } | null>(null);

  const previewOrder = previewState ? orders.find((x) => x.id === previewState.id) ?? null : null;
  const allSelected = orders.length > 0 && orders.every((o) => selectedIds.has(o.id));

  const runRow = async (id: string, fn: () => Promise<void>) => {
    setBusyId(id);
    try {
      await fn();
    } finally {
      setBusyId(null);
    }
  };

  return (
    <>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[1120px] border-collapse text-right text-sm">
          <thead>
            <tr className="border-b border-border bg-primary/10 text-xs font-semibold text-muted dark:bg-[#0c2720]">
              <th className="w-10 px-3 py-3 text-center">
                <input
                  type="checkbox"
                  aria-label="تحديد كل البوالص المعروضة"
                  checked={allSelected}
                  onChange={(e) => onToggleSelectAll(e.target.checked)}
                  className="h-4 w-4 cursor-pointer accent-primary-deep"
                />
              </th>
              <th className="whitespace-nowrap px-3 py-3">رقم البوليصة</th>
              <th className="whitespace-nowrap px-4 py-3">اسم العميل</th>
              <th className="whitespace-nowrap px-4 py-3">الأوردر والقيمة</th>
              <th className="whitespace-nowrap px-4 py-3">التاريخ</th>
              <th className="whitespace-nowrap px-4 py-3">الحالة</th>
              <th className="whitespace-nowrap px-4 py-3">الفتاة</th>
              <th className="whitespace-nowrap px-4 py-3">سعر الشحن</th>
              <th className="whitespace-nowrap px-4 py-3">العربون</th>
              <th className="whitespace-nowrap px-4 py-3">إجراء</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/70">
            {orders.map((o) => {
              const badge = rowBadge(o.status, o.returnFlagged, o.cancelled);
              const locked = o.cancelled || o.status === "RETURNED";
              const isBusy = busyId === o.id;
              const isChecked = selectedIds.has(o.id);
              const statusColor = SALES_STATUS_META[o.status].color;
              const displayCustomer =
                o.customerName || (o.source === "MANUAL" ? o.closerName || "أوردر يدوي" : "—");
              const showPhone = Boolean(o.customerPhone);
              const agentLabel =
                o.source === "MANUAL"
                  ? `يدوي${o.closerName ? ` — ${o.closerName}` : ""}`
                  : o.agentName || "—";

              return (
                <tr
                  key={o.id}
                  className={`transition-colors hover:bg-primary/5 dark:hover:bg-[#103027]/70 ${
                    isChecked
                      ? "bg-primary/10 dark:bg-[#12372c]/70"
                      : o.returnFlagged && o.status !== "RETURNED"
                        ? "bg-problem/[0.04]"
                        : ""
                  }`}
                >
                  {/* تحديد البوليصة للطباعة / PDF */}
                  <td className="px-3 py-3 text-center align-middle">
                    <input
                      type="checkbox"
                      aria-label={`تحديد بوليصة ${o.waybill || o.id}`}
                      checked={isChecked}
                      onChange={() => onToggleSelect(o.id)}
                      className="h-4 w-4 cursor-pointer accent-primary-deep"
                    />
                  </td>

                  {/* رقم البوليصة */}
                  <td className="whitespace-nowrap px-3 py-3 align-middle">
                    <div className="flex flex-col items-start gap-0.5">
                      <span className="font-bold tabular-nums text-primary-deep">{o.waybill || "—"}</span>
                      {o.source === "MANUAL" && (
                        <span className="rounded bg-border/60 px-1.5 py-0.5 text-[10px] font-medium text-muted">
                          يدوي
                        </span>
                      )}
                    </div>
                  </td>

                  {/* اسم العميل */}
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
                        {showPhone && (
                          <p dir="ltr" className="mt-0.5 flex items-center justify-end gap-1 text-[11px] tabular-nums text-muted">
                            <Phone size={10} />
                            <span>{o.customerPhone}</span>
                          </p>
                        )}
                      </div>
                    </div>
                  </td>

                  {/* الأوردر والقيمة */}
                  <td className="max-w-[230px] px-4 py-3 align-middle">
                    <p className="truncate font-medium text-text" title={o.boxName}>
                      {o.boxName || "—"}
                    </p>
                    <p className="mt-0.5 text-xs font-semibold tabular-nums text-muted">
                      {o.sellPrice === null ? "—" : fmtMoney(o.sellPrice)}
                      {o.totalDeposit > 0 && (
                        <span className="ms-1.5 text-accent">• المتبقي {fmtMoney(o.remainingTotal)}</span>
                      )}
                    </p>
                  </td>

                  {/* التاريخ */}
                  <td className="whitespace-nowrap px-4 py-3 align-middle text-xs text-muted">
                    {formatArabicDate(o.date, "EEEE، d MMMM yyyy")}
                  </td>

                  {/* الحالة (قائمة منسدلة) */}
                  <td className="whitespace-nowrap px-4 py-3 align-middle">
                    <div className="flex flex-col items-start gap-1">
                      {canAct && !locked ? (
                        <div className="relative inline-flex items-center">
                          <select
                            aria-label={`حالة الأوردر ${o.waybill || o.id}`}
                            disabled={isBusy}
                            value={o.status}
                            onChange={(e) => {
                              const next = e.target.value;
                              if ((next === "SHIPPED" || next === "DELIVERED") && next !== o.status) {
                                void runRow(o.id, () => onStatus(o, next));
                              }
                            }}
                            style={{
                              backgroundColor: `${statusColor}1f`,
                              color: statusColor,
                              borderColor: `${statusColor}55`,
                            }}
                            className="h-8 cursor-pointer appearance-none rounded-full border pl-7 pr-3 text-xs font-semibold outline-none transition-opacity focus:ring-2 focus:ring-primary-dark disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            {o.status === "EXECUTED" && (
                              <option value="EXECUTED" disabled className="bg-surface text-muted">
                                تم التنفيذ
                              </option>
                            )}
                            <option value="SHIPPED" className="bg-surface text-text">
                              شحن
                            </option>
                            <option value="DELIVERED" className="bg-surface text-text">
                              تم التسليم
                            </option>
                          </select>
                          <ChevronDown
                            size={13}
                            style={{ color: statusColor }}
                            className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2"
                            aria-hidden="true"
                          />
                        </div>
                      ) : (
                        <Badge color={badge.color}>{badge.label}</Badge>
                      )}
                      {o.returnFlagged && o.status !== "RETURNED" && !o.cancelled && (
                        <span className="inline-flex items-center gap-1 rounded-full border border-problem/40 bg-problem/10 px-2 py-0.5 text-[10px] font-semibold text-problem">
                          <Flag size={10} />
                          <span>مرتجع للمراجعة</span>
                        </span>
                      )}
                    </div>
                  </td>

                  {/* الفتاة */}
                  <td className="whitespace-nowrap px-4 py-3 align-middle text-xs font-medium text-text">
                    <div>{agentLabel}</div>
                    {o.salesPageName && (
                      <div className="mt-0.5 text-[11px] font-normal text-primary-deep">{o.salesPageName}</div>
                    )}
                  </td>

                  {/* سعر الشحن */}
                  <td className="whitespace-nowrap px-4 py-3 align-middle">
                    {canAct ? (
                      <ShippingCell
                        value={o.shippingPrice}
                        disabled={o.cancelled || o.status === "REGISTERED"}
                        onSave={(v) => onShipping(o, v)}
                      />
                    ) : (
                      <span className="tabular-nums text-muted">
                        {o.shippingPrice === null ? "—" : fmtMoney(o.shippingPrice)}
                      </span>
                    )}
                  </td>

                  {/* العربون (عربون الفتاة + عربون إضافي من المحاسب) */}
                  <td className="whitespace-nowrap px-4 py-3 align-middle">
                    {canAct ? (
                      <DepositCell
                        baseDeposit={o.deposit}
                        extraDeposit={o.extraDeposit}
                        disabled={o.cancelled || o.status === "REGISTERED"}
                        onSave={(v) => onExtraDeposit(o, v)}
                      />
                    ) : (
                      <span className="tabular-nums text-muted">
                        {o.totalDeposit > 0 ? fmtMoney(o.totalDeposit) : "—"}
                      </span>
                    )}
                  </td>

                  {/* إجراء: معاينة البوليصة + طباعة + مرتجع + سجل */}
                  <td className="whitespace-nowrap px-4 py-3 align-middle">
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        aria-label={`معاينة بوليصة ${o.waybill || o.id}`}
                        title="معاينة البوليصة"
                        onClick={() => setPreviewState({ id: o.id, tab: "preview" })}
                        className="flex h-8 w-8 items-center justify-center rounded-control border border-border text-muted transition-colors hover:border-primary-deep/50 hover:bg-primary/10 hover:text-primary-deep"
                      >
                        <Eye size={15} />
                      </button>
                      <button
                        type="button"
                        aria-label={`طباعة بوليصة ${o.waybill || o.id}`}
                        title="طباعة البوليصة"
                        onClick={() => onPrintOne(o)}
                        className="flex h-8 w-8 items-center justify-center rounded-control border border-border text-muted transition-colors hover:border-primary-deep/50 hover:bg-primary/10 hover:text-primary-deep"
                      >
                        <Printer size={15} />
                      </button>
                      {canAct && !o.cancelled && o.status !== "RETURNED" && (
                        <button
                          type="button"
                          disabled={isBusy}
                          onClick={() => void runRow(o.id, () => onFlag(o, !o.returnFlagged))}
                          aria-label={o.returnFlagged ? "إزالة علامة المرتجع" : "تعليم كمرتجع"}
                          title={o.returnFlagged ? "إزالة علامة المرتجع" : "تعليم كمرتجع"}
                          className={`flex h-8 w-8 items-center justify-center rounded-control border transition-colors ${
                            o.returnFlagged
                              ? "border-problem/50 bg-problem/15 text-problem hover:bg-problem/25"
                              : "border-border text-muted hover:border-problem/40 hover:text-problem"
                          }`}
                        >
                          <Flag size={13} />
                        </button>
                      )}
                      <button
                        type="button"
                        aria-label="سجل التغييرات"
                        title="سجل التغييرات"
                        onClick={() => setPreviewState({ id: o.id, tab: "log" })}
                        className="flex h-8 w-8 items-center justify-center rounded-control border border-border text-muted transition-colors hover:border-primary-deep/40 hover:text-text"
                      >
                        <History size={13} />
                      </button>
                      {canDeleteOrder && onDelete && (
                        <button
                          type="button"
                          disabled={isBusy}
                          onClick={() => onDelete(o)}
                          aria-label={`حذف الأوردر ${o.waybill || o.id}`}
                          title="حذف الأوردر نهائياً"
                          className="flex h-8 w-8 items-center justify-center rounded-control border border-problem/40 text-problem transition-colors hover:bg-problem/15 disabled:opacity-60"
                        >
                          <Trash2 size={14} />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {previewOrder && previewState && (
        <WaybillPreviewModal
          key={`${previewOrder.id}-${previewState.tab}`}
          open
          waybill={waybillFromFollowOrder(previewOrder)}
          canPrint
          canDownloadPdf
          followOrder={previewOrder}
          canAct={canAct}
          onFlag={onFlag}
          initialTab={previewState.tab}
          onClose={() => setPreviewState(null)}
        />
      )}
    </>
  );
}
