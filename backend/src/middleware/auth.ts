import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import type { Role, User } from "../generated/prisma/client.ts";
import { prisma } from "../db.js";
import { env } from "../utils/env.js";
import { forbidden, unauthorized } from "../utils/httpError.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { hasTaskCard, isCardHolderRouteAllowed, isRestrictedRole, isRestrictedRoleAllowed, isSalesRole, isSalesRoleAllowed } from "../utils/inventoryAccess.js";

declare module "express-serve-static-core" {
  interface Request {
    user?: User;
  }
}

export function signToken(user: Pick<User, "id" | "role">): string {
  return jwt.sign({ sub: user.id, role: user.role }, env().JWT_SECRET, { expiresIn: "12h" });
}

// المستخدم الحالي يُحدَّد من قاعدة البيانات (الدور والتفعيل)، ولا يُوثق بمحتوى التوكن وحده.
async function authenticate(req: Request): Promise<User> {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) throw unauthorized();
  let sub: string;
  try {
    const payload = jwt.verify(header.slice(7), env().JWT_SECRET) as jwt.JwtPayload;
    if (typeof payload.sub !== "string") throw new Error("bad");
    sub = payload.sub;
  } catch {
    throw unauthorized("الجلسة غير صالحة أو منتهية");
  }
  const user = await prisma().user.findUnique({ where: { id: sub } });
  if (!user || !user.isActive) throw unauthorized("الحساب غير متاح");
  return user;
}

// req.user لا يُضبط إلا من هذه الدوال (بعد التحقق من التوكن)، فإن وُجد من البوابة لا نعيد الاستعلام.
export const requireAuth = asyncHandler(async (req: Request, _res: Response, next: NextFunction) => {
  if (!req.user) req.user = await authenticate(req);
  next();
});

/**
 * بوابة القائمة البيضاء (fail-closed) تُركَّب مرة واحدة على /api قبل كل الراوترات:
 * «تعبئة» و«مشغل» (وأدوار المبيعات) لا يصلون إلا إلى مساراتهم والملف الشخصي والمزامنة، وأي مسار آخر (حتى المستقبلي) ← 403؛
 * ويُستثنى مسارات المهام/الحضور/الإشعارات لمن لديه كرت (hasTaskCard).
 * لا تعترض غير المصادَق عليهم: تتركهم للراوترات (401 / تسجيل الدخول).
 */
export const restrictedRoleGate = asyncHandler(async (req: Request, _res: Response, next: NextFunction) => {
  if (!req.headers.authorization?.startsWith("Bearer ")) return next();
  let user: User;
  try {
    user = await authenticate(req);
  } catch {
    return next(); // توكن/حساب غير صالح: الراوتر نفسه يردّ 401
  }
  req.user = user;
  // صاحب كرت (تصميم/إنتاج) من أي دور يصل أيضاً لمسارات مهامه وحضوره وإشعاراته
  const cardRoute = hasTaskCard(user) && isCardHolderRouteAllowed(req.path);
  if (isRestrictedRole(user) && !isRestrictedRoleAllowed(req.method, req.path) && !cardRoute) return next(forbidden());
  if (isSalesRole(user) && !isSalesRoleAllowed(user.role, req.method, req.path, req.body) && !cardRoute) return next(forbidden());
  next();
});

export const requireRole =
  (...roles: Role[]) =>
  (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) return next(unauthorized());
    if (!roles.includes(req.user.role)) return next(forbidden());
    next();
  };

export const isStaff = (u: Pick<User, "role">) => u.role === "ADMIN" || u.role === "MANAGER";
export const requireStaff = requireRole("ADMIN", "MANAGER");
