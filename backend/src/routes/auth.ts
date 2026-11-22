import { Router } from "express";
import bcrypt from "bcryptjs";
import rateLimit, { ipKeyGenerator } from "express-rate-limit";
import { prisma } from "../db.js";
import { requireAuth, signToken } from "../middleware/auth.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { HttpError, unauthorized } from "../utils/httpError.js";
import { publicUser } from "../utils/serialize.js";
import { loginSchema } from "../validators/auth.js";
import { env } from "../utils/env.js";

const isTest = env().NODE_ENV === "test";

// حدّان متكاملان: حد عام أعلى على الـ IP (لا يحجب المكتب المشترك عند خطأ موظف واحد) + حد صارم لكل (IP + اسم مستخدم)
const ipLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: isTest ? 1000 : 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "محاولات كثيرة، حاول لاحقاً", code: "RATE_LIMIT" },
});

const accountLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: isTest ? 1000 : 15,
  keyGenerator: (req) => {
    const rawUser = typeof req.body === "object" && req.body !== null && typeof (req.body as Record<string, unknown>).username === "string"
      ? (req.body as Record<string, unknown>).username as string
      : "";
    return `${ipKeyGenerator(req.ip ?? "")}:${rawUser.trim().toLowerCase().slice(0, 64)}`;
  },
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "محاولات كثيرة لهذا الحساب، حاول لاحقاً", code: "RATE_LIMIT" },
});

// hash وهمي لتقليل الفرق الزمني عند عدم وجود المستخدم
const DUMMY_HASH = bcrypt.hashSync("dummy-password-not-used", 10);

export const authRouter = Router();

authRouter.post(
  "/login",
  ipLimiter,
  accountLimiter,
  asyncHandler(async (req, res) => {
    const { username, password } = loginSchema.parse(req.body);
    const user = await prisma().user.findUnique({ where: { username: username.toLowerCase() } });
    const ok = await bcrypt.compare(password, user?.passwordHash ?? DUMMY_HASH);
    if (!user || !ok) throw unauthorized("اسم المستخدم أو كلمة المرور غير صحيحة");
    if (!user.isActive) throw new HttpError(403, "هذا الحساب معطّل", "ACCOUNT_DISABLED");
    res.json({ token: signToken(user), user: publicUser(user) });
  })
);

authRouter.get("/me", requireAuth, (req, res) => {
  res.json({ user: publicUser(req.user!) });
});

// رفع tokenVersion يُبطل التوكن الحالي فوراً على الخادم قبل إتلافه في المتصفح
authRouter.post(
  "/logout",
  requireAuth,
  asyncHandler(async (req, res) => {
    await prisma().user.update({ where: { id: req.user!.id }, data: { tokenVersion: { increment: 1 } } });
    res.json({ ok: true });
  })
);
