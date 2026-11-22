import express from "express";
import helmet from "helmet";
import cors from "cors";
import rateLimit from "express-rate-limit";
import { env } from "./utils/env.js";
import { authRouter } from "./routes/auth.js";
import { usersRouter } from "./routes/users.js";
import { tasksRouter } from "./routes/tasks.js";
import { feedbackRouter } from "./routes/feedback.js";
import { goalsRouter } from "./routes/goals.js";
import { productsRouter } from "./routes/products.js";
import { calendarEventsRouter } from "./routes/calendarEvents.js";
import { filesRouter } from "./routes/files.js";
import { attendanceRouter } from "./routes/attendance.js";
import { syncRouter } from "./routes/sync.js";
import { notificationsRouter } from "./routes/notifications.js";
import { internalRouter } from "./routes/internal.js";
import { pushRouter } from "./routes/push.js";
import { inventoryRouter } from "./routes/inventory.js";
import { salesRouter } from "./routes/sales.js";
import { agentRouter, salesAgentsAdminRouter } from "./routes/agent.js";
import { accountingRouter } from "./routes/accounting.js";
import { bumpDataVersion, type SyncChannel } from "./utils/syncVersion.js";
import { errorHandler, notFoundHandler } from "./middleware/error.js";
import { restrictedRoleGate } from "./middleware/auth.js";

const LARGE_JSON_PREFIXES = ["/api/tasks", "/api/feedback", "/api/products", "/api/inventory"] as const;

export function channelsForWritePath(path: string): SyncChannel[] {
  if (path.startsWith("/api/tasks")) return ["tasks", "notifications"];
  if (path.startsWith("/api/attendance") || path.startsWith("/api/feedback") || path.startsWith("/api/goals") || path.startsWith("/api/calendar-events")) {
    return ["tasks"];
  }
  if (path.startsWith("/api/users")) return ["users", "tasks", "notifications", "accounting", "sales", "inventory"];
  if (path.startsWith("/api/inventory")) return ["inventory", "sales", "notifications"];
  if (path.startsWith("/api/sales-agents")) return ["accounting", "sales", "users"];
  if (path.startsWith("/api/sales")) return ["sales", "inventory", "accounting", "notifications"];
  if (path.startsWith("/api/agent")) return ["sales", "accounting"];
  if (path.startsWith("/api/accounting")) return ["accounting", "sales"];
  if (path.startsWith("/api/notifications")) return ["notifications"];
  return ["general"];
}

export function createApp() {
  const app = express();
  app.disable("x-powered-by");
  app.set("trust proxy", 1);
  app.use(helmet());
  const origins = env().FRONTEND_URL.split(",").map((s: string) => s.trim().replace(/\/$/, ""));
  app.use(cors({ origin: origins, methods: ["GET", "POST", "PATCH", "PUT", "DELETE"], maxAge: 600 }));

  // حد عام معتدل لحماية الذاكرة (1MB)، وحد أكبر (15MB) فقط للمسارات التي تقبل مرفقات base64 قديمة
  const defaultJson = express.json({ limit: "1mb" });
  const mediaJson = express.json({ limit: "15mb" });
  app.use((req, res, next) => {
    const needsLarge = LARGE_JSON_PREFIXES.some((p) => req.path === p || req.path.startsWith(`${p}/`));
    return (needsLarge ? mediaJson : defaultJson)(req, res, next);
  });

  // حد عام خفيف على واجهة برمجة التطبيقات باستثناء الصحة والمؤقتات والبث المفتوح
  const apiLimiter = rateLimit({
    windowMs: 60 * 1000,
    limit: env().NODE_ENV === "test" ? 100_000 : 600,
    skip: (req) => req.path === "/health" || req.path.startsWith("/internal") || req.path === "/sync/stream",
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: "طلبات كثيرة جداً، تمهل قليلاً", code: "RATE_LIMIT" },
  });
  app.use("/api", apiLimiter);

  // أي عملية كتابة ناجحة (غير تسجيل الدخول) ترفع رقم النسخة للقنوات المتأثرة ليعرف المعنيون فقط أن هناك تغييراً
  const WRITE_METHODS = new Set(["POST", "PATCH", "PUT", "DELETE"]);
  app.use((req, res, next) => {
    // نلتقط المسار الكامل قبل next() لأن الراوترات الفرعية تقص البادئة من req.url فيُصبح req.path ناقصاً عند finish
    const writePath = req.path;
    // اشتراكات الأجهزة وping المراقب ورفع/حذف الملفات المؤقت لا تغيّر بيانات يراها الآخرون
    const silent =
      writePath.startsWith("/api/auth") ||
      writePath.startsWith("/api/push") ||
      writePath.startsWith("/api/internal") ||
      writePath.startsWith("/api/files");
    if (WRITE_METHODS.has(req.method) && !silent) {
      const affectedChannels = channelsForWritePath(writePath);
      res.on("finish", () => {
        if (res.statusCode < 400) bumpDataVersion(affectedChannels);
      });
    }
    next();
  });

  app.use("/api", (_req, res, next) => {
    res.setHeader("Cache-Control", "no-store");
    next();
  });

  app.get("/api/health", (_req, res) => res.json({ status: "ok" }));
  app.use("/api", restrictedRoleGate);
  app.use("/api/auth", authRouter);
  app.use("/api/users", usersRouter);
  app.use("/api/tasks", tasksRouter);
  app.use("/api/feedback", feedbackRouter);
  app.use("/api/goals", goalsRouter);
  app.use("/api/products", productsRouter);
  app.use("/api/inventory", inventoryRouter);
  app.use("/api/sales", salesRouter);
  app.use("/api/agent", agentRouter);
  app.use("/api/sales-agents", salesAgentsAdminRouter);
  app.use("/api/accounting", accountingRouter);
  app.use("/api/calendar-events", calendarEventsRouter);
  app.use("/api/files", filesRouter);
  app.use("/api/attendance", attendanceRouter);
  app.use("/api/sync", syncRouter);
  app.use("/api/notifications", notificationsRouter);
  app.use("/api/push", pushRouter);
  app.use("/api/internal", internalRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
