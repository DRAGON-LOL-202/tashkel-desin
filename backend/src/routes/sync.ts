import { Router } from "express";
import { authenticateToken, requireAuth } from "../middleware/auth.js";
import { currentSyncSnapshot, onDataVersionChange, type SyncSnapshot } from "../utils/syncVersion.js";

export const syncRouter = Router();

// فحص خفيف (بدون استعلامات بيانات): شبكة أمان تستخدمها الواجهة إن تعذّر الاتصال المفتوح.
syncRouter.get("/", requireAuth, (_req, res) => {
  res.set("Cache-Control", "no-store");
  res.json(currentSyncSnapshot());
});

// اتصال مفتوح (Server-Sent Events): يدفع الخادم النسخة والقنوات المتأثرة لحظة حدوث أي تغيير عند أي مستخدم.
// نبضة كل 25 ثانية تُبقي الاتصال حياً عبر وسطاء الشبكة (Render/Cloudflare)، ونعيد فحص الجلسة كل 60 ثانية.
syncRouter.get("/stream", requireAuth, (req, res) => {
  res.status(200).set({
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });
  res.flushHeaders();

  let closed = false;
  const safeWrite = (chunk: string) => {
    if (closed || res.writableEnded || res.destroyed) return;
    try {
      res.write(chunk);
    } catch {
      cleanup();
    }
  };

  const send = (snapshot: SyncSnapshot) => safeWrite(`data: ${JSON.stringify(snapshot)}\n\n`);
  const off = onDataVersionChange(send);
  const heartbeat = setInterval(() => safeWrite(": ping\n\n"), 25_000);

  const token = req.headers.authorization?.startsWith("Bearer ") ? req.headers.authorization.slice(7) : "";
  const authCheck = setInterval(() => {
    if (!token) {
      cleanup();
      return;
    }
    void authenticateToken(token).catch(() => {
      cleanup();
    });
  }, 60_000);

  const cleanup = () => {
    if (closed) return;
    closed = true;
    clearInterval(heartbeat);
    clearInterval(authCheck);
    off();
    if (!res.writableEnded && !res.destroyed) {
      try {
        res.end();
      } catch {
        // ignore
      }
    }
  };

  send(currentSyncSnapshot());
  req.on("close", cleanup);
});
