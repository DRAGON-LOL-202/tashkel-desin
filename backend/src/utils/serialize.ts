import type { User } from "../generated/prisma/client.ts";
import { effectiveInventoryAccess, isRestrictedRole } from "./inventoryAccess.js";

// allowedGroupIds: تُمرَّر لقوائم الإدارة (وتظهر لدوري تعبئة/مشغل فقط)
export function publicUser(u: User, allowedGroupIds?: string[]) {
  return {
    id: u.id,
    name: u.name,
    username: u.username,
    email: u.email,
    role: u.role.toLowerCase() as "admin" | "manager" | "designer" | "packer" | "operator",
    inventoryAccess: effectiveInventoryAccess(u).toLowerCase() as "none" | "withdraw" | "full",
    jobTitle: u.jobTitle,
    showTaskCard: u.showTaskCard,
    isActive: u.isActive,
    isSystemUser: u.isSystemUser,
    createdAt: u.createdAt.toISOString(),
    ...(isRestrictedRole(u) && allowedGroupIds ? { allowedGroupIds } : {}),
  };
}
export type PublicUser = ReturnType<typeof publicUser>;
