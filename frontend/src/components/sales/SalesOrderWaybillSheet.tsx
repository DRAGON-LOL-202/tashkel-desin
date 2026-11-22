import { fmtQty } from "../inventory/format";
import type { SalesOrder } from "../../types";

function formatOrderSheetDate(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return iso || "—";
  return `${Number(m[2])}/${Number(m[3])}/${m[1]}`;
}

/**
 * معاينة بوليصة تجهيز مستقلة خاصة بصفحة «أوردرات مبيعات إلكترونية»:
 * تعرض بيانات العميل، اسم البوكس، والمحتويات المحددة أسفل كل بوكس — بدون أي أسعار أو مبالغ،
 * ومنفصلة تماماً عن بوالص حسابات الفتيات ومتابعة محاسب المبيعات.
 */
export function SalesOrderWaybillSheet({ order }: { order: SalesOrder }) {
  const labelCell = "border border-black px-2 py-2 text-center text-[13px] font-bold text-[#b91c1c]";
  const valCell = "border border-black px-2 py-2 text-center text-[13px] font-bold text-black";
  const displayNotes = (order.fromAgent ? order.customerNotes : order.notes) || "—";

  return (
    <div
      dir="rtl"
      className="mx-auto flex min-h-[545px] w-[397px] max-w-full flex-col border-2 border-black bg-white p-2.5 text-black shadow-md"
    >
      {/* الرأس: عنوان مستقل + رقم البوليصة يميناً، والشعار يساراً */}
      <div className="flex items-start justify-between gap-2 pb-2">
        <div className="pt-1 text-right leading-tight">
          <p className="text-[19px] font-extrabold text-black">بوليصة تجهيز أوردر</p>
          <p dir="ltr" className="mt-0.5 text-[11px] font-semibold tabular-nums text-neutral-600">
            #{order.waybill || "—"}
          </p>
        </div>
        <img
          src="/tashkeel-cnc-logo.svg"
          alt="TASHKEEL.CNC"
          width={96}
          height={56}
          decoding="async"
          className="h-14 w-24 object-contain grayscale contrast-125 brightness-75"
        />
      </div>

      {/* جدول بيانات العميل والمنتجات ومحتوياتها بدون أي مبالغ مالية */}
      <table className="w-full table-fixed border-collapse border border-black">
        <colgroup>
          <col className="w-[21%]" />
          <col className="w-[37%]" />
          <col className="w-[17%]" />
          <col className="w-[25%]" />
        </colgroup>
        <tbody>
          <tr>
            <th scope="row" className={labelCell}>التاريخ</th>
            <td dir="ltr" className={`${valCell} tabular-nums`}>{formatOrderSheetDate(order.date)}</td>
            <th scope="row" className={labelCell}>بوليصة</th>
            <td dir="ltr" className={`${valCell} tabular-nums`}>{order.waybill || "—"}</td>
          </tr>
          <tr>
            <th scope="row" className={labelCell}>إسم العميل</th>
            <td colSpan={3} className={`${valCell} break-words`}>{order.customerName || "—"}</td>
          </tr>
          <tr>
            <th scope="row" className={labelCell}>العنوان</th>
            <td colSpan={3} className={`${valCell} break-words text-[12px]`}>{order.customerAddress || "—"}</td>
          </tr>
          <tr>
            <th scope="row" className={labelCell}>تليفون</th>
            <td colSpan={3} dir="ltr" className={`${valCell} tabular-nums break-words`}>{order.customerPhone || "—"}</td>
          </tr>
          <tr>
            <th scope="col" className={labelCell}>الكمية</th>
            <th scope="col" colSpan={3} className={labelCell}>إسم الصنف والمحتويات المحددة</th>
          </tr>
          {order.lines.map((line) => (
            <tr key={line.id}>
              <td className={`${valCell} align-top tabular-nums`}>{line.quantity}</td>
              <td colSpan={3} className="border border-black px-2.5 py-2 text-right text-[13px] font-bold text-black">
                <p className="text-center text-[13px] font-extrabold text-black">{line.productName}</p>
                {line.components.length > 0 && (
                  <div className="mt-1.5 rounded border border-neutral-300 bg-neutral-50 px-2 py-1.5 text-right">
                    <p className="text-[11px] font-bold text-[#b91c1c]">المحتويات المحددة:</p>
                    <ul className="mt-1 flex flex-col gap-0.5 text-[11px] font-semibold leading-snug text-neutral-800">
                      {line.components.map((c) => (
                        <li key={c.id} className="flex items-center justify-between gap-2">
                          <span className="truncate">• {c.itemName}{c.damaged ? " (تالف)" : ""}</span>
                          <span dir="ltr" className="shrink-0 font-bold tabular-nums text-black">
                            × {fmtQty(c.quantity * line.quantity)} {c.unit}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* خانة الملاحظات الممتدة لملء بقية النموذج */}
      <div className="flex flex-1 border-x border-b border-black">
        <div className="flex w-[21%] shrink-0 items-center justify-center border-l border-black px-2 py-3 text-center text-[13px] font-bold text-[#b91c1c]">
          الملاحظات
        </div>
        <div className="flex flex-1 items-center justify-center whitespace-pre-wrap break-words px-3 py-3 text-center text-[13px] font-bold leading-relaxed text-black">
          {displayNotes}
        </div>
      </div>
    </div>
  );
}
