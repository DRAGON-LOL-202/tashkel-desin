import express from "express";
import helmet from "helmet";
import cors from "cors";
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
import { bumpDataVersion } from "./utils/syncVersion.js";
import { errorHandler, notFoundHandler } from "./middleware/error.js";
import { restrictedRoleGate } from "./middleware/auth.js";

export function createApp() {
  const app = express();
  app.disable("x-powered-by");
  app.set("trust proxy", 1);
  app.use(helmet());
  const origins = env().FRONTEND_URL.split(",").map((s: string) => s.trim().replace(/\/$/, ""));
  app.use(cors({ origin: origins, methods: ["GET", "POST", "PATCH", "PUT", "DELETE"], maxAge: 600 }));
  app.use(express.json({ limit: "15mb" }));

  // أي عملية كتابة ناجحة (غير تسجيل الدخول) ترفع رقم نسخة البيانات ليعرف الجميع أن هناك تغييراً
  const WRITE_METHODS = new Set(["POST", "PATCH", "PUT", "DELETE"]);
  app.use((req, res, next) => {
    // اشتراكات الأجهزة وping المراقب لا تغيّر بيانات يراها الآخرون، فلا نوقظ كل الواجهات لإعادة التحميل بسببها
    const silent = req.path.startsWith("/api/auth") || req.path.startsWith("/api/push") || req.path.startsWith("/api/internal");
    if (WRITE_METHODS.has(req.method) && !silent) {
      res.on("finish", () => {
        if (res.statusCode < 400) bumpDataVersion();
      });
    }
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
