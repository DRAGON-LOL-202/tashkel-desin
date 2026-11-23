import { useCallback, useState } from "react";
import { Globe } from "lucide-react";
import { AppLayout } from "../components/layout/AppLayout";
import { Header } from "../components/header/Header";
import { Badge } from "../components/ui/Badge";
import { Card } from "../components/ui/Card";
import { Input, Select } from "../components/ui/Field";
import { ErrorState, LoadingState } from "../components/ui/StatusViews";
import { StatTile } from "../components/agent/StatTile";
import { fmtMoney } from "../components/inventory/format";
import { useResource } from "../hooks/useResource";
import type { SyncChannel } from "../lib/liveSync";
import { accountingService } from "../services/agentService";
import type { GeneralAccounts, GeneralAccountsResponse } from "../types";

const ACCOUNTING_CHANNELS: SyncChannel[] = ["accounting"];

const EMPTY_GENERAL: GeneralAccounts = {
  totalOrders: 0,
  deliveredCount: 0,
  shippedCount: 0,
  returnedCount: 0,
  cancelledCount: 0,
  deliveredSales: 0,
  deliveredExitPrice: 0,
  totalShipping: 0,
  grandTotal: 0,
  salesPercent: 0,
  shippingPercent: 0,
  priceDiff: 0,
  priceDiffPercent: 0,
};

const EMPTY: GeneralAccountsResponse = {
  general: EMPTY_GENERAL,
  byPage: [],
};

