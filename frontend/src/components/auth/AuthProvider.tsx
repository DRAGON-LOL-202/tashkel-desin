import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import type { TeamMember } from "../../types";
import { authService } from "../../services/authService";
import { ApiError, UNAUTHORIZED_EVENT, errorMessage, tokenStore } from "../../lib/api";
import { ErrorState, FullPageLoading } from "../ui/StatusViews";

interface AuthContextValue {
  user: TeamMember | null;
  login: (username: string, password: string) => Promise<TeamMember>;
  logout: () => void;
  /** يحدّث بيانات المستخدم الحالي في الواجهة بعد تعديل الملف الشخصي */
  setUser: (user: TeamMember) => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<TeamMember | null>(null);
  // التحقق من التوكن مع الـ backend عند التحميل؛ لا نعرض أي صفحة قبل أن نعرف من هو المستخدم
  const [booting, setBooting] = useState<boolean>(() => authService.hasToken());
  const [bootError, setBootError] = useState<string | null>(null);

  const boot = useCallback(async () => {
    if (!authService.hasToken()) {
      setBooting(false);
      return;
    }
    setBooting(true);
    setBootError(null);
    try {
      setUser(await authService.me());
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        tokenStore.clear();
        setUser(null);
      } else {
        // خطأ شبكة/خادم: لا نتلف التوكن، نتيح إعادة المحاولة
        setBootError(errorMessage(error));
      }
    } finally {
      setBooting(false);
    }
  }, []);

  useEffect(() => {
    void boot();
  }, [boot]);

  // أي 401 من أي طلب (توكن منتهٍ أو حساب معطَّل) ← خروج فوري
  useEffect(() => {
    const onUnauthorized = () => setUser(null);
    window.addEventListener(UNAUTHORIZED_EVENT, onUnauthorized);
    return () => window.removeEventListener(UNAUTHORIZED_EVENT, onUnauthorized);
  }, []);

  const login = useCallback(async (username: string, password: string) => {
    const member = await authService.login(username, password);
    setUser(member);
    return member;
  }, []);

  const logout = useCallback(() => {
    setUser(null);
    void authService.logout();
  }, []);

  if (booting) return <FullPageLoading />;
  if (bootError) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background" dir="rtl">
        <ErrorState message={bootError} onRetry={() => void boot()} />
      </main>
    );
  }

  return <AuthContext.Provider value={{ user, login, logout, setUser }}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth يجب أن يستخدم داخل AuthProvider");
  return context;
}
