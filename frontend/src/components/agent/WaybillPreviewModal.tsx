import { useCallback, useEffect, useState } from "react";
import { Check, Copy, Download, Eye, Flag, History, MapPin, Package, Pencil, Phone, Printer, StickyNote, User, X } from "lucide-react";
import { Badge } from "../ui/Badge";
import { Button } from "../ui/Button";
import { ErrorState, LoadingState } from "../ui/StatusViews";
import { useToast } from "../ui/ToastProvider";
import { useResource } from "../../hooks/useResource";
import { accountingService } from "../../services/agentService";
import { formatArabicDate, formatArabicTime } from "../../lib/date";
import { downloadWaybillsPdf, printWaybills, type WaybillData } from "../../lib/waybillPdf";
import { fmtMoney, fmtQty } from "../inventory/format";
import { SALES_STATUS_META } from "../sales/status";
import { rowBadge } from "./meta";
import { WaybillSheet } from "./WaybillSheet";
import type { FollowOrder, OrderLogEntry, SalesOrderStatus } from "../../types";

type PreviewTab = "preview" | "details" | "log";

interface WaybillPreviewModalProps {
  open: boolean;
  onClose: () => void;
  waybill: WaybillData;
  /** صلاحيات الطباعة والتحميل PDF للمحاسب والإدارة فقط؛ تبقى false للفتاة */
  canPrint?: boolean;
  canDownloadPdf?: boolean;
  /** تعديل المسودة (يُمرَّر للفتاة فقط عندما يكون الأوردر مسودة) */
  onEdit?: () => void;
  /** بيانات المتابعة الإضافية (تُمرَّر للمحاسب والإدارة فقط في متابعة الأوردرات/حساب الفتاة) */
  followOrder?: FollowOrder;
  canAct?: boolean;
  onFlag?: (o: FollowOrder, flagged: boolean) => Promise<void>;
  initialTab?: PreviewTab;
  statusLabel?: string;
  statusColor?: string;
}

const NONE_LOGS: OrderLogEntry[] = [];
const statusText = (v: string | null) => (v && v in SALES_STATUS_META ? SALES_STATUS_META[v as SalesOrderStatus].label : (v ?? "—"));

function describeLog(l: OrderLogEntry): string {
  if (l.event === "STATUS") return `تغيير الحالة: ${statusText(l.from)} ← ${statusText(l.to)}`;
  if (l.event === "RETURN_FLAG") return l.to === "true" ? "وضع علامة مرتجع" : "إزالة علامة مرتجع";
  if (l.event === "SHIPPING_PRICE") return `سعر الشحن: ${l.from ?? "غير محدد"} ← ${l.to ?? "غير محدد"}`;
  if (l.event === "EXPORT") return `تصدير الأوردر للمبيعات${l.to ? ` (بوليصة ${l.to})` : ""}`;
  if (l.event === "CANCEL") return `إلغاء الأوردر${l.to ? `: ${l.to}` : ""}`;
  return l.event;
}

function FollowOrderLogPanel({ orderId }: { orderId: string }) {
  const loader = useCallback(() => accountingService.log(orderId), [orderId]);
  const log = useResource<OrderLogEntry[]>(loader, NONE_LOGS);
  if (log.loading) return <LoadingState />;
  if (log.error) return <ErrorState message={log.error} onRetry={() => void log.retry()} />;
  if (log.data.length === 0) return <p className="py-8 text-center text-sm text-muted">لا توجد تغييرات مسجلة بعد.</p>;
  return (
    <ol className="mx-auto flex max-w-2xl flex-col gap-2">
      {log.data.map((l) => (
        <li key={l.id} className="rounded-control border border-border bg-surface px-3.5 py-2.5 text-sm">
          <p className="font-medium text-text">{describeLog(l)}</p>
          <p className="mt-0.5 text-xs text-muted">
            {l.by} • {formatArabicDate(l.at)} {formatArabicTime(l.at)}
          </p>
        </li>
      ))}
    </ol>
  );
}

