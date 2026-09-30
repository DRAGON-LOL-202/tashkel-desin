import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import type { Role, User } from "../generated/prisma/client.ts";
import { prisma } from "../db.js";
import { env } from "../utils/env.js";
import { forbidden, unauthorized } from "../utils/httpError.js";
import { asyncHandler } from "../utils/asyncHandler.js";

declare module "express-serve-static-core" {
  interface Request {
    user?: User;
  }
}

export function signToken(user: Pick<User, "id" | "role">): string {
  return jwt.sign({ sub: user.id, role: user.role }, env().JWT_SECRET, { expiresIn: "12h" });
}

// المستخدم الحالي يُحدَّد من قاعدة البيانات (الدور والتفعيل)، ولا يُوثق بمحتوى التوكن وحده.
export const requireAuth = asyncHandler(async (req: Request, _res: Response, next: NextFunction) => {
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
  req.user = user;
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
