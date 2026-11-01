import type { InventoryAccess, Role } from "../generated/prisma/client.ts";
import { prisma } from "../db.js";

// تعبئة ومشغل: لا يصلان إلا إلى السحب، وبمجموعات رئيسية (خامات / اكسسوارات وهدايا) يحددها المدير. المصمم: مستوى الوصول يحدده المدير. الإدارة: كامل دائماً.
export const RESTRICTED_ROLES: readonly Role[] = ["PACKER", "OPERATOR"];
export const isRestrictedRole = (u: { role: Role }) => RESTRICTED_ROLES.includes(u.role);

export function effectiveInventoryAccess(u: { role: Role; inventoryAccess: InventoryAccess }): InventoryAccess {
  if (u.role === "ADMIN" || u.role === "MANAGER") return "FULL";
  if (isRestrictedRole(u)) return "WITHDRAW";
  return u.inventoryAccess;
}

/**
 * معرّفات التصنيفات المسموحة لمستخدم مقيَّد = كل التصنيفات التابعة لمجموعاته الرئيسية.
 * تُقرأ من القاعدة في كل طلب فتسري تغييرات المجموعات ونقل التصنيفات فوراً؛ التصنيف بلا مجموعة محجوب (deny by default).
 */
export async function allowedCategoryIds(userId: string, db: Pick<ReturnType<typeof prisma>, "inventoryCategory"> = prisma()): Promise<string[]> {
  const rows = await db.inventoryCategory.findMany({ where: { group: { allowedUsers: { some: { userId } } } }, select: { id: true } });
  return rows.map((r) => r.id);
}

/**
 * القائمة البيضاء لمن يملك «السحب فقط»: صفحة السحب تحتاج هذه الأربعة فقط.
 * `path` نسبي لـ /api/inventory (مثل "/" أو "/categories" أو "/withdrawals").
 */
export function isWithdrawOnlyAllowed(method: string, path: string): boolean {
  const p = path.length > 1 ? path.replace(/\/+$/, "") : path;
  if (method === "GET" && (p === "/" || p === "" || p === "/categories" || p === "/withdrawals")) return true;
  return method === "POST" && p === "/withdrawals";
}

/** القائمة البيضاء الكاملة للدورين المقيَّدين على مستوى /api (نسبي لـ /api). */
export function isRestrictedRoleAllowed(method: string, path: string): boolean {
  const p = path.length > 1 ? path.replace(/\/+$/, "") : path;
  if (method === "GET" && (p === "/auth/me" || p === "/sync" || p === "/sync/stream")) return true;
  if (method === "POST" && (p === "/auth/logout" || p === "/auth/login")) return true;
  if (method === "PATCH" && p === "/users/me") return true;
  if (p === "/inventory" || p.startsWith("/inventory/")) return isWithdrawOnlyAllowed(method, p.slice("/inventory".length) || "/");
  return false;
}
