import { useCallback, useState } from "react";
import { AppLayout } from "../components/layout/AppLayout";
import { Header } from "../components/header/Header";
import { Badge } from "../components/ui/Badge";
import { Card } from "../components/ui/Card";
import { EmptyState } from "../components/ui/EmptyState";
import { Input } from "../components/ui/Field";
import { ErrorState, LoadingState } from "../components/ui/StatusViews";
import { StatTile } from "../components/agent/StatTile";
import { AgentDetailModal } from "../components/agent/AgentDetailModal";
import { PrefixManager } from "../components/agent/PrefixManager";
import { fmtMoney } from "../components/inventory/format";
import { usePermissions } from "../hooks/usePermissions";
import { useResource } from "../hooks/useResource";
import { accountingService } from "../services/agentService";
import type { AgentAccountRow, AgentAccountTotals } from "../types";

const EMPTY: { agents: AgentAccountRow[]; totals: AgentAccountTotals } = {
  agents: [],
  totals: { total: 0, delivered: 0, shipped: 0, returned: 0, cancelled: 0, deliveredSales: 0, fixedFee: 0, commission: 0, totalDue: 0 },
};

// حسابات الفتيات: جدول مجمّع لكل الفتيات (المحاسب والإدارة) + مجاميع الإدارة + فتح حساب أي فتاة.
export default function AgentAccountsPage() {
  const { isStaff } = usePermissions();
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [open, setOpen] = useState<AgentAccountRow | null>(null);

  const loader = useCallback(() => accountingService.agents({ from, to }), [from, to]);
  const accounts = useResource(loader, EMPTY);
  const t = accounts.data.totals;

  return (
    <AppLayout headerSlot={(openMobileNav) => <Header title="حسابات الفتيات" description="الأوردرات المسلّمة فقط تدخل في المقابل الثابت (7 ج) وعمولة 3%" onOpenMobileNav={openMobileNav} />}>
      {isStaff && <PrefixManager />}

      <div className="mb-4 flex flex-wrap items-center gap-3 text-sm">
        <span className="text-muted">الفترة:</span>
        <Input type="date" aria-label="من تاريخ" value={from} onChange={(e) => setFrom(e.target.value)} className="!w-40" />
        <Input type="date" aria-label="إلى تاريخ" value={to} onChange={(e) => setTo(e.target.value)} className="!w-40" />
        {(from || to) && (
          <button type="button" onClick={() => { setFrom(""); setTo(""); }} className="text-xs text-primary-deep underline">
            مسح الفترة
          </button>
        )}
      </div>

      {accounts.loading ? (
        <LoadingState />
      ) : accounts.error ? (
        <ErrorState message={accounts.error} onRetry={() => void accounts.retry()} />
      ) : (
        <>
          <section aria-label="مجاميع كل الفتيات" className="mb-5 grid grid-cols-2 gap-2.5 sm:grid-cols-4 lg:grid-cols-8">
            <StatTile label="إجمالي الأوردرات" value={t.total} />
            <StatTile label="مسلّمة" value={t.delivered} color="#1E8E5A" />
            <StatTile label="مشحونة" value={t.shipped} color="#D97706" />
            <StatTile label="مرتجعة" value={t.returned} color="#D64545" />
            <StatTile label="ملغاة" value={t.cancelled} color="#8A8F98" />
            <StatTile label="قيمة المبيعات المسلّمة" value={fmtMoney(t.deliveredSales)} />
            <StatTile label="إجمالي الثابت" value={fmtMoney(t.fixedFee)} />
            <StatTile label="إجمالي العمولات" value={fmtMoney(t.commission)} />
          </section>
          <div className="mb-5 max-w-xs">
            <StatTile label="إجمالي مستحقات جميع الفتيات" value={fmtMoney(t.totalDue)} color="#1E8E5A" />
          </div>

          {accounts.data.agents.length === 0 ? (
            <Card>
              <EmptyState title="لا توجد حسابات فتيات" description="أنشئ حساباً بدور «فتاة مبيعات» من إدارة المستخدمين." />
            </Card>
          ) : (
            <Card className="overflow-x-auto">
              <table className="w-full min-w-[820px] text-sm">
                <thead>
                  <tr className="border-b border-border text-xs text-muted">
                    {["الفتاة", "إجمالي الأوردرات", "المسلّمة", "المرتجعة", "قيمة المبيعات المسلّمة", "الثابت", "العمولة", "الإجمالي"].map((h) => (
                      <th key={h} className="px-3 py-2.5 text-start font-medium">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {accounts.data.agents.map((a) => (
                    <tr key={a.agentId} className="cursor-pointer border-b border-border last:border-b-0 hover:bg-primary/5" onClick={() => setOpen(a)}>
                      <td className="px-3 py-2.5 font-medium text-text">
                        <button type="button" className="text-start" onClick={(e) => { e.stopPropagation(); setOpen(a); }}>
                          {a.agentName}
                        </button>
                        {!a.isActive && <Badge color="#8A8F98" className="ms-2">معطّل</Badge>}
                        {a.prefix !== null && <span className="ms-2 text-xs text-muted tabular-nums">({a.prefix})</span>}
                      </td>
                      <td className="px-3 py-2.5 tabular-nums">{a.total}</td>
                      <td className="px-3 py-2.5 tabular-nums">{a.delivered}</td>
                      <td className="px-3 py-2.5 tabular-nums">{a.returned}</td>
                      <td className="px-3 py-2.5 tabular-nums">{fmtMoney(a.deliveredSales)}</td>
                      <td className="px-3 py-2.5 tabular-nums">{fmtMoney(a.fixedFee)}</td>
                      <td className="px-3 py-2.5 tabular-nums">{fmtMoney(a.commission)}</td>
                      <td className="px-3 py-2.5 font-bold tabular-nums">{fmtMoney(a.totalDue)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          )}
        </>
      )}

      {open && <AgentDetailModal key={open.agentId} open agentId={open.agentId} agentName={open.agentName} from={from} to={to} onClose={() => setOpen(null)} />}
    </AppLayout>
  );
}
