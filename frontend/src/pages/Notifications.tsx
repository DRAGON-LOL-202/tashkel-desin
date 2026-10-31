import { useCallback, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Bell, CheckCheck, RefreshCw, Search, Trash2 } from "lucide-react";
import { AppLayout } from "../components/layout/AppLayout";
import { Header } from "../components/header/Header";
import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
import { Input } from "../components/ui/Field";
import { EmptyState } from "../components/ui/EmptyState";
import { ErrorState, LoadingState } from "../components/ui/StatusViews";
import { Tabs } from "../components/ui/Tabs";
import { useToast } from "../components/ui/ToastProvider";
import { NotificationItem } from "../components/notifications/NotificationItem";
import { PushSettingsCard } from "../components/notifications/PushSettingsCard";
import { useResource } from "../hooks/useResource";
import { useSafeAction } from "../hooks/useSafeAction";
import { notificationsService } from "../services/notificationsService";
import type { AppNotification, NotificationCategory, NotificationList } from "../types";

type TabValue = "all" | "unread" | "read" | NotificationCategory;

const tabs: { value: TabValue; label: string }[] = [
  { value: "all", label: "الكل" },
  { value: "unread", label: "غير المقروءة" },
  { value: "read", label: "المقروءة" },
  { value: "tasks", label: "المهام" },
  { value: "reminders", label: "المواعيد والتنبيهات" },
  { value: "comments", label: "التعليقات والردود" },
  { value: "admin", label: "الإشعارات الإدارية" },
];

const EMPTY: NotificationList = { notifications: [], total: 0, unread: 0 };

export default function NotificationsPage() {
  const navigate = useNavigate();
  const { show } = useToast();
  const safe = useSafeAction();
  const [tab, setTab] = useState<TabValue>("all");
  const [query, setQuery] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [refreshing, setRefreshing] = useState(false);

  // الفلترة في الـ backend (الأرقام الإجمالية تبقى للمستخدم كله)
  const loader = useMemo(() => {
    const filter = tab === "unread" || tab === "read" ? tab : "all";
    const category = tab === "all" || tab === "unread" || tab === "read" ? undefined : tab;
    return () => notificationsService.list({ filter, category, q: query, from: from || undefined, to: to || undefined });
  }, [tab, query, from, to]);
  const { data, loading, error, reload, retry } = useResource<NotificationList>(loader, EMPTY);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    await reload();
    setRefreshing(false);
  }, [reload]);

  const open = async (item: AppNotification) => {
    if (!item.isRead) await safe(() => notificationsService.setRead(item.id, true));
    if (item.taskId) {
      navigate(item.taskDate ? `/daily-tasks?date=${item.taskDate}` : "/daily-tasks");
    } else if (item.type === "INVENTORY_LOW") {
      navigate("/inventory/shortages");
    } else {
      await reload();
    }
  };

  const toggleRead = async (item: AppNotification) => {
    const result = await safe(() => notificationsService.setRead(item.id, !item.isRead));
    if (result.ok) await reload();
  };

  const remove = async (item: AppNotification) => {
    const result = await safe(() => notificationsService.remove(item.id));
    if (!result.ok) return;
    show("تم حذف الإشعار");
    await reload();
  };

  const markAll = async () => {
    const result = await safe(() => notificationsService.markAllRead());
    if (!result.ok) return;
    show("تم تحديد كل الإشعارات كمقروءة");
    await reload();
  };

  const removeRead = async () => {
    const result = await safe(() => notificationsService.removeRead());
    if (!result.ok) return;
    show(result.value > 0 ? `تم حذف ${result.value} إشعار مقروء` : "لا توجد إشعارات مقروءة للحذف");
    await reload();
  };

  const hasFilters = tab !== "all" || query.trim() !== "" || from !== "" || to !== "";

  return (
    <AppLayout
      headerSlot={(openMobileNav) => (
        <Header
          title="الإشعارات"
          description="كل ما يخصك من مهام وتعليقات وتنبيهات"
          onOpenMobileNav={openMobileNav}
          action={
            <Button variant="secondary" icon={<RefreshCw size={16} className={refreshing ? "animate-spin" : ""} />} onClick={() => void refresh()}>
              تحديث
            </Button>
          }
        />
      )}
    >
      <div className="flex flex-col gap-4">
        <PushSettingsCard />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Card className="p-4">
            <p className="text-xs text-muted">إجمالي الإشعارات</p>
            <p className="mt-1 text-2xl font-bold text-text" data-testid="notif-total">{data.total}</p>
          </Card>
          <Card className="p-4">
            <p className="text-xs text-muted">غير المقروءة</p>
            <p className="mt-1 text-2xl font-bold text-primary-deep" data-testid="notif-unread">{data.unread}</p>
          </Card>
          <Button className="h-full" icon={<CheckCheck size={16} />} onClick={() => void markAll()} disabled={data.unread === 0}>
            تحديد الكل كمقروء
          </Button>
          <Button variant="danger" className="h-full" icon={<Trash2 size={16} />} onClick={() => void removeRead()} disabled={data.total - data.unread === 0}>
            حذف المقروءة
          </Button>
        </div>

        <Card className="flex flex-col gap-3 p-4">
          <div className="overflow-x-auto scrollbar-none">
            <Tabs options={tabs} value={tab} onChange={(v) => setTab(v as TabValue)} />
          </div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_auto_auto]">
            <div className="relative">
              <Search size={16} className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-muted" />
              <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="ابحث في الإشعارات" aria-label="بحث في الإشعارات" className="pr-10" />
            </div>
            <Input type="date" value={from} max={to || undefined} onChange={(e) => setFrom(e.target.value)} aria-label="من تاريخ" />
            <Input type="date" value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} aria-label="إلى تاريخ" />
          </div>
        </Card>

        {loading ? (
          <LoadingState label="جارٍ تحميل الإشعارات..." />
        ) : error ? (
          <ErrorState message={error} onRetry={() => void retry()} />
        ) : data.notifications.length === 0 ? (
          <Card>
            <EmptyState
              icon={<Bell size={24} />}
              title={hasFilters ? "لا إشعارات مطابقة" : "لا توجد إشعارات"}
              description={hasFilters ? "غيّر الفلاتر أو كلمة البحث" : "ستظهر هنا الإشعارات الخاصة بك فور حدوثها"}
            />
          </Card>
        ) : (
          <div className="flex flex-col gap-2.5">
            {data.notifications.map((item) => (
              <NotificationItem key={item.id} item={item} onOpen={(i) => void open(i)} onToggleRead={(i) => void toggleRead(i)} onDelete={(i) => void remove(i)} />
            ))}
          </div>
        )}
      </div>
    </AppLayout>
  );
}
