import { useState } from "react";
import { NavLink } from "react-router-dom";
import { CalendarRange, Home, MessageSquare, PanelRightClose, PanelRightOpen, Plus, Target } from "lucide-react";
import { AddPageModal } from "./AddPageModal";

const navItems = [
  { to: "/", label: "المهام اليومية", icon: Home, end: true },
  { to: "/feedback", label: "Feedback", icon: MessageSquare },
  { to: "/goals", label: "الأهداف", icon: Target },
  { to: "/schedule", label: "الجدولة", icon: CalendarRange },
];

interface SidebarProps {
  collapsed: boolean;
  onToggle: () => void;
  onNavigate?: () => void;
}

export function Sidebar({ collapsed, onToggle, onNavigate }: SidebarProps) {
  const [addPageOpen, setAddPageOpen] = useState(false);

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
        {navItems.map((item) => (
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
          onClick={() => setAddPageOpen(true)}
          className="flex items-center gap-3 rounded-control px-3 py-2.5 text-sm font-medium text-muted hover:bg-border/50 hover:text-text transition-colors"
        >
          <Plus size={18} className="shrink-0" />
          {!collapsed && <span>إضافة صفحة</span>}
        </button>
        <button
          onClick={onToggle}
          className="hidden md:flex items-center gap-3 rounded-control px-3 py-2 text-xs font-medium text-muted hover:bg-border/50 hover:text-text transition-colors"
        >
          {collapsed ? <PanelRightOpen size={16} /> : <PanelRightClose size={16} />}
          {!collapsed && <span>طي القائمة</span>}
        </button>
      </div>

      <AddPageModal open={addPageOpen} onClose={() => setAddPageOpen(false)} />
    </aside>
  );
}
