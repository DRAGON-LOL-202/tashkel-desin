import { useState } from "react";
import { Check, Copy, Flag, History, MapPin, Package, Phone, StickyNote, User } from "lucide-react";
import { Modal } from "../ui/Modal";
import { Badge } from "../ui/Badge";
import { Button } from "../ui/Button";
import { fmtMoney, fmtQty } from "../inventory/format";
import { formatArabicDate, formatArabicTime } from "../../lib/date";
import { rowBadge } from "./meta";
import type { FollowOrder } from "../../types";

interface OrderDetailsModalProps {
  open: boolean;
  order: FollowOrder;
  canAct: boolean;
  onClose: () => void;
  onOpenLog: () => void;
  onFlag?: (o: FollowOrder, flagged: boolean) => Promise<void>;
}

// تفاصيل الأوردر كاملة كما أدخلتها الفتاة (العميل، الهاتف، العنوان، الملاحظات، البوكسات ومكوناتها، والتواريخ) — بلا أسعار مكونات أو تكاليف
export function OrderDetailsModal({ open, order: o, canAct, onClose, onOpenLog, onFlag }: OrderDetailsModalProps) {
  const [copiedPhone, setCopiedPhone] = useState(false);
  const [busyFlag, setBusyFlag] = useState(false);
  const badge = rowBadge(o.status, o.returnFlagged, o.cancelled);

  const copyPhone = async () => {
    if (!o.customerPhone) return;
    try {
      await navigator.clipboard.writeText(o.customerPhone);
      setCopiedPhone(true);
      setTimeout(() => setCopiedPhone(false), 1800);
    } catch {
      // ignore clipboard errors
    }
  };

  const toggleFlag = async () => {
    if (!onFlag || busyFlag) return;
    setBusyFlag(true);
    try {
      await onFlag(o, !o.returnFlagged);
    } finally {
      setBusyFlag(false);
    }
  };

  const agentLabel =
    o.source === "MANUAL"
      ? `أوردر يدوي${o.closerName ? ` — المقفل: ${o.closerName}` : ""}`
      : o.agentName || "—";

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`تفاصيل الأوردر ${o.waybill || "—"}`}
      description={o.source === "AGENT" ? "بيانات العميل ومحتويات الأوردر المدخلة من الفتاة" : "تفاصيل أوردر المبيعات اليدوي"}
      size="lg"
    >
      <div className="flex flex-col gap-4 text-sm">
        {/* شريط الحالة السريع */}
        <div className="flex flex-wrap items-center gap-2 rounded-control border border-border bg-background/60 px-3.5 py-2.5">
          <span className="font-bold tabular-nums text-primary-deep">#{o.waybill || "—"}</span>
          <span className="rounded-full border border-border bg-surface px-2.5 py-0.5 text-xs font-medium text-muted">
            {o.source === "AGENT" ? "أوردر فتاة" : "أوردر يدوي"}
          </span>
          <Badge color={badge.color}>{badge.label}</Badge>
          {o.counted && <Badge color="#1E8E5A">محسوب في المستحقات</Badge>}
        </div>

        {/* بيانات العميل */}
        <section className="rounded-control border border-border bg-background/40 p-3.5">
          <h3 className="mb-2.5 flex items-center gap-1.5 text-xs font-bold text-primary-deep">
            <User size={14} />
            <span>بيانات العميل</span>
          </h3>
          <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <dt className="text-xs text-muted">اسم العميل</dt>
              <dd className="mt-0.5 font-semibold text-text">{o.customerName || "—"}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted">رقم الهاتف</dt>
              <dd className="mt-0.5 flex items-center gap-2">
                {o.customerPhone ? (
                  <>
                    <a
                      href={`tel:${o.customerPhone}`}
                      dir="ltr"
                      className="inline-flex items-center gap-1 font-semibold tabular-nums text-primary-deep hover:underline"
                    >
                      <Phone size={13} />
                      <span>{o.customerPhone}</span>
                    </a>
                    <button
                      type="button"
                      onClick={() => void copyPhone()}
                      aria-label="نسخ رقم الهاتف"
                      title="نسخ رقم الهاتف"
                      className="inline-flex h-6 w-6 items-center justify-center rounded border border-border bg-surface text-muted hover:text-text"
                    >
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
              <dd className="mt-0.5 whitespace-pre-wrap text-text">{o.customerAddress || "—"}</dd>
            </div>
            <div className="sm:col-span-2">
              <dt className="flex items-center gap-1 text-xs text-muted">
                <StickyNote size={12} />
                <span>ملاحظات الأوردر</span>
              </dt>
              <dd className="mt-0.5 whitespace-pre-wrap text-text">{o.notes || "—"}</dd>
            </div>
          </dl>
        </section>

        {/* بيانات المتابعة والمبالغ */}
        <section className="rounded-control border border-border bg-background/40 p-3.5">
          <h3 className="mb-2.5 text-xs font-bold text-primary-deep">بيانات الفتاة والمتابعة</h3>
          <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <div>
              <dt className="text-xs text-muted">الفتاة / المصدر</dt>
              <dd className="mt-0.5 font-medium text-text">{agentLabel}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted">تاريخ الأوردر</dt>
              <dd className="mt-0.5 font-medium text-text">{formatArabicDate(o.date, "EEEE، d MMM yyyy")}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted">قيمة البيع</dt>
              <dd className="mt-0.5 font-bold tabular-nums text-text">
                {o.sellPrice === null ? "—" : fmtMoney(o.sellPrice)}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-muted">سعر الشحن</dt>
              <dd className="mt-0.5 font-semibold tabular-nums text-text">
                {o.shippingPrice === null ? "غير محدد" : fmtMoney(o.shippingPrice)}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-muted">تاريخ الشحن</dt>
              <dd className="mt-0.5 text-xs text-text">
                {o.shippedAt ? `${formatArabicDate(o.shippedAt, "d MMM yyyy")} • ${formatArabicTime(o.shippedAt)}` : "—"}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-muted">تاريخ التسليم</dt>
              <dd className="mt-0.5 text-xs text-text">
                {o.deliveredAt ? `${formatArabicDate(o.deliveredAt, "d MMM yyyy")} • ${formatArabicTime(o.deliveredAt)}` : "—"}
              </dd>
            </div>
          </dl>
          {(o.exportedAt || o.createdAt) && (
            <div className="mt-2.5 flex flex-wrap gap-4 border-t border-border/60 pt-2 text-[11px] text-muted">
              <span>أُنشئ: {formatArabicDate(o.createdAt, "d MMM yyyy")} {formatArabicTime(o.createdAt)}</span>
              {o.exportedAt && <span>صُدِّر: {formatArabicDate(o.exportedAt, "d MMM yyyy")} {formatArabicTime(o.exportedAt)}</span>}
            </div>
          )}
          {o.cancelReason && (
            <div className="mt-2.5 rounded-control border border-problem/30 bg-problem/10 px-3 py-2 text-xs text-problem">
              <strong>سبب الإلغاء:</strong> {o.cancelReason}
            </div>
          )}
        </section>

        {/* محتويات الأوردر (البوكسات ومكوّناتها) */}
        <section className="rounded-control border border-border bg-background/40 p-3.5">
          <h3 className="mb-2.5 flex items-center gap-1.5 text-xs font-bold text-primary-deep">
            <Package size={14} />
            <span>محتويات الأوردر</span>
          </h3>
          {o.lines.length > 0 ? (
            <div className="flex flex-col gap-2">
              {o.lines.map((line) => (
                <div key={line.id} className="rounded-control border border-border/80 bg-surface px-3 py-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold text-text">{line.productName}</span>
                    <span className="rounded-full bg-primary/15 px-2 py-0.5 text-xs font-bold tabular-nums text-primary-deep">
                      العدد: {line.quantity}
                    </span>
                  </div>
                  {line.components.length > 0 && (
                    <ul className="mt-1.5 flex flex-wrap gap-1.5">
                      {line.components.map((comp) => (
                        <li
                          key={comp.itemId}
                          className="rounded-full border border-border/70 bg-background/70 px-2.5 py-0.5 text-[11px] text-muted"
                        >
                          {comp.itemName}: <strong className="text-text">{fmtQty(comp.quantity)}</strong> {comp.unit}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <p className="text-text">{o.boxName || "—"}</p>
          )}
        </section>

        {/* أزرار سريعة */}
        <div className="flex flex-wrap items-center justify-end gap-2 border-t border-border pt-3">
          {canAct && onFlag && !o.cancelled && o.status !== "RETURNED" && (
            <Button
              size="sm"
              variant={o.returnFlagged ? "primary" : "danger"}
              icon={<Flag size={13} />}
              disabled={busyFlag}
              onClick={() => void toggleFlag()}
            >
              {o.returnFlagged ? "إزالة علامة المرتجع" : "تعليم كمرتجع"}
            </Button>
          )}
          <Button size="sm" variant="secondary" icon={<History size={13} />} onClick={onOpenLog}>
            سجل التغييرات
          </Button>
          <Button size="sm" variant="ghost" onClick={onClose}>
            إغلاق
          </Button>
        </div>
      </div>
    </Modal>
  );
}
