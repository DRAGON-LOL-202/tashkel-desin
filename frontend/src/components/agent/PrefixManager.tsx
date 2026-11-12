import { useState } from "react";
import { Check } from "lucide-react";
import { Badge } from "../ui/Badge";
import { Button } from "../ui/Button";
import { Card } from "../ui/Card";
import { Input } from "../ui/Field";
import { LoadingState, ErrorState } from "../ui/StatusViews";
import { useToast } from "../ui/ToastProvider";
import { useResource } from "../../hooks/useResource";
import { useSafeAction } from "../../hooks/useSafeAction";
import { agentAdminService } from "../../services/agentService";
import type { AgentAdminRow } from "../../types";

const NONE: AgentAdminRow[] = [];

function PrefixRow({ agent, onSaved }: { agent: AgentAdminRow; onSaved: () => Promise<void> }) {
  const [value, setValue] = useState(agent.prefix === null ? "" : String(agent.prefix));
  const [busy, setBusy] = useState(false);
  const { show } = useToast();
  const run = useSafeAction();
  // لا يتغير Prefix بعد حجز أي رقم (الباكند يرفض ذلك أيضاً)
  const locked = agent.nextSeq !== null && agent.nextSeq > 1;
  const n = Number(value);
  const valid = Number.isInteger(n) && n >= 1;
  const dirty = value.trim() !== (agent.prefix === null ? "" : String(agent.prefix));

  const save = async () => {
    if (!valid) return;
    setBusy(true);
    try {
      const r = await run(() => agentAdminService.setPrefix(agent.id, n));
      if (r.ok) show(`تم حفظ Prefix ${agent.name}`);
      await onSaved();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-border px-3 py-2.5 text-sm last:border-b-0">
      <span className="min-w-[120px] flex-1 font-medium text-text">{agent.name}</span>
      {!agent.isActive && <Badge color="#8A8F98">معطّل</Badge>}
      <Input dir="ltr" inputMode="numeric" aria-label={`Prefix ${agent.name}`} value={value} disabled={locked || busy} onChange={(e) => setValue(e.target.value)} placeholder="Prefix" className="!w-24 !px-2 !py-1.5 text-center tabular-nums" />
      {!locked && dirty && (
        <Button size="sm" icon={<Check size={13} />} disabled={!valid || busy} onClick={() => void save()}>
          حفظ
        </Button>
      )}
      <span className="text-xs text-muted tabular-nums">
        {agent.prefix === null ? "لم يُحدَّد" : `الرقم التالي ${agent.nextWaybill}${agent.maxWaybill !== null ? ` • الحد الأقصى ${agent.maxWaybill}` : ""}`}
      </span>
      {locked && <span className="text-xs text-muted">مثبّت بعد حجز أرقام</span>}
    </div>
  );
}

// إدارة Prefix الفتيات (الإدارة فقط). رقم البوليصة = Prefix × 100 + التسلسل.
export function PrefixManager() {
  const agents = useResource<AgentAdminRow[]>(agentAdminService.list, NONE);
  return (
    <Card className="mb-6 overflow-hidden">
      <div className="border-b border-border px-3 py-2.5">
        <h2 className="text-sm font-semibold text-text">Prefix الفتيات وترقيم البوليصات</h2>
        <p className="text-xs text-muted">رقم البوليصة = Prefix × 100 + الرقم التسلسلي (مثال: 500 ← 50001). أنشئ حساب الفتاة من «إدارة المستخدمين» بدور «فتاة مبيعات» ثم حدد Prefix هنا.</p>
      </div>
      {agents.loading ? (
        <LoadingState />
      ) : agents.error ? (
        <ErrorState message={agents.error} onRetry={() => void agents.retry()} />
      ) : agents.data.length === 0 ? (
        <p className="px-3 py-5 text-center text-sm text-muted">لا توجد حسابات فتيات بعد.</p>
      ) : (
        agents.data.map((a) => <PrefixRow key={`${a.id}:${a.prefix}`} agent={a} onSaved={agents.reload} />)
      )}
    </Card>
  );
}
