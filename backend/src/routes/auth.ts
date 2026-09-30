import { Router } from "express";
import bcrypt from "bcryptjs";
import rateLimit from "express-rate-limit";
import { prisma } from "../db.js";
import { requireAuth, signToken } from "../middleware/auth.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { HttpError, unauthorized } from "../utils/httpError.js";
import { publicUser } from "../utils/serialize.js";
import { loginSchema } from "../validators/auth.js";
import { env } from "../utils/env.js";

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: env().NODE_ENV === "test" ? 1000 : 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "محاولات كثيرة، حاول لاحقاً", code: "RATE_LIMIT" },
});

// hash وهمي لتقليل الفرق الزمني عند عدم وجود المستخدم
const DUMMY_HASH = bcrypt.hashSync("dummy-password-not-used", 10);

export const authRouter = Router();

authRouter.post(
  "/login",
  limiter,
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

// JWT بلا حالة: الخروج يتم بإتلاف التوكن في العميل. المسار موجود لتوحيد الواجهة.
authRouter.post("/logout", requireAuth, (_req, res) => {
  res.json({ ok: true });
});
