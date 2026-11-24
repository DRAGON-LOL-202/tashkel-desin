import { NavLink, useNavigate } from "react-router-dom";
import {
  AlertTriangle,
  ArrowRight,
  Bell,
  Calculator,
  ClipboardList,
  Factory,
  Home,
  LayoutGrid,
  ListChecks,
  LogOut,
  MessageSquare,
  PackageMinus,
  PanelRightClose,
  PanelRightOpen,
  Send,
  UserCog,
  UserRound,
  Wallet,
  Warehouse,
} from "lucide-react";
import { useAuth } from "../auth/AuthProvider";
import { canAccessWorkspace, isSalesRole, pagesFor, type AppPage } from "../../lib/permissions";
import { DEPARTMENTS, getDepartment, isDepartmentKey } from "../../lib/departments";
import { useDepartment } from "../departments/DepartmentProvider";
import { useResource } from "../../hooks/useResource";
import { notificationsService } from "../../services/notificationsService";
import type { SyncChannel } from "../../lib/liveSync";

// المصمم وتعبئة/مشغل وأدوار المبيعات: قائمة مختصرة تُرشَّح بحسب صلاحياته (pagesFor)
const memberItems = [
  { to: "/daily-tasks", label: "المهام اليومية", icon: Home, page: "dailyTasks" as AppPage },
  { to: "/production-tasks", label: "مهام إنتاج", icon: Factory, page: "productionTasks" as AppPage },
  { to: "/notifications", label: "الإشعارات", icon: Bell, page: "notifications" as AppPage },
  { to: "/feedback", label: "Feedback", icon: MessageSquare, page: "feedback" as AppPage },
  { to: "/agent-orders", label: "أوردراتي", icon: ClipboardList, page: "agentOrders" as AppPage },
  { to: "/agent-supervisor", label: "تصدير أوردرات الفتيات", icon: Send, page: "agentSupervisor" as AppPage },
  { to: "/sales-follow-up", label: "متابعة أوردرات المبيعات", icon: ListChecks, page: "salesFollowUp" as AppPage },
  { to: "/agent-accounts", label: "حسابات الفتيات", icon: Wallet, page: "agentAccounts" as AppPage },
  { to: "/general-accounts", label: "الحسابات العامة", icon: Calculator, page: "generalAccounts" as AppPage },
  { to: "/sales-orders", label: "أوردرات مبيعات إلكترونية", icon: ClipboardList, page: "salesOrders" as AppPage },
  { to: "/inventory", label: "المخزون", icon: Warehouse, end: true, page: "inventory" as AppPage },
  { to: "/inventory/shortages", label: "نواقص المخزون", icon: AlertTriangle, page: "inventory" as AppPage },
  { to: "/withdrawals", label: "السحب", icon: PackageMinus, page: "withdrawals" as AppPage },
  { to: "/profile", label: "صفحتي", icon: UserRound, page: "profile" as AppPage },
];

// تعبئة/مشغل لا يملكان صلاحية الإشعارات: لا نستدعي الـ API أصلاً (كان سيعيد 403)
const noCounts = async () => ({ total: 0, unread: 0 });
const NOTIFICATION_SYNC_CHANNELS: SyncChannel[] = ["notifications"];

interface SidebarProps {
  collapsed: boolean;
  onToggle: () => void;
  onNavigate?: () => void;
}

