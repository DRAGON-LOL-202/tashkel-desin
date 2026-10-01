import { NavLink, useNavigate } from "react-router-dom";
import { CalendarRange, Home, LogOut, MessageSquare, PanelRightClose, PanelRightOpen, Target, UserCog, UserRound, Users } from "lucide-react";
import { useAuth } from "../auth/AuthProvider";
import type { AppPage } from "../../lib/permissions";

const navItems = [
  { to: "/", label: "المهام اليومية", icon: Home, end: true, page: "dailyTasks" as AppPage },
  { to: "/feedback", label: "Feedback", icon: MessageSquare, page: "feedback" as AppPage },
  { to: "/goals", label: "الأهداف", icon: Target, page: "goals" as AppPage },
  { to: "/schedule", label: "الجدولة", icon: CalendarRange, page: "schedule" as AppPage },
  { to: "/users", label: "Dashboard", icon: Users, page: "users" as AppPage },
  { to: "/manage-users", label: "إدارة المستخدمين", icon: UserCog, page: "manageUsers" as AppPage },
];

interface SidebarProps {
  collapsed: boolean;
  onToggle: () => void;
  onNavigate?: () => void;
}

export function Sidebar({ collapsed, onToggle, onNavigate }: SidebarProps) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const isDesigner = user?.accessRole === "designer";
  const visibleItems = isDesigner
    ? [
        { to: "/daily-tasks", label: "المهام اليومية", icon: Home, page: "dailyTasks" as AppPage },
        { to: "/feedback", label: "Feedback", icon: MessageSquare, page: "feedback" as AppPage },
        { to: "/profile", label: "صفحتي", icon: UserRound, page: "profile" as AppPage },
      ]
    : navItems;

  return (
    <aside
      className={`h-full flex flex-col bg-surface border-l border-border transition-all duration-200 ${
        collapsed ? "w-[76px]" : "w-[248px]"
      }`}
    >
      <div className="flex items-center gap-2.5 px-4 h-16 border-b border-border shrink-0">
        <img src="/tashkeel-cnc-logo.svg" alt="TASHKEEL.CNC" className="h-9 w-9 object-contain shrink-0" />
        {!collapsed && (
          <div className="leading-tight overflow-hidden">
            <p className="text-[13px] font-bold text-text tracking-tight truncate">TASHKEEL.CNC</p>
            <p className="text-[11px] text-muted font-medium truncate">DESIGN</p>
          </div>
        )}
      </div>

      <nav className="flex-1 overflow-y-auto scrollbar-none py-4 px-3 flex flex-col gap-1">
        {visibleItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            onClick={onNavigate}
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
                <item.icon size={18} className="shrink-0" />
                {!collapsed && <span className="truncate">{item.label}</span>}
              </>
            )}
          </NavLink>
        ))}
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