// الحسابات العامة: الإجمالي العام وحساب كل صفحة على حدة (سعر الخروج من المخزون، سعر الخروج، الشحن، الإجمالي الكلي، وفرق الصرف %).
export default function GeneralAccountsPage() {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [selectedPage, setSelectedPage] = useState("");

  const loader = useCallback(
    () => accountingService.general({ from, to, ...(selectedPage ? { salesPageId: selectedPage } : {}) }),
    [from, to, selectedPage]
  );
  const g = useResource<GeneralAccountsResponse>(loader, EMPTY, ACCOUNTING_CHANNELS);
  const d = g.data.general;
  const byPage = g.data.byPage;

  const pct = (n: number) => `${n.toLocaleString("en-US", { maximumFractionDigits: 2 })}%`;
  const signedPct = (n: number) => `${n > 0 ? "+" : ""}${pct(n)}`;
  const signedMoney = (n: number) => `${n > 0 ? "+" : ""}${fmtMoney(n)}`;
  const diffColor = d.priceDiffPercent > 0 ? "#1E8E5A" : d.priceDiffPercent < 0 ? "#D64545" : undefined;
  const activePageName = selectedPage
    ? byPage.find((p) => (p.pageId ?? "unassigned") === selectedPage)?.pageName ?? null
    : null;

  return (
    <AppLayout
      headerSlot={(openMobileNav) => (
        <Header
          title="الحسابات العامة"
          description="سعر الخروج من المخزون، سعر الخروج، الشحن، وفرق الصرف (أوردرات مسلّمة فقط، بلا مرتجع أو ملغي)"
          onOpenMobileNav={openMobileNav}
        />
      )}
    >
      <div className="mb-4 flex flex-wrap items-center gap-3 text-sm">
        <span className="text-muted">الفترة:</span>
        <Input type="date" aria-label="من تاريخ" value={from} onChange={(e) => setFrom(e.target.value)} className="!w-40" />
        <Input type="date" aria-label="إلى تاريخ" value={to} onChange={(e) => setTo(e.target.value)} className="!w-40" />
        <span className="text-muted">الصفحة:</span>
        <Select
          aria-label="تصفية بالصفحة"
          value={selectedPage}
          onChange={(e) => setSelectedPage(e.target.value)}
          className="!w-52 !py-1.5 text-sm"
        >
          <option value="">كل الصفحات</option>
          {byPage.map((p) => {
            const val = p.pageId ?? "unassigned";
            return (
              <option key={val} value={val}>
                {p.pageName}
                {!p.isActive ? " (موقوفة)" : ""}
              </option>
            );
          })}
        </Select>
        {(from || to || selectedPage) && (
          <button
            type="button"
            onClick={() => {
              setFrom("");
              setTo("");
              setSelectedPage("");
            }}
            className="text-xs text-primary-deep underline"
          >
            مسح التصفية
          </button>
        )}
      </div>

      {activePageName && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-control border border-primary-deep/30 bg-primary/10 px-3.5 py-2 text-xs">
          <span>
            عرض حسابات صفحة: <strong className="text-primary-deep">{activePageName}</strong>
          </span>
          <button type="button" onClick={() => setSelectedPage("")} className="font-semibold text-primary-deep underline">
            عرض كل الصفحات
          </button>
        </div>
      )}

      {g.loading ? (
        <LoadingState variant="stats" />
      ) : g.error ? (
        <ErrorState message={g.error} onRetry={() => void g.retry()} />
      ) : (
        <>
          <section aria-label="أعداد الأوردرات" className="mb-4 grid grid-cols-2 gap-2.5 sm:grid-cols-5">
            <StatTile label="إجمالي الأوردرات" value={d.totalOrders} />
            <StatTile label="المسلّمة" value={d.deliveredCount} color="#1E8E5A" />
            <StatTile label="المشحونة" value={d.shippedCount} color="#D97706" />
            <StatTile label="المرتجعة" value={d.returnedCount} color="#D64545" />
            <StatTile label="الملغاة" value={d.cancelledCount} color="#8A8F98" />
          </section>
          <section aria-label="الإجماليات" className="mb-4 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
            <StatTile label="سعر الخروج من المخزون" value={fmtMoney(d.deliveredSales)} hint="حسب مكوّنات المخزون" />
            <StatTile label="سعر الخروج" value={fmtMoney(d.deliveredExitPrice)} color="#2E8BC0" hint="السعر المعتمد للخروج" />
            <StatTile label="إجمالي الشحن" value={fmtMoney(d.totalShipping)} />
            <StatTile label="الإجمالي الكلي" value={fmtMoney(d.grandTotal)} color="#1E8E5A" hint="سعر الخروج + الشحن" />
          </section>
          <section aria-label="النسب وفرق الصرف" className="mb-6 grid grid-cols-1 gap-2.5 sm:grid-cols-3">
            <StatTile label="نسبة سعر الخروج" value={pct(d.salesPercent)} />
            <StatTile label="نسبة الشحن" value={pct(d.shippingPercent)} />
            <StatTile
              label="فرق صرف"
              value={signedPct(d.priceDiffPercent)}
              color={diffColor}
              hint={`${signedMoney(d.priceDiff)} مقارنة بسعر المخزون`}
            />
          </section>

          {/* حسابات كل صفحة على حدة */}
          <section aria-label="حسابات الصفحات (كل صفحة على حدة)">
            <div className="mb-2.5 flex flex-wrap items-center justify-between gap-2">
              <h2 className="flex items-center gap-1.5 text-base font-bold text-text">
                <Globe size={16} className="text-primary-deep" />
                <span>حسابات الصفحات (كل صفحة على حدة)</span>
              </h2>
              {byPage.length > 0 && <span className="text-xs text-muted">اضغط على أي صفحة لعرض تفاصيلها بالأعلى</span>}
            </div>

            {byPage.length === 0 ? (
              <Card>
                <p className="px-4 py-6 text-center text-sm text-muted">
                  لم تُضف صفحات بيع بعد — يمكنك إضافة أسماء الصفحات من صفحة «حسابات الفتيات».
                </p>
              </Card>
            ) : (
              <Card className="overflow-x-auto">
                <table className="w-full min-w-[920px] text-sm">
                  <thead>
                    <tr className="border-b border-border text-xs text-muted">
                      {[
                        "الصفحة",
                        "إجمالي الأوردرات",
                        "المسلّمة",
                        "المشحونة",
                        "المرتجعة",
                        "الملغاة",
                        "سعر الخروج من المخزون",
                        "سعر الخروج",
                        "الشحن",
                        "الإجمالي الكلي",
                        "فرق صرف %",
                      ].map((h) => (
                        <th key={h} className="px-3 py-2.5 text-start font-medium">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {byPage.map((p) => {
                      const rowKey = p.pageId ?? "unassigned";
                      const isRowSelected = selectedPage === rowKey;
                      const rowDiffColor = p.priceDiffPercent > 0 ? "#1E8E5A" : p.priceDiffPercent < 0 ? "#D64545" : undefined;
                      return (
                        <tr
                          key={rowKey}
                          onClick={() => setSelectedPage((cur) => (cur === rowKey ? "" : rowKey))}
                          className={`cursor-pointer border-b border-border last:border-b-0 transition-colors hover:bg-primary/5 ${
                            isRowSelected ? "bg-primary/10" : ""
                          }`}
                        >
                          <td className="px-3 py-2.5 font-semibold text-text">
                            <div className="flex items-center gap-2">
                              <span>{p.pageName}</span>
                              {!p.isActive && <Badge color="#8A8F98">موقوفة</Badge>}
                            </div>
                          </td>
                          <td className="px-3 py-2.5 tabular-nums">{p.totalOrders}</td>
                          <td className="px-3 py-2.5 font-medium tabular-nums text-[#1E8E5A]">{p.deliveredCount}</td>
                          <td className="px-3 py-2.5 tabular-nums text-[#D97706]">{p.shippedCount}</td>
                          <td className="px-3 py-2.5 tabular-nums text-[#D64545]">{p.returnedCount}</td>
                          <td className="px-3 py-2.5 tabular-nums text-muted">{p.cancelledCount}</td>
                          <td className="px-3 py-2.5 tabular-nums">{fmtMoney(p.deliveredSales)}</td>
                          <td className="px-3 py-2.5 font-semibold tabular-nums text-[#2E8BC0]">{fmtMoney(p.deliveredExitPrice)}</td>
                          <td className="px-3 py-2.5 tabular-nums">{fmtMoney(p.totalShipping)}</td>
                          <td className="px-3 py-2.5 font-bold tabular-nums text-[#1E8E5A]">{fmtMoney(p.grandTotal)}</td>
                          <td className="px-3 py-2.5 font-semibold tabular-nums" style={rowDiffColor ? { color: rowDiffColor } : undefined}>
                            {signedPct(p.priceDiffPercent)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </Card>
            )}
          </section>
        </>
      )}
    </AppLayout>
  );
}
