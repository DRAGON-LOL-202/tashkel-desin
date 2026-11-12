import { useCallback, useState } from "react";
import { AppLayout } from "../components/layout/AppLayout";
import { Header } from "../components/header/Header";
import { Input } from "../components/ui/Field";
import { ErrorState, LoadingState } from "../components/ui/StatusViews";
import { StatTile } from "../components/agent/StatTile";
import { fmtMoney } from "../components/inventory/format";
import { useResource } from "../hooks/useResource";
import { accountingService } from "../services/agentService";
import type { GeneralAccounts } from "../types";

const EMPTY: GeneralAccounts = { totalOrders: 0, deliveredCount: 0, shippedCount: 0, returnedCount: 0, cancelledCount: 0, deliveredSales: 0, totalShipping: 0, grandTotal: 0, salesPercent: 0, shippingPercent: 0 };

// الحسابات العامة: كل الأرقام من الباكند (نفس الفترة ونفس مجموعة الأوردرات). الشحن يُحتسب مرة واحدة للأوردر المسلَّم فقط.
export default function GeneralAccountsPage() {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const loader = useCallback(() => accountingService.general({ from, to }), [from, to]);
  const g = useResource<GeneralAccounts>(loader, EMPTY);
  const d = g.data;
  const pct = (n: number) => `${n.toLocaleString("en-US", { maximumFractionDigits: 2 })}%`;

  return (
    <AppLayout headerSlot={(openMobileNav) => <Header title="الحسابات العامة" description="المبيعات المسلّمة + الشحن (أوردرات مسلّمة فقط، بلا مرتجع أو ملغي)" onOpenMobileNav={openMobileNav} />}>
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
          <section aria-label="الإجماليات" className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
            <StatTile label="إجمالي المبيعات المسلّمة" value={fmtMoney(d.deliveredSales)} />
            <StatTile label="إجمالي الشحن" value={fmtMoney(d.totalShipping)} />
            <StatTile label="الإجمالي الكلي" value={fmtMoney(d.grandTotal)} color="#1E8E5A" hint="المبيعات + الشحن" />
            <StatTile label="نسبة المبيعات" value={pct(d.salesPercent)} />
            <StatTile label="نسبة الشحن" value={pct(d.shippingPercent)} />
          </section>
        </>
      )}
    </AppLayout>
  );
}
