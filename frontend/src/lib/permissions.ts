import type { UserRole } from "../types";

export type AppPage = "dailyTasks" | "feedback" | "goals" | "schedule" | "users" | "manageUsers" | "profile";

const rolePages: Record<UserRole, AppPage[]> = {
  admin: ["dailyTasks", "feedback", "goals", "schedule", "users", "manageUsers", "profile"],
  manager: ["dailyTasks", "feedback", "goals", "schedule", "users", "manageUsers", "profile"],
  designer: ["dailyTasks", "feedback", "profile"],
};

export function canAccessPage(role: UserRole, page: AppPage): boolean {
  return rolePages[role].includes(page);
}

export function defaultPathForRole(role: UserRole): string {
  return role === "designer" ? "/daily-tasks" : "/";
}
