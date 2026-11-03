import type { InventoryAccess, Role } from "../generated/prisma/client.ts";
import { prisma } from "../db.js";

// تعبئة ومشغل: لا يصلان إلا إلى السحب، وبمجموعات رئيسية (خامات / اكسسوارات وهدايا) يحددها المدير. المصمم: مستوى الوصول يحدده المدير. الإدارة: كامل دائماً.
export const RESTRICTED_ROLES: readonly Role[] = ["PACKER", "OPERATOR"];
export const isRestrictedRole = (u: { role: Role }) => RESTRICTED_ROLES.includes(u.role);

// أدوار المبيعات الإلكترونية المحصورة
export const SALES_ROLES: readonly Role[] = ["SALES_FLAGGER", "SALES_EDITOR", "SALES_SUPERVISOR"];
export const isSalesRole = (u: { role: Role }) => SALES_ROLES.includes(u.role);

export function effectiveInventoryAccess(u: { role: Role; inventoryAccess: InventoryAccess }): InventoryAccess {
  if (u.role === "ADMIN" || u.role === "MANAGER") return "FULL";
  if (isRestrictedRole(u)) return "WITHDRAW";
  if (isSalesRole(u)) return "NONE";
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

const RESERVED_INVENTORY_SEGMENTS = new Set(["/categories", "/groups", "/units", "/next-sku", "/movements", "/withdrawals"]);

function isPlainRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/**
 * القائمة البيضاء لأدوار المبيعات على مسارات /api/sales (نسبي لـ /api/sales).
 */
export function isSalesRouteAllowed(role: Role, method: string, path: string, body?: unknown): boolean {
  const p = path.length > 1 ? path.replace(/\/+$/, "") : path;

  if (role === "SALES_FLAGGER") {
    if (method === "GET" && p === "/orders") return true;
    if (method === "PATCH" && /^\/orders\/[^/]+$/.test(p)) {
      if (!isPlainRecord(body)) return false;
      const keys = Object.keys(body);
      return keys.length === 1 && keys[0] === "returnFlagged";
    }
    return false;
  }

  if (role === "SALES_EDITOR" || role === "SALES_SUPERVISOR") {
    if (method === "GET" && (p === "/products" || p === "/orders" || p === "/closers")) return true;
    if (method === "POST" && (p === "/products" || p === "/orders")) return true;
    if (method === "PATCH" && /^\/orders\/[^/]+$/.test(p)) {
      if (isPlainRecord(body) && ("status" in body || "damagedComponentIds" in body)) return false;
      return true;
    }
    if (method === "DELETE" && /^\/orders\/[^/]+$/.test(p)) return true;
    if (method === "POST" && /^\/orders\/[^/]+\/lines$/.test(p)) return true;
    if ((method === "PATCH" || method === "DELETE") && /^\/orders\/[^/]+\/lines\/[^/]+$/.test(p)) return true;
    if (method === "POST" && /^\/orders\/[^/]+\/lines\/[^/]+\/components$/.test(p)) return true;
    if ((method === "PATCH" || method === "DELETE") && /^\/orders\/[^/]+\/lines\/[^/]+\/components\/[^/]+$/.test(p)) return true;
    return false;
  }

  return false;
}

/**
 * القائمة البيضاء لأدوار المبيعات على مسارات /api/inventory (نسبي لـ /api/inventory).
 */
export function isSalesInventoryAllowed(role: Role, method: string, path: string, body?: unknown): boolean {
  const p = path.length > 1 ? path.replace(/\/+$/, "") : path;

  // منفّذ الأوردرات يحتاج قراءة الأصناف والتصنيفات فقط لاختيار مكوّنات الأوردر والمنتج الثابت (بدون أسعار)
  if (role === "SALES_EDITOR") {
    return method === "GET" && (p === "/" || p === "" || p === "/categories");
  }

  if (role === "SALES_SUPERVISOR") {
    if (method === "GET" && (p === "/" || p === "" || p === "/categories" || p === "/units" || p === "/next-sku")) return true;
    if (method === "GET" && /^\/[^/]+$/.test(p) && !RESERVED_INVENTORY_SEGMENTS.has(p)) return true;
    if (method === "GET" && /^\/[^/]+\/movements$/.test(p)) return true;
    if (method === "POST" && (p === "/" || p === "")) return true;
    if (method === "POST" && /^\/[^/]+\/movements$/.test(p)) {
      return isPlainRecord(body) && body.type === "IN";
    }
    return false;
  }

  return false;
}

/** القائمة البيضاء الكاملة لأدوار المبيعات الثلاثة على مستوى /api (fail-closed، نسبي لـ /api). */
export function isSalesRoleAllowed(role: Role, method: string, path: string, body?: unknown): boolean {
  const p = path.length > 1 ? path.replace(/\/+$/, "") : path;
  if (method === "GET" && (p === "/auth/me" || p === "/sync" || p === "/sync/stream")) return true;
  if (method === "POST" && (p === "/auth/logout" || p === "/auth/login")) return true;
  if (method === "PATCH" && p === "/users/me") return true;
  if (p === "/sales" || p.startsWith("/sales/")) {
    return isSalesRouteAllowed(role, method, p.slice("/sales".length) || "/", body);
  }
  if (p === "/inventory" || p.startsWith("/inventory/")) {
    return isSalesInventoryAllowed(role, method, p.slice("/inventory".length) || "/", body);
  }
  return false;
}
