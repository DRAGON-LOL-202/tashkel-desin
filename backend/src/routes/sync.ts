import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";
import { currentDataVersion, onDataVersionChange } from "../utils/syncVersion.js";

export const syncRouter = Router();

// فحص خفيف (بدون استعلامات بيانات): شبكة أمان تستخدمها الواجهة إن تعذّر الاتصال المفتوح.
syncRouter.get("/", requireAuth, (_req, res) => {
  res.set("Cache-Control", "no-store");
  res.json({ version: currentDataVersion() });
});

// اتصال مفتوح (Server-Sent Events): يدفع الخادم الرقم الجديد لحظة حدوث أي تغيير عند أي مستخدم.
// نبضة كل 25 ثانية تُبقي الاتصال حياً عبر وسطاء الشبكة (Render/Cloudflare) وتكشف الانقطاع.
syncRouter.get("/stream", requireAuth, (req, res) => {
  res.status(200).set({
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });
  res.flushHeaders();

  const send = (version: string) => res.write(`data: ${JSON.stringify({ version })}\n\n`);
  send(currentDataVersion());

  const off = onDataVersionChange(send);
  const heartbeat = setInterval(() => res.write(": ping\n\n"), 25_000);

  req.on("close", () => {
    clearInterval(heartbeat);
    off();
  });
});
