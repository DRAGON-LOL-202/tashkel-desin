import type { LucideIcon } from "lucide-react";
import {
  AlertTriangle,
  BarChart3,
  Bell,
  Calculator,
  CalendarRange,
  ClipboardList,
  Factory,
  Home,
  ListChecks,
  MessageSquare,
  PackageMinus,
  Palette,
  Send,
  ShoppingBag,
  Target,
  Users,
  Wallet,
  Warehouse,
} from "lucide-react";
import type { AppPage } from "./permissions";

export type DepartmentKey = "design" | "production_inventory" | "accounting" | "general_stats";

export interface DepartmentNavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  page: AppPage;
  end?: boolean;
}

export interface DepartmentConfig {
  key: DepartmentKey;
  title: string;
  subtitle: string;
  summaryNote?: string;
  icon: LucideIcon;
  defaultPath: string;
  items: DepartmentNavItem[];
}

export const DEPARTMENTS: readonly DepartmentConfig[] = [
  {
    key: "design",
    title: "إدارة التصميم",
    subtitle: "المهام اليومية، المتابعة، الأهداف، الجدولة ولوحة الفريق.",
    icon: Palette,
    defaultPath: "/daily-tasks",
    items: [
      { to: "/daily-tasks", label: "المهام اليومية", icon: Home, page: "dailyTasks" },
      { to: "/notifications", label: "الإشعارات", icon: Bell, page: "notifications" },
      { to: "/feedback", label: "Feedback", icon: MessageSquare, page: "feedback" },
      { to: "/goals", label: "الأهداف", icon: Target, page: "goals" },
      { to: "/schedule", label: "الجدولة", icon: CalendarRange, page: "schedule" },
      { to: "/users", label: "Dashboard", icon: Users, page: "users" },
    ],
  },
  {
    key: "production_inventory",
    title: "إدارة الإنتاج والمخزون",
    subtitle: "مهام الإنتاج، المخزون والنواقص، السحب والمبيعات الإلكترونية.",
    icon: Factory,
    defaultPath: "/production-tasks",
    items: [
      { to: "/production-tasks", label: "مهام إنتاج", icon: Factory, page: "productionTasks" },
      { to: "/notifications", label: "الإشعارات", icon: Bell, page: "notifications" },
      { to: "/feedback", label: "Feedback", icon: MessageSquare, page: "feedback" },
      { to: "/inventory", label: "المخزون", icon: Warehouse, end: true, page: "inventory" },
      { to: "/inventory/shortages", label: "نواقص المخزون", icon: AlertTriangle, page: "inventory" },
      { to: "/withdrawals", label: "السحب", icon: PackageMinus, page: "withdrawals" },
      { to: "/sales", label: "مبيعات إلكترونية", icon: ShoppingBag, page: "sales" },
      { to: "/sales-orders", label: "أوردرات مبيعات إلكترونية", icon: ClipboardList, page: "salesOrders" },
    ],
  },
  {
    key: "accounting",
    title: "إدارة الحسابات",
    subtitle: "متابعة أوردرات المبيعات، تصدير أوردرات الفتيات، حسابات الفتيات والحسابات العامة.",
    icon: Wallet,
    defaultPath: "/sales-follow-up",
    items: [
      { to: "/sales-follow-up", label: "متابعة أوردرات المبيعات", icon: ListChecks, page: "salesFollowUp" },
      { to: "/agent-supervisor", label: "تصدير أوردرات الفتيات", icon: Send, page: "agentSupervisor" },
      { to: "/agent-accounts", label: "حسابات الفتيات", icon: Wallet, page: "agentAccounts" },
      { to: "/general-accounts", label: "الحسابات العامة", icon: Calculator, page: "generalAccounts" },
    ],
  },
  {
    key: "general_stats",
    title: "الحسابات العامة والإحصائيات",
    subtitle: "الحسابات العامة المجمّعة للمبيعات والشحن.",
    summaryNote: "ستُضاف بقية الإحصائيات والتقارير لاحقاً.",
    icon: BarChart3,
    defaultPath: "/general-accounts",
    items: [
      { to: "/general-accounts", label: "الحسابات العامة", icon: Calculator, page: "generalAccounts" },
    ],
  },
] as const;

export const DEPARTMENT_KEYS: readonly DepartmentKey[] = DEPARTMENTS.map((d) => d.key);

const BY_KEY = new Map<DepartmentKey, DepartmentConfig>(DEPARTMENTS.map((d) => [d.key, d]));

export function isDepartmentKey(value: unknown): value is DepartmentKey {
  return typeof value === "string" && BY_KEY.has(value as DepartmentKey);
}

export function getDepartment(key: DepartmentKey): DepartmentConfig {
  return BY_KEY.get(key) ?? DEPARTMENTS[0];
}

export function departmentsForPath(pathname: string): DepartmentKey[] {
  const path = pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;
  if (path === "/dashboard") return ["design"];
  return DEPARTMENTS.filter((d) => d.items.some((item) => item.to === path)).map((d) => d.key);
}