// نافذة معاينة البوليصة (A6) مع أزرار الطباعة وPDF للمحاسب والإدارة، ومعاينة صافية للفتاة دون أي توسيع للصلاحيات
export function WaybillPreviewModal({
  open,
  onClose,
  waybill,
  canPrint = false,
  canDownloadPdf = false,
  onEdit,
  followOrder,
  canAct = false,
  onFlag,
  initialTab = "preview",
  statusLabel,
  statusColor,
}: WaybillPreviewModalProps) {
  const { show } = useToast();
  const [tab, setTab] = useState<PreviewTab>(initialTab);
  const [busyPrint, setBusyPrint] = useState(false);
  const [busyPdf, setBusyPdf] = useState(false);
  const [busyFlag, setBusyFlag] = useState(false);
  const [copiedPhone, setCopiedPhone] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);

  if (!open) return null;

  const followBadge = followOrder ? rowBadge(followOrder.status, followOrder.returnFlagged, followOrder.cancelled) : null;
  const effectiveStatusLabel = statusLabel ?? followBadge?.label;
  const effectiveStatusColor = statusColor ?? followBadge?.color;

  const handlePrint = async () => {
    if (!canPrint || busyPrint) return;
    setBusyPrint(true);
    try {
      await printWaybills([waybill]);
    } catch {
      show("تعذّر تجهيز الطباعة", "error");
    } finally {
      setBusyPrint(false);
    }
  };

  const handlePdf = async () => {
    if (!canDownloadPdf || busyPdf) return;
    setBusyPdf(true);
    try {
      await downloadWaybillsPdf([waybill]);
      show("تم تحميل ملف البوليصة PDF");
    } catch {
      show("تعذّر إنشاء ملف PDF", "error");
    } finally {
      setBusyPdf(false);
    }
  };

  const handleCopyPhone = async () => {
    const phone = followOrder?.customerPhone || waybill.customerPhone;
    if (!phone) return;
    try {
      await navigator.clipboard.writeText(phone);
      setCopiedPhone(true);
      setTimeout(() => setCopiedPhone(false), 1800);
    } catch {
      // ignore clipboard errors
    }
  };

  const handleToggleFlag = async () => {
    if (!followOrder || !onFlag || busyFlag) return;
    setBusyFlag(true);
    try {
      await onFlag(followOrder, !followOrder.returnFlagged);
    } finally {
      setBusyFlag(false);
    }
  };

  return (
    <div
      dir="rtl"
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 animate-fade-in"
      role="dialog"
      aria-modal="true"
      aria-labelledby="waybill-preview-title"
    >
      <div className="absolute inset-0 bg-[#0d1512]/60 backdrop-blur-[2px]" onClick={onClose} />
      <div className="relative flex max-h-[92vh] w-full max-w-4xl flex-col overflow-hidden rounded-card border border-border bg-surface shadow-pop animate-scale-in">
        {/* الشريط العلوي */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3.5 sm:px-6">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 id="waybill-preview-title" className="text-base font-bold text-text sm:text-lg">
                فاتورة / بوليصة رقم {waybill.waybill || "—"}
              </h2>
              <span className="rounded-full border border-amber-500/40 bg-amber-500/15 px-2.5 py-0.5 text-xs font-bold tabular-nums text-amber-600 dark:text-amber-300">
                بوليصة: {waybill.waybill || "—"}
              </span>
              {effectiveStatusLabel && <Badge color={effectiveStatusColor}>{effectiveStatusLabel}</Badge>}
            </div>
            <p className="mt-1 truncate text-xs text-muted">
              العميل: <strong className="text-text">{waybill.customerName || "—"}</strong> • الإجمالي:{" "}
              <strong className="tabular-nums text-primary-deep">{fmtMoney(waybill.grandTotal)}</strong>
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {canPrint && (
              <Button size="sm" icon={<Printer size={14} />} disabled={busyPrint} onClick={() => void handlePrint()}>
                {busyPrint ? "جارٍ التجهيز..." : "طباعة"}
              </Button>
            )}
            {canDownloadPdf && (
              <Button size="sm" variant="secondary" icon={<Download size={14} />} disabled={busyPdf} onClick={() => void handlePdf()}>
                {busyPdf ? "جارٍ التحميل..." : "PDF"}
              </Button>
            )}
            {onEdit && (
              <Button size="sm" variant="secondary" icon={<Pencil size={14} />} onClick={onEdit}>
                تعديل
              </Button>
            )}
            <button
              type="button"
              onClick={onClose}
              aria-label="إغلاق"
              className="flex h-8 w-8 items-center justify-center rounded-full text-muted transition-colors hover:bg-border/60 hover:text-text"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* تبويبات المحاسب/الإدارة (عند تمرير followOrder فقط) */}
        {followOrder && (
          <div className="flex items-center gap-4 border-b border-border px-4 sm:px-6" role="tablist">
            {[
              { key: "preview" as const, label: "معاينة الطباعة (A6)", icon: Eye },
              { key: "details" as const, label: "تفاصيل الفاتورة", icon: Package },
              { key: "log" as const, label: "سجل التعديلات", icon: History },
            ].map((item) => {
              const Icon = item.icon;
              const active = tab === item.key;
              return (
                <button
                  key={item.key}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => setTab(item.key)}
                  className={`inline-flex items-center gap-1.5 border-b-2 py-2.5 text-xs font-semibold transition-colors sm:text-sm ${
                    active
                      ? "border-primary-deep text-primary-deep"
                      : "border-transparent text-muted hover:text-text"
                  }`}
                >
                  <Icon size={14} />
                  <span>{item.label}</span>
                </button>
              );
            })}
          </div>
        )}

        {/* المحتوى */}
        <div className="flex-1 overflow-y-auto bg-background/70 p-4 sm:p-6">
          {tab === "preview" && (
            <div className="flex justify-center">
              <WaybillSheet data={waybill} />
            </div>
          )}

          {tab === "details" && followOrder && (
            <div className="mx-auto flex max-w-2xl flex-col gap-4 text-sm">
              <section className="rounded-control border border-border bg-surface p-4">
                <h3 className="mb-2.5 flex items-center gap-1.5 text-xs font-bold text-primary-deep">
                  <User size={14} />
                  <span>بيانات العميل</span>
                </h3>
                <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <dt className="text-xs text-muted">اسم العميل</dt>
                    <dd className="mt-0.5 font-semibold text-text">{followOrder.customerName || "—"}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted">رقم الهاتف</dt>
                    <dd className="mt-0.5 flex items-center gap-2">
                      {followOrder.customerPhone ? (
                        <>
                          <a href={`tel:${followOrder.customerPhone}`} dir="ltr" className="inline-flex items-center gap-1 font-semibold tabular-nums text-primary-deep hover:underline">
                            <Phone size={13} />
                            <span>{followOrder.customerPhone}</span>
                          </a>
                          <button type="button" onClick={() => void handleCopyPhone()} aria-label="نسخ رقم الهاتف" className="inline-flex h-6 w-6 items-center justify-center rounded border border-border bg-background text-muted hover:text-text">
                            {copiedPhone ? <Check size={12} className="text-primary-deep" /> : <Copy size={12} />}
                          </button>
                        </>
                      ) : (
                        <span className="text-muted">—</span>
                      )}
                    </dd>
                  </div>
                  <div className="sm:col-span-2">
                    <dt className="flex items-center gap-1 text-xs text-muted">
                      <MapPin size={12} />
                      <span>العنوان</span>
                    </dt>
                    <dd className="mt-0.5 whitespace-pre-wrap text-text">{followOrder.customerAddress || "—"}</dd>
                  </div>
                  <div className="sm:col-span-2">
                    <dt className="flex items-center gap-1 text-xs text-muted">
                      <StickyNote size={12} />
                      <span>ملاحظات الأوردر</span>
                    </dt>
                    <dd className="mt-0.5 whitespace-pre-wrap text-text">{followOrder.notes || "—"}</dd>
                  </div>
                </dl>
              </section>

              <section className="rounded-control border border-border bg-surface p-4">
                <h3 className="mb-2.5 text-xs font-bold text-primary-deep">المبالغ والتواريخ</h3>
                <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <div>
                    <dt className="text-xs text-muted">سعر الخروج</dt>
                    <dd className="mt-0.5 font-bold tabular-nums text-text">{followOrder.sellPrice === null ? "—" : fmtMoney(followOrder.sellPrice)}</dd>
                  </div>
                  {followOrder.inventorySellPrice !== null && (
                    <div>
                      <dt className="text-xs text-muted">سعر المخزون</dt>
                      <dd className="mt-0.5 font-semibold tabular-nums text-muted">{fmtMoney(followOrder.inventorySellPrice)}</dd>
                    </div>
                  )}
                  <div>
                    <dt className="text-xs text-muted">سعر الشحن</dt>
                    <dd className="mt-0.5 font-semibold tabular-nums text-text">{followOrder.shippingPrice === null ? "غير محدد" : fmtMoney(followOrder.shippingPrice)}</dd>
                  </div>
                  {followOrder.sellPrice !== null && (
                    <div>
                      <dt className="text-xs text-muted">الإجمالي بالشحن</dt>
                      <dd className="mt-0.5 font-bold tabular-nums text-primary-deep">{fmtMoney(followOrder.sellPrice + (followOrder.shippingPrice ?? 0))}</dd>
                    </div>
                  )}
                </dl>
                <div className="mt-3 flex flex-wrap gap-4 border-t border-border/60 pt-2.5 text-xs text-muted">
                  <span>الفتاة: <strong className="text-text">{followOrder.source === "MANUAL" ? `يدوي${followOrder.closerName ? ` — ${followOrder.closerName}` : ""}` : followOrder.agentName || "—"}</strong></span>
                  <span>أُنشئ: {formatArabicDate(followOrder.createdAt, "d MMM yyyy")} {formatArabicTime(followOrder.createdAt)}</span>
                  {followOrder.shippedAt && <span>شُحن: {formatArabicDate(followOrder.shippedAt, "d MMM yyyy")}</span>}
                  {followOrder.deliveredAt && <span>سُلِّم: {formatArabicDate(followOrder.deliveredAt, "d MMM yyyy")}</span>}
                </div>
                {followOrder.cancelReason && (
                  <p className="mt-2 rounded bg-problem/10 px-3 py-1.5 text-xs text-problem">
                    <strong>سبب الإلغاء:</strong> {followOrder.cancelReason}
                  </p>
                )}
              </section>

              <section className="rounded-control border border-border bg-surface p-4">
                <h3 className="mb-2.5 flex items-center gap-1.5 text-xs font-bold text-primary-deep">
                  <Package size={14} />
                  <span>محتويات الأوردر</span>
                </h3>
                <div className="flex flex-col gap-2">
                  {followOrder.lines.map((line) => (
                    <div key={line.id} className="rounded-control border border-border/80 bg-background/50 px-3 py-2">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="font-semibold text-text">{line.productName}</span>
                        <div className="flex flex-wrap items-center gap-2">
                          {line.boxPrice != null && (
                            <span className="text-xs tabular-nums text-muted">
                              سعر البوكس: <strong className="text-text">{fmtMoney(line.boxPrice)}</strong>
                            </span>
                          )}
                          <span className="rounded-full bg-primary/15 px-2 py-0.5 text-xs font-bold tabular-nums text-primary-deep">
                            العدد: {line.quantity}
                          </span>
                        </div>
                      </div>
                      {line.components.length > 0 && (
                        <ul className="mt-1.5 flex flex-wrap gap-1.5">
                          {line.components.map((comp) => (
                            <li key={comp.itemId} className="rounded-full border border-border/70 bg-surface px-2.5 py-0.5 text-[11px] text-muted">
                              {comp.itemName}: <strong className="text-text">{fmtQty(comp.quantity)}</strong> {comp.unit}
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  ))}
                </div>
              </section>

              {canAct && onFlag && !followOrder.cancelled && followOrder.status !== "RETURNED" && (
                <div className="flex justify-end">
                  <Button
                    size="sm"
                    variant={followOrder.returnFlagged ? "primary" : "danger"}
                    icon={<Flag size={13} />}
                    disabled={busyFlag}
                    onClick={() => void handleToggleFlag()}
                  >
                    {followOrder.returnFlagged ? "إزالة علامة المرتجع" : "تعليم كمرتجع"}
                  </Button>
                </div>
              )}
            </div>
          )}

          {tab === "log" && followOrder && <FollowOrderLogPanel orderId={followOrder.id} />}
        </div>
      </div>
    </div>
  );
}
