import { useState, type ReactNode } from "react";
import { Sidebar } from "../sidebar/Sidebar";

interface AppLayoutProps {
  headerSlot: (openMobileNav: () => void) => ReactNode;
  children: ReactNode;
}

export function AppLayout({ headerSlot, children }: AppLayoutProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  return (
    <div className="h-screen w-full flex bg-background text-text" dir="rtl">
      {/* Desktop sidebar */}
      <div className="hidden md:block h-full shrink-0">
        <Sidebar collapsed={collapsed} onToggle={() => setCollapsed((c) => !c)} />
      </div>

      {/* Mobile drawer */}
      {mobileNavOpen && (
        <div className="fixed inset-0 z-40 md:hidden">
          <div
            className="absolute inset-0 bg-[#0d1512]/55 animate-fade-in"
            onClick={() => setMobileNavOpen(false)}
          />
          <div className="absolute top-0 right-0 h-full animate-slide-up">
            <Sidebar
              collapsed={false}
              onToggle={() => setMobileNavOpen(false)}
              onNavigate={() => setMobileNavOpen(false)}
            />
          </div>
        </div>
      )}

      <div className="flex-1 min-w-0 h-full overflow-y-auto">
        {headerSlot(() => setMobileNavOpen(true))}
        <main className="px-4 md:px-8 py-6 md:py-8 max-w-[1400px] mx-auto">{children}</main>
      </div>
    </div>
  );
}
