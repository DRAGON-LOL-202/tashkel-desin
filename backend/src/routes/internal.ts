import { Router } from "express";
import { timingSafeEqual } from "node:crypto";
import { env } from "../utils/env.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { processTimers } from "../utils/timerWatcher.js";

export const internalRouter = Router();

function secretMatches(given: string | undefined, expected: string): boolean {
  if (!given) return false;
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

// ping خارجي (مثل cron-job.org) كل دقيقة: يوقظ الخدمة المجانية ويشغّل فحص المؤقتات فوراً.
// السر في الترويسة x-cron-secret أو Authorization: Bearer؛ لا نقبله في الرابط حتى لا يظهر في السجلات.
// بدون CRON_SECRET يكون المسار غير موجود (404)، وبسر خاطئ 401 دون أي تفاصيل.
const tick = asyncHandler(async (req, res) => {
  const expected = env().CRON_SECRET;
  if (!expected) {
    res.status(404).json({ error: "غير موجود" });
    return;
  }
  const bearer = req.header("authorization")?.replace(/^Bearer\s+/i, "");
  if (!secretMatches(req.header("x-cron-secret") ?? bearer, expected)) {
    res.status(401).json({ error: "غير مصرّح" });
    return;
  }
  res.set("Cache-Control", "no-store");
  res.json({ ok: true, ...(await processTimers()) });
});

internalRouter.get("/tick", tick);
internalRouter.post("/tick", tick);
