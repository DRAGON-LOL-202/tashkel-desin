import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowLeft, LogOut, Moon, Sun, UserCog, UserRound } from "lucide-react";
import { useAuth } from "../components/auth/AuthProvider";
import { useDepartment } from "../components/departments/DepartmentProvider";
import { DEPARTMENTS } from "../lib/departments";

export default function WorkspacePage() {
  const { user, logout } = useAuth();
  const { activeDepartment, selectDepartmentAndGo } = useDepartment();
  const navigate = useNavigate();

  const [darkMode, setDarkMode] = useState(() => {
    try {
      const saved = localStorage.getItem("tashkeel_theme");
      if (saved) return saved === "dark";
      return window.matchMedia?.("(prefers-color-scheme: dark)").matches ?? true;
    } catch {
      return true;
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
    <main
      dir="rtl"
      className="relative flex min-h-screen flex-col overflow-x-hidden bg-background text-text transition-colors"
    >
      {/* خلفية بتدرج فيروزي/زمردي مستوحاة من المرجع البصري وتتكيّف مع الوضعين الداكن والفاتح */}
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-0 -z-0 opacity-100"
        style={{
          background: darkMode
            ? "radial-gradient(circle at 15% 20%, rgba(20, 141, 114, 0.30) 0%, transparent 45%), radial-gradient(circle at 85% 80%, rgba(39, 198, 163, 0.22) 0%, transparent 48%), linear-gradient(155deg, #071310 0%, #0b221c 50%, #071512 100%)"
            : "radial-gradient(circle at 15% 20%, rgba(127, 255, 212, 0.28) 0%, transparent 45%), radial-gradient(circle at 85% 80%, rgba(39, 198, 163, 0.16) 0%, transparent 48%), linear-gradient(155deg, #f3faf7 0%, #e9f6f1 50%, #f6faf8 100%)",
        }}
      />

      {/* شريط علوي هادئ */}
      <header className="relative z-10 mx-auto flex w-full max-w-5xl items-center justify-between gap-3 px-4 pt-5 sm:px-6">
        <div className="flex items-center gap-2 rounded-full border border-primary-deep/20 bg-surface/75 px-3.5 py-1.5 text-xs backdrop-blur-md">
          <span className="h-2 w-2 rounded-full bg-primary-dark" aria-hidden="true" />
          <span className="font-semibold text-text">{user?.name}</span>
          <span className="text-muted">({user?.role})</span>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setDarkMode((v) => !v)}
            aria-label={darkMode ? "تفعيل الوضع الفاتح" : "تفعيل الوضع الداكن"}
            title={darkMode ? "الوضع الفاتح" : "الوضع الداكن"}
            className="flex h-9 w-9 items-center justify-center rounded-control border border-primary-deep/20 bg-surface/75 text-muted backdrop-blur-md transition-colors hover:border-primary-dark/50 hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-dark"
          >
            {darkMode ? <Sun size={16} /> : <Moon size={16} />}
          </button>
          <button
            type="button"
            onClick={() => {
              logout();
              navigate("/login", { replace: true });
            }}
            className="inline-flex h-9 items-center gap-1.5 rounded-control border border-primary-deep/20 bg-surface/75 px-3 text-xs font-medium text-muted backdrop-blur-md transition-colors hover:border-problem/40 hover:text-problem focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-problem"
          >
            <LogOut size={14} />
            <span>خروج</span>
          </button>
        </div>
      </header>

      {/* المحتوى الرئيسي */}
      <section className="relative z-10 mx-auto flex w-full max-w-5xl flex-1 flex-col items-center justify-center px-4 py-8 sm:px-6">
        <div className="mb-8 flex flex-col items-center text-center">
          <img
            src="/tashkeel-cnc-logo.svg"
            alt="TASHKEEL.CNC"
            width={80}
            height={80}
            decoding="async"
            className="mb-4 h-16 w-16 object-contain drop-shadow-sm sm:h-20 sm:w-20"
          />
          <h1 className="text-2xl font-bold tracking-tight text-text sm:text-3xl">
            اختر الإدارة التي تريد البدء منها
          </h1>
          <p className="mt-2 max-w-xl text-sm text-muted sm:text-base">
            كل إدارة تجمع الأدوات والصفحات الخاصة بها في مكان واحد
          </p>
        </div>

        {/* شبكة البطاقات الأربع: 2x2 على سطح المكتب وعمود واحد على الهاتف */}
        <div className="grid w-full max-w-4xl grid-cols-1 gap-4 md:grid-cols-2 md:gap-5">
          {DEPARTMENTS.map((dept) => {
            const Icon = dept.icon;
            const isCurrent = activeDepartment === dept.key;
            return (
              <button
                key={dept.key}
                type="button"
                onClick={() => selectDepartmentAndGo(dept.key)}
                data-testid={`dept-card-${dept.key}`}
                className={`group relative flex flex-col rounded-[20px] border p-5 text-right backdrop-blur-md transition-all duration-200 hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-dark sm:p-6 ${
                  isCurrent
                    ? "border-primary-dark/60 bg-surface/90 shadow-pop dark:bg-[#0f2922]/85"
                    : "border-primary-deep/20 bg-surface/80 shadow-soft hover:border-primary-dark/50 hover:bg-surface/95 dark:bg-[#0c211b]/75 dark:hover:bg-[#102b23]/90"
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-primary-dark/25 bg-primary/15 text-primary-deep transition-colors group-hover:bg-primary/25">
                    <Icon size={22} />
                  </div>
                  <span className="rounded-full border border-border bg-background/60 px-2.5 py-0.5 text-[11px] font-medium text-muted">
                    {dept.items.length === 1 ? "صفحة واحدة" : `${dept.items.length} صفحات`}
                  </span>
                </div>

                <h2 className="mt-4 text-lg font-bold text-text sm:text-xl">{dept.title}</h2>
                <p className="mt-1 text-xs leading-relaxed text-muted sm:text-sm">{dept.subtitle}</p>

                <div className="mt-4 flex flex-wrap gap-1.5">
                  {dept.items.map((item) => (
                    <span
                      key={item.to}
                      className="rounded-full border border-border/80 bg-background/50 px-2.5 py-0.5 text-[11px] font-medium text-muted"
                    >
                      {item.label}
                    </span>
                  ))}
                </div>

                {dept.summaryNote && (
                  <p className="mt-2.5 text-[11px] text-primary-deep/90">{dept.summaryNote}</p>
                )}

                <div className="mt-auto pt-4">
                  <div className="flex items-center justify-between border-t border-border/70 pt-3 text-xs font-semibold text-primary-deep">
                    <span>دخول {dept.title}</span>
                    <ArrowLeft
                      size={15}
                      className="transition-transform duration-200 group-hover:-translate-x-1"
                      aria-hidden="true"
                    />
                  </div>
                </div>
              </button>
            );
          })}
        </div>

        {/* تذييل هادئ + روابط الأدوات الإدارية العامة خارج الإدارات الأربع */}
        <div className="mt-8 flex flex-col items-center gap-3 text-center">
          <p className="inline-flex items-center gap-2 text-xs text-muted">
            <span className="h-1.5 w-1.5 rounded-full bg-primary-dark" aria-hidden="true" />
            <span>مساحة واحدة، وكل شيء مترابط</span>
          </p>
          <div className="flex flex-wrap items-center justify-center gap-2">
            <Link
              to="/manage-users"
              className="inline-flex items-center gap-1.5 rounded-full border border-border/80 bg-surface/65 px-3 py-1.5 text-xs font-medium text-muted backdrop-blur-sm transition-colors hover:border-primary-dark/40 hover:text-text"
            >
              <UserCog size={13} />
              <span>إدارة المستخدمين</span>
            </Link>
            <Link
              to="/profile"
              className="inline-flex items-center gap-1.5 rounded-full border border-border/80 bg-surface/65 px-3 py-1.5 text-xs font-medium text-muted backdrop-blur-sm transition-colors hover:border-primary-dark/40 hover:text-text"
            >
              <UserRound size={13} />
              <span>صفحتي</span>
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}
