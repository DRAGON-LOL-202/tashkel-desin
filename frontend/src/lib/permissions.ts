import type { TeamMember, UserRole } from "../types";

export type AppPage =
  | "workspace"
  | "dailyTasks"
  | "productionTasks"
  | "feedback"
  | "goals"
  | "schedule"
  | "users"
  | "inventory"
  | "withdrawals"
  | "sales"
  | "salesOrders"
  | "manageUsers"
  | "profile"
  | "notifications"
  | "agentOrders"
  | "agentSupervisor"
  | "salesFollowUp"
  | "agentAccounts"
  | "generalAccounts";

/** ما يلزم لتحديد الصفحات: الدور + مستوى وصول المخزون (للمصمم يحدده المدير) */
export type AccessSubject = Pick<TeamMember, "accessRole" | "inventoryAccess"> & Partial<Pick<TeamMember, "showTaskCard" | "showProductionCard">>;

const STAFF_PAGES: AppPage[] = [
  "workspace",
  "dailyTasks",
  "productionTasks",
  "notifications",
  "feedback",
  "goals",
  "schedule",
  "users",
  "inventory",
  "withdrawals",
  "sales",
  "salesOrders",
  "salesFollowUp",
  "agentSupervisor",
  "agentAccounts",
  "generalAccounts",
  "manageUsers",
  "profile",
];
// المصمم: صفحات المهام تأتي من الكرت المحدد له (showTaskCard / showProductionCard)، لا من الدور وحده
const DESIGNER_BASE: AppPage[] = ["notifications", "feedback", "profile"];
// تعبئة ومشغل: السحب وصفحتهما فقط (الباكند يفرض ذلك بقائمة بيضاء؛ هذا للعرض فقط)
const RESTRICTED_PAGES: AppPage[] = ["withdrawals", "profile"];
// أدوار المبيعات الإلكترونية المحصورة
// المحاسب (كان مراجع المرتجعات): يحتفظ بصفحة أوردرات المبيعات القديمة ويضاف له المتابعة والحسابات
const SALES_ACCOUNTANT_PAGES: AppPage[] = ["salesFollowUp", "agentAccounts", "generalAccounts", "salesOrders", "profile"];
// الفتاة: مساحتها فقط (أوردراتي + لوحتها)
const SALES_AGENT_PAGES: AppPage[] = ["agentOrders", "profile"];
// مشرف الفتيات: تجميع وتصدير أوردرات الفتيات وصفحته فقط
const SALES_AGENT_SUPERVISOR_PAGES: AppPage[] = ["agentSupervisor", "profile"];
// منفّذ الأوردرات ومشرف المبيعات: يضاف لهما السحب من المخزون
const SALES_EDITOR_PAGES: AppPage[] = ["salesOrders", "withdrawals", "profile"];
const SALES_SUPERVISOR_PAGES: AppPage[] = ["salesOrders", "inventory", "withdrawals", "profile"];

export const isRestrictedRole = (role: UserRole) => role === "packer" || role === "operator";
export const isSalesRole = (role: UserRole) =>
  role === "sales_accountant" ||
  role === "sales_editor" ||
  role === "sales_supervisor" ||
  role === "sales_agent" ||
  role === "sales_agent_supervisor";

/** بوابة الإدارات لمدير النظام والمدير فقط (حسب الدور الفعلي، لا isSystemUser) */
export function canAccessWorkspace(user: Pick<AccessSubject, "accessRole">): boolean {
  return user.accessRole === "admin" || user.accessRole === "manager";
}

/** صفحات المهام وما يلزمها (الإشعارات) لمن لديه كرت: أي دور، يظهر له صفحة الكرت المحدد ويتفاعل مع كرته كالمصمم */
function cardPages(user: AccessSubject): AppPage[] {
  const pages: AppPage[] = [];
  if (user.showTaskCard) pages.push("dailyTasks");
  if (user.showProductionCard) pages.push("productionTasks");
  return pages.length > 0 ? [...pages, "notifications"] : [];
}

function basePagesFor(user: AccessSubject): AppPage[] {
  switch (user.accessRole) {
    case "admin":
    case "manager":
      return STAFF_PAGES;
    case "packer":
    case "operator":
      return RESTRICTED_PAGES;
    case "sales_accountant":
      return SALES_ACCOUNTANT_PAGES;
    case "sales_agent":
      return SALES_AGENT_PAGES;
    case "sales_agent_supervisor":
      return SALES_AGENT_SUPERVISOR_PAGES;
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

export function pagesFor(user: AccessSubject): AppPage[] {
  const base = basePagesFor(user);
  if (canAccessWorkspace(user)) return base;
  return [...new Set([...cardPages(user), ...base])];
}

export function canAccessPage(user: AccessSubject, page: AppPage): boolean {
  return pagesFor(user).includes(page);
}

export function defaultPathForRole(user: AccessSubject): string {
  if (canAccessWorkspace(user)) return "/workspace";
  if (isRestrictedRole(user.accessRole)) return "/withdrawals";
  if (user.accessRole === "sales_agent") return "/agent-orders";
  if (user.accessRole === "sales_agent_supervisor") return "/agent-supervisor";
  if (user.accessRole === "sales_accountant") return "/sales-follow-up";
  if (isSalesRole(user.accessRole)) return "/sales-orders";
  // المصمم: أول صفحة مهام لكرته، وإلا صفحته الشخصية
  if (user.showTaskCard) return "/daily-tasks";
  if (user.showProductionCard) return "/production-tasks";
  return "/profile";
}
