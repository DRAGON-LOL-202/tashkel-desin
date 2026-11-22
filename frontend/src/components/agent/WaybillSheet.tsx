import { COMPLAINT_PHONES, fmtInvoiceAmount, fmtUnitPrice, formatWaybillDate, type WaybillData } from "../../lib/waybillPdf";

// نموذج البوليصة/الفاتورة A6 المطابق للمرجع البصري للطباعة والمعاينة
export function WaybillSheet({ data }: { data: WaybillData }) {
  const labelCell = "border border-black px-2 py-2 text-center text-[13px] font-bold text-[#b91c1c]";
  const valCell = "border border-black px-2 py-2 text-center text-[13px] font-bold text-black";

  return (
    <div
      dir="rtl"
      className="mx-auto flex min-h-[545px] w-[397px] max-w-full flex-col border-2 border-black bg-white p-2.5 text-black shadow-md"
    >
      {/* الرأس: فاتورة + رقم البوليصة يميناً، والشعار يساراً */}
      <div className="flex items-start justify-between gap-2 pb-1">
        <div className="pt-1 text-right leading-tight">
          <p className="text-[22px] font-extrabold text-black">فاتورة</p>
          <p dir="ltr" className="mt-0.5 text-[11px] font-semibold text-neutral-600 tabular-nums">
            #{data.waybill || "—"}
          </p>
        </div>
        <img
          src="/tashkeel-cnc-logo.svg"
          alt="TASHKEEL.CNC"
          className="h-14 w-24 object-contain grayscale contrast-125 brightness-75"
        />
      </div>

      {/* رقم الشكوى */}
      <p dir="rtl" className="pb-1.5 text-center text-[12px] font-bold text-black">
        رقم الشكوى : (<span dir="ltr">{COMPLAINT_PHONES}</span>)
      </p>

      {/* جدول بيانات العميل والأصناف */}
      <table className="w-full border-collapse border border-black table-fixed">
        <colgroup>
          <col className="w-[21%]" />
          <col className="w-[37%]" />
          <col className="w-[17%]" />
          <col className="w-[25%]" />
        </colgroup>
        <tbody>
          <tr>
            <th scope="row" className={labelCell}>التاريخ</th>
            <td dir="ltr" className={`${valCell} tabular-nums`}>{formatWaybillDate(data.date)}</td>
            <th scope="row" className={labelCell}>بوليصه</th>
            <td dir="ltr" className={`${valCell} tabular-nums`}>{data.waybill || "—"}</td>
          </tr>
          <tr>
            <th scope="row" className={labelCell}>إسم العميل</th>
            <td colSpan={3} className={`${valCell} break-words`}>{data.customerName || "—"}</td>
          </tr>
          <tr>
            <th scope="row" className={labelCell}>العنوان</th>
            <td colSpan={3} className={`${valCell} break-words text-[12px]`}>{data.customerAddress || "—"}</td>
          </tr>
          <tr>
            <th scope="row" className={labelCell}>تليفون</th>
            <td colSpan={3} dir="ltr" className={`${valCell} tabular-nums break-words`}>{data.customerPhone || "—"}</td>
          </tr>
          <tr>
            <th scope="col" className={labelCell}>الكمية</th>
            <th scope="col" className={labelCell}>إسم الصنف</th>
            <th scope="col" className={labelCell}>السعر</th>
            <th scope="col" className={labelCell}>الإجمالى</th>
          </tr>
          {data.lines.map((line, idx) => (
            <tr key={`${idx}-${line.productName}`}>
              <td className={`${valCell} tabular-nums`}>{line.quantity}</td>
              <td className={`${valCell} break-words`}>{line.productName}</td>
              <td dir="ltr" className={`${valCell} tabular-nums`}>{fmtUnitPrice(line.unitPrice)}</td>
              <td dir="ltr" className="border border-black px-2 py-2 text-center text-[13px] font-extrabold tabular-nums text-[#b91c1c]">
                {fmtInvoiceAmount(line.lineTotal)}
              </td>
            </tr>
          ))}
          <tr>
            <th scope="row" className={labelCell}>م شحن</th>
            <td dir="ltr" className={`${valCell} tabular-nums`}>
              {data.shippingPrice === null ? "—" : fmtInvoiceAmount(data.shippingPrice)}
            </td>
            <th scope="row" className={`${labelCell} leading-tight`}>
              الاجمالى بالشحن
            </th>
            <td dir="ltr" className="border border-black px-2 py-2 text-center text-[14px] font-extrabold tabular-nums text-[#b91c1c]">
              {fmtInvoiceAmount(data.grandTotal)}
            </td>
          </tr>
        </tbody>
      </table>

      {/* خانة الملاحظات الممتدة لملء بقية ورقة A6 */}
      <div className="flex flex-1 border-x border-b border-black">
        <div className="flex w-[21%] shrink-0 items-center justify-center border-l border-black px-2 py-3 text-center text-[13px] font-bold text-[#b91c1c]">
          الملاحظات
        </div>
        <div className="flex flex-1 items-center justify-center px-3 py-3 text-center text-[13px] font-bold leading-relaxed whitespace-pre-wrap break-words text-black">
          {data.notes || "—"}
        </div>
      </div>
    </div>
  );
}
