import type { UserRole } from "../types";

export type AppPage = "dailyTasks" | "feedback" | "goals" | "schedule" | "users" | "products" | "inventory" | "withdrawals" | "manageUsers" | "profile" | "notifications";

const rolePages: Record<UserRole, AppPage[]> = {
  admin: ["dailyTasks", "notifications", "feedback", "goals", "schedule", "users", "products", "inventory", "withdrawals", "manageUsers", "profile"],
  manager: ["dailyTasks", "notifications", "feedback", "goals", "schedule", "users", "products", "inventory", "withdrawals", "manageUsers", "profile"],
  designer: ["dailyTasks", "notifications", "feedback", "inventory", "withdrawals", "profile"],
};

export function canAccessPage(role: UserRole, page: AppPage): boolean {
  return rolePages[role].includes(page);
}

export function defaultPathForRole(role: UserRole): string {
  return role === "designer" ? "/daily-tasks" : "/";
}
