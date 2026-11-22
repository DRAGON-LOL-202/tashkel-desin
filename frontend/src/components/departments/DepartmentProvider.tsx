import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthProvider";
import { canAccessWorkspace } from "../../lib/permissions";
import { departmentsForPath, getDepartment, isDepartmentKey, type DepartmentKey } from "../../lib/departments";

const DEPARTMENT_STORAGE_KEY = "tashkeel_active_department";
const DEFAULT_DEPARTMENT: DepartmentKey = "design";

function readStoredDepartment(): DepartmentKey {
  try {
    const raw = localStorage.getItem(DEPARTMENT_STORAGE_KEY);
    return isDepartmentKey(raw) ? raw : DEFAULT_DEPARTMENT;
  } catch {
    return DEFAULT_DEPARTMENT;
  }
}

function writeStoredDepartment(key: DepartmentKey): void {
  try {
    localStorage.setItem(DEPARTMENT_STORAGE_KEY, key);
  } catch {
    // ignore storage failures
  }
}

export function clearStoredDepartment(): void {
  try {
    localStorage.removeItem(DEPARTMENT_STORAGE_KEY);
  } catch {
    // ignore storage failures
  }
}

interface DepartmentContextValue {
  activeDepartment: DepartmentKey;
  setActiveDepartment: (key: DepartmentKey) => void;
  selectDepartmentAndGo: (key: DepartmentKey) => void;
}

const DepartmentContext = createContext<DepartmentContextValue | null>(null);

/**
 * سياق تنقل بحت للإدارة النشطة في القائمة الجانبية (ليس نظام صلاحيات أبداً).
 * يشتق الإدارة النشطة من المسار الحالي أولاً مع الحفاظ على آخر إدارة عند التحديث في الصفحات المشتركة.
 */
export function DepartmentProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [storedDepartment, setStoredDepartment] = useState<DepartmentKey>(readStoredDepartment);
  const canUseDepartments = !!user && canAccessWorkspace(user);

  const activeDepartment = useMemo<DepartmentKey>(() => {
    const matches = departmentsForPath(location.pathname);
    if (matches.length === 1) return matches[0];
    if (matches.length > 1) return matches.includes(storedDepartment) ? storedDepartment : matches[0];
    return storedDepartment;
  }, [location.pathname, storedDepartment]);

  useEffect(() => {
    if (canUseDepartments) writeStoredDepartment(activeDepartment);
  }, [canUseDepartments, activeDepartment]);

  const setActiveDepartment = useCallback((key: DepartmentKey) => {
    setStoredDepartment(key);
    writeStoredDepartment(key);
  }, []);

  const selectDepartmentAndGo = useCallback(
    (key: DepartmentKey) => {
      setStoredDepartment(key);
      writeStoredDepartment(key);
      navigate(getDepartment(key).defaultPath);
    },
    [navigate]
  );

  return (
    <DepartmentContext.Provider value={{ activeDepartment, setActiveDepartment, selectDepartmentAndGo }}>
      {children}
    </DepartmentContext.Provider>
  );
}

export function useDepartment(): DepartmentContextValue {
  const ctx = useContext(DepartmentContext);
  if (!ctx) throw new Error("useDepartment يجب أن يستخدم داخل DepartmentProvider");
  return ctx;
}
