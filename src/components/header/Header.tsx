import { useEffect, useState, type ReactNode } from "react";
import { Menu, Moon, Sun } from "lucide-react";
import { formatArabicDate } from "../../lib/date";

interface HeaderProps {
  title: string;
  description?: string;
  action?: ReactNode;
  onOpenMobileNav: () => void;
}

export function Header({ title, description, action, onOpenMobileNav }: HeaderProps) {
  const [darkMode, setDarkMode] = useState(() => {
    try {
      const saved = localStorage.getItem("tashkeel_theme");
      if (saved) return saved === "dark";
      return window.matchMedia?.("(prefers-color-scheme: dark)").matches ?? false;
    } catch {
      return false;
    }
  });

  useEffect(() => {
    document.documentElement.classList.toggle("dark", darkMode);
    try {
      localStorage.setItem("tashkeel_theme", darkMode ? "dark" : "light");
    } catch {
      // ignore storage errors
    }
  }, [darkMode]);

  return (
    <header className="sticky top-0 z-20 bg-background/80 backdrop-blur-md border-b border-border">
      <div className="flex items-center justify-between gap-4 px-4 md:px-8 h-16">
        <div className="flex items-center gap-3 min-w-0">
          <button
            onClick={onOpenMobileNav}
            className="md:hidden -mr-1 h-9 w-9 flex items-center justify-center rounded-control text-muted hover:bg-border/50"
            aria-label="فتح القائمة"
          >
            <Menu size={20} />
          </button>
          <div className="min-w-0">
            <h1 className="text-[17px] md:text-xl font-bold text-text truncate">{title}</h1>
            {description && <p className="hidden sm:block text-xs text-muted mt-0.5 truncate">{description}</p>}
          </div>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <span className="hidden xl:inline text-xs text-muted font-medium">
            {formatArabicDate(new Date().toISOString(), "EEEE، d MMMM yyyy")}
          </span>
          <button
            onClick={() => setDarkMode((value) => !value)}
            aria-label={darkMode ? "تفعيل الوضع الفاتح" : "تفعيل الوضع الداكن"}
            title={darkMode ? "الوضع الفاتح" : "الوضع الداكن"}
            className="h-10 w-10 rounded-control border border-border bg-surface text-muted hover:text-text hover:border-primary-deep/40 flex items-center justify-center transition-colors"
          >
            {darkMode ? <Sun size={18} /> : <Moon size={18} />}
          </button>
          {action}
        </div>
      </div>
    </header>
  );
}