export function Sidebar({ collapsed, onToggle, onNavigate }: SidebarProps) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const { activeDepartment, selectDepartmentAndGo } = useDepartment();
  const allowedPages = user ? pagesFor(user) : [];
  const isStaffUser = !!user && canAccessWorkspace(user);
  const currentDept = getDepartment(activeDepartment);

  // عدّاد غير المقروء: يتحدث تلقائياً عند تغيّر الإشعارات فقط
  const { data: counts } = useResource(
    allowedPages.includes("notifications") ? notificationsService.counts : noCounts,
    { total: 0, unread: 0 },
    NOTIFICATION_SYNC_CHANNELS
  );

  const visibleItems = isStaffUser
    ? currentDept.items
    : memberItems.filter(
        (item) =>
          allowedPages.includes(item.page) &&
          !(user && isSalesRole(user.accessRole) && item.to === "/inventory/shortages")
      );

  return (
    <aside
      className={`h-full flex flex-col bg-surface border-l border-border transition-all duration-200 ${
        collapsed ? "w-[76px]" : "w-[248px]"
      }`}
    >
      <div className="flex items-center gap-2.5 px-4 h-16 border-b border-border shrink-0">
        <img
          src="/tashkeel-cnc-logo.svg"
          alt="TASHKEEL.CNC"
          width={36}
          height={36}
          decoding="async"
          className="h-9 w-9 object-contain shrink-0"
        />
        {!collapsed && (
          <div className="leading-tight overflow-hidden">
            <p className="text-[13px] font-bold text-text tracking-tight truncate">TASHKEEL.CNC</p>
            <p className="text-[11px] text-muted font-medium truncate">
              {isStaffUser ? currentDept.title : "DESIGN"}
            </p>
          </div>
        )}
      </div>

      {/* قسم اختيار الإدارة / العودة إلى الإدارات — للمدير ومدير النظام فقط */}
      {isStaffUser && (
        <div className="px-3 pt-3 pb-2 border-b border-border/70 flex flex-col gap-2 shrink-0">
          {!collapsed ? (
            <>
              <label className="block">
                <span className="sr-only">تغيير الإدارة</span>
                <select
                  aria-label="تغيير الإدارة"
                  value={activeDepartment}
                  onChange={(e) => {
                    if (isDepartmentKey(e.target.value)) {
                      selectDepartmentAndGo(e.target.value);
                      onNavigate?.();
                    }
                  }}
                  className="w-full rounded-control border border-border bg-background px-2.5 py-2 text-xs font-semibold text-text outline-none transition-colors hover:border-primary-deep/50 focus:border-primary-deep"
                >
                  {DEPARTMENTS.map((d) => (
                    <option key={d.key} value={d.key}>
                      {d.title}
                    </option>
                  ))}
                </select>
              </label>
              <NavLink
                to="/workspace"
                onClick={onNavigate}
                className="flex items-center gap-2 rounded-control border border-primary-deep/20 bg-primary/10 px-3 py-2 text-xs font-semibold text-primary-deep transition-colors hover:bg-primary/20"
              >
                <ArrowRight size={14} className="shrink-0" />
                <span className="truncate">العودة إلى الإدارات</span>
              </NavLink>
            </>
          ) : (
            <NavLink
              to="/workspace"
              onClick={onNavigate}
              title="العودة إلى الإدارات"
              aria-label="العودة إلى الإدارات"
              className="flex items-center justify-center rounded-control border border-primary-deep/20 bg-primary/10 py-2 text-primary-deep transition-colors hover:bg-primary/20"
            >
              <LayoutGrid size={17} />
            </NavLink>
          )}
        </div>
      )}

      <nav className="flex-1 overflow-y-auto scrollbar-none py-4 px-3 flex flex-col gap-1">
        {visibleItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            onClick={onNavigate}
            title={collapsed ? item.label : undefined}
            className={({ isActive }) =>
              `group flex items-center gap-3 rounded-control px-3 py-2.5 text-sm font-medium transition-colors relative ${
                isActive ? "bg-primary/15 text-primary-deep" : "text-muted hover:bg-border/50 hover:text-text"
              }`
            }
          >
            {({ isActive }) => (
              <>
                {isActive && (
                  <span className="absolute right-0 top-1/2 -translate-y-1/2 h-5 w-1 rounded-full bg-primary-deep" />
                )}
                <span className="relative shrink-0">
                  <item.icon size={18} />
                  {item.page === "notifications" && counts.unread > 0 && collapsed && (
                    <span className="absolute -right-1.5 -top-1.5 h-2.5 w-2.5 rounded-full bg-problem" aria-hidden />
                  )}
                </span>
                {!collapsed && <span className="truncate">{item.label}</span>}
                {!collapsed && item.page === "notifications" && counts.unread > 0 && (
                  <span
                    className="mr-auto min-w-[20px] rounded-full bg-problem px-1.5 py-0.5 text-center text-[11px] font-bold leading-none text-white"
                    aria-label={`${counts.unread} إشعار غير مقروء`}
                    data-testid="unread-badge"
                  >
                    {counts.unread > 99 ? "99+" : counts.unread}
                  </span>
                )}
              </>
            )}
          </NavLink>
        ))}

        {isStaffUser && allowedPages.includes("manageUsers") && (
          <>
            <div className="my-2 border-t border-border/70" />
            <NavLink
              to="/manage-users"
              onClick={onNavigate}
              title={collapsed ? "إدارة المستخدمين" : undefined}
              aria-label="إدارة المستخدمين"
              className={({ isActive }) =>
                `group flex items-center gap-3 rounded-control px-3 py-2.5 text-sm font-medium transition-colors relative ${
                  isActive ? "bg-primary/15 text-primary-deep" : "text-muted hover:bg-border/50 hover:text-text"
                }`
              }
            >
              {({ isActive }) => (
                <>
                  {isActive && (
                    <span className="absolute right-0 top-1/2 -translate-y-1/2 h-5 w-1 rounded-full bg-primary-deep" />
                  )}
                  <UserCog size={18} className="shrink-0" />
                  {!collapsed && <span className="truncate">إدارة المستخدمين</span>}
                </>
              )}
            </NavLink>
          </>
        )}
      </nav>

      <div className="p-3 border-t border-border shrink-0 flex flex-col gap-2">
        <button
          onClick={() => {
            logout();
            onNavigate?.();
            navigate("/login", { replace: true });
          }}
          className="flex items-center gap-3 rounded-control px-3 py-2.5 text-sm font-medium text-muted hover:bg-problem/10 hover:text-problem transition-colors"
        >
          <LogOut size={18} className="shrink-0" />
          {!collapsed && <span>تسجيل الخروج</span>}
        </button>
        <button
          onClick={onToggle}
          className="hidden md:flex items-center gap-3 rounded-control px-3 py-2 text-xs font-medium text-muted hover:bg-border/50 hover:text-text transition-colors"
        >
          {collapsed ? <PanelRightOpen size={16} /> : <PanelRightClose size={16} />}
          {!collapsed && <span>طي القائمة</span>}
        </button>
      </div>
    </aside>
  );
}
