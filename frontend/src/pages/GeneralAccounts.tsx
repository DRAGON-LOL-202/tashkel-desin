import { useCallback, useState } from "react";
import { AppLayout } from "../components/layout/AppLayout";
import { Header } from "../components/header/Header";
import { Input } from "../components/ui/Field";
import { ErrorState, LoadingState } from "../components/ui/StatusViews";
import { StatTile } from "../components/agent/StatTile";
import { fmtMoney } from "../components/inventory/format";
import { useResource } from "../hooks/useResource";
import type { SyncChannel } from "../lib/liveSync";
import { accountingService } from "../services/agentService";
import type { GeneralAccounts } from "../types";

const ACCOUNTING_CHANNELS: SyncChannel[] = ["accounting"];

const EMPTY: GeneralAccounts = {
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

// الحسابات العامة: سعر الخروج من المخزون، سعر الخروج (الذي أدخلته الفتاة)، الشحن، الإجمالي الكلي (سعر الخروج + الشحن)، وفرق الصرف %.
export default function GeneralAccountsPage() {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const loader = useCallback(() => accountingService.general({ from, to }), [from, to]);
  const g = useResource<GeneralAccounts>(loader, EMPTY, ACCOUNTING_CHANNELS);
  const d = g.data;
  const pct = (n: number) => `${n.toLocaleString("en-US", { maximumFractionDigits: 2 })}%`;
  const signedPct = (n: number) => `${n > 0 ? "+" : ""}${pct(n)}`;
  const signedMoney = (n: number) => `${n > 0 ? "+" : ""}${fmtMoney(n)}`;
  const diffColor = d.priceDiffPercent > 0 ? "#1E8E5A" : d.priceDiffPercent < 0 ? "#D64545" : undefined;

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
      </div>
      {g.loading ? (
        <LoadingState />
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
            <StatTile label="سعر الخروج" value={fmtMoney(d.deliveredExitPrice)} color="#2E8BC0" hint="السعر الذي أدخلته الفتاة" />
            <StatTile label="إجمالي الشحن" value={fmtMoney(d.totalShipping)} />
            <StatTile label="الإجمالي الكلي" value={fmtMoney(d.grandTotal)} color="#1E8E5A" hint="سعر الخروج + الشحن" />
          </section>
          <section aria-label="النسب وفرق الصرف" className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
            <StatTile label="نسبة سعر الخروج" value={pct(d.salesPercent)} />
            <StatTile label="نسبة الشحن" value={pct(d.shippingPercent)} />
            <StatTile
              label="فرق صرف"
              value={signedPct(d.priceDiffPercent)}
              color={diffColor}
              hint={`${signedMoney(d.priceDiff)} مقارنة بسعر المخزون`}
            />
          </section>
        </>
      )}
    </AppLayout>
  );
}
