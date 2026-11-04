import type { TeamMember, UserRole } from "../types";

export type AppPage = "dailyTasks" | "feedback" | "goals" | "schedule" | "users" | "products" | "inventory" | "withdrawals" | "sales" | "salesOrders" | "manageUsers" | "profile" | "notifications";

/** ما يلزم لتحديد الصفحات: الدور + مستوى وصول المخزون (للمصمم يحدده المدير) */
export type AccessSubject = Pick<TeamMember, "accessRole" | "inventoryAccess">;

const STAFF_PAGES: AppPage[] = ["dailyTasks", "notifications", "feedback", "goals", "schedule", "users", "products", "inventory", "withdrawals", "sales", "salesOrders", "manageUsers", "profile"];
const DESIGNER_BASE: AppPage[] = ["dailyTasks", "notifications", "feedback", "profile"];
// تعبئة ومشغل: السحب وصفحتهما فقط (الباكند يفرض ذلك بقائمة بيضاء؛ هذا للعرض فقط)
const RESTRICTED_PAGES: AppPage[] = ["withdrawals", "profile"];
// أدوار المبيعات الإلكترونية المحصورة
const SALES_ORDERS_PAGES: AppPage[] = ["salesOrders", "profile"];
// منفّذ الأوردرات ومشرف المبيعات: يضاف لهما السحب من المخزون
const SALES_EDITOR_PAGES: AppPage[] = ["salesOrders", "withdrawals", "profile"];
const SALES_SUPERVISOR_PAGES: AppPage[] = ["salesOrders", "inventory", "withdrawals", "profile"];

export const isRestrictedRole = (role: UserRole) => role === "packer" || role === "operator";
export const isSalesRole = (role: UserRole) =>
  role === "sales_flagger" || role === "sales_editor" || role === "sales_supervisor";

export function pagesFor(user: AccessSubject): AppPage[] {
  switch (user.accessRole) {
    case "admin":
    case "manager":
      return STAFF_PAGES;
    case "packer":
    case "operator":
      return RESTRICTED_PAGES;
    case "sales_flagger":
      return SALES_ORDERS_PAGES;
    case "sales_editor":
      return SALES_EDITOR_PAGES;
    case "sales_supervisor":
      return SALES_SUPERVISOR_PAGES;
    default:
      if (user.inventoryAccess === "full") return [...DESIGNER_BASE, "inventory", "withdrawals"];
      if (user.inventoryAccess === "withdraw") return [...DESIGNER_BASE, "withdrawals"];
      return DESIGNER_BASE;
  }
}

export function canAccessPage(user: AccessSubject, page: AppPage): boolean {
  return pagesFor(user).includes(page);
}

export function defaultPathForRole(user: AccessSubject): string {
  if (isRestrictedRole(user.accessRole)) return "/withdrawals";
  if (isSalesRole(user.accessRole)) return "/sales-orders";
  return user.accessRole === "designer" ? "/daily-tasks" : "/";
}
