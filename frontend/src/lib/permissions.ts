import type { TeamMember, UserRole } from "../types";

export type AppPage = "dailyTasks" | "feedback" | "goals" | "schedule" | "users" | "products" | "inventory" | "withdrawals" | "manageUsers" | "profile" | "notifications";

/** ما يلزم لتحديد الصفحات: الدور + مستوى وصول المخزون (للمصمم يحدده المدير) */
export type AccessSubject = Pick<TeamMember, "accessRole" | "inventoryAccess">;

const STAFF_PAGES: AppPage[] = ["dailyTasks", "notifications", "feedback", "goals", "schedule", "users", "products", "inventory", "withdrawals", "manageUsers", "profile"];
const DESIGNER_BASE: AppPage[] = ["dailyTasks", "notifications", "feedback", "profile"];
// تعبئة ومشغل: السحب وصفحتهما فقط (الباكند يفرض ذلك بقائمة بيضاء؛ هذا للعرض فقط)
const RESTRICTED_PAGES: AppPage[] = ["withdrawals", "profile"];

export const isRestrictedRole = (role: UserRole) => role === "packer" || role === "operator";

export function pagesFor(user: AccessSubject): AppPage[] {
  switch (user.accessRole) {
    case "admin":
    case "manager":
      return STAFF_PAGES;
    case "packer":
    case "operator":
      return RESTRICTED_PAGES;
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
  return user.accessRole === "designer" ? "/daily-tasks" : "/";
}
