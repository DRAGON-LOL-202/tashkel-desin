import { Router } from "express";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import { prisma } from "../db.js";
import { requireAuth } from "../middleware/auth.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { HttpError } from "../utils/httpError.js";
import { buildPayload, pushConfigured, sendPushToUsers, vapidPublicKey } from "../utils/push.js";

// اشتراكات Web Push لأجهزة المستخدم الحالي فقط: كل استعلام مقيَّد بـ userId من التوكن.
export const pushRouter = Router();
pushRouter.use(requireAuth);

const subscribeBody = z.object({
  endpoint: z.string().url().max(2048).startsWith("https://", "يجب أن يكون endpoint بروتوكول https"),
  keys: z.object({ p256dh: z.string().min(10).max(256), auth: z.string().min(10).max(256) }),
});
const unsubscribeBody = z.object({ endpoint: z.string().min(1).max(2048) });

const deviceCount = (userId: string) => prisma().pushSubscription.count({ where: { userId } });

// هل الميزة مفعّلة على الخادم + المفتاح العام للمتصفح (لا حاجة لمتغير بيئة في الواجهة)
pushRouter.get(
  "/config",
  asyncHandler(async (req, res) => {
    res.set("Cache-Control", "no-store");
    res.json({ enabled: pushConfigured(), publicKey: vapidPublicKey(), devices: await deviceCount(req.user!.id) });
  })
);

// تسجيل جهاز. endpoint فريد: لو كان مسجَّلاً لمستخدم آخر (جهاز مشترك) يُنقل للمستخدم الحالي.
pushRouter.post(
  "/subscribe",
  asyncHandler(async (req, res) => {
    if (!pushConfigured()) throw new HttpError(503, "إشعارات الهاتف غير مفعّلة على الخادم");
    const body = subscribeBody.parse(req.body);
    const userAgent = req.header("user-agent")?.slice(0, 300) ?? null;
    await prisma().pushSubscription.upsert({
      where: { endpoint: body.endpoint },
      create: { userId: req.user!.id, endpoint: body.endpoint, p256dh: body.keys.p256dh, auth: body.keys.auth, userAgent },
      update: { userId: req.user!.id, p256dh: body.keys.p256dh, auth: body.keys.auth, userAgent },
    });
    res.json({ ok: true, devices: await deviceCount(req.user!.id) });
  })
);

// إلغاء جهاز (يشمل تسجيل الخروج). يحذف اشتراك المستخدم الحالي فقط؛ endpoint لمستخدم آخر لا يتأثر.
pushRouter.post(
  "/unsubscribe",
  asyncHandler(async (req, res) => {
    const { endpoint } = unsubscribeBody.parse(req.body);
    await prisma().pushSubscription.deleteMany({ where: { endpoint, userId: req.user!.id } });
    res.json({ ok: true, devices: await deviceCount(req.user!.id) });
  })
);

const testLimiter = rateLimit({ windowMs: 60_000, limit: 6, standardHeaders: true, legacyHeaders: false, message: { error: "محاولات كثيرة، حاول بعد دقيقة" } });

// إشعار تجريبي لأجهزتي أنا فقط (لا يُنشئ سجلاً في صفحة الإشعارات)
pushRouter.post(
  "/test",
  testLimiter,
  asyncHandler(async (req, res) => {
    if (!pushConfigured()) throw new HttpError(503, "إشعارات الهاتف غير مفعّلة على الخادم");
    const payload = buildPayload({ type: "PUSH_TEST", title: "تجربة التنبيهات", message: "وصلك هذا التنبيه، إشعارات الهاتف تعمل ✅" });
    const result = await sendPushToUsers([req.user!.id], { ...payload, tag: "push-test" });
    res.json({ ok: true, ...result });
  })
);
