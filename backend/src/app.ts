import express from "express";
import helmet from "helmet";
import cors from "cors";
import { env } from "./utils/env.js";
import { authRouter } from "./routes/auth.js";
import { usersRouter } from "./routes/users.js";
import { tasksRouter } from "./routes/tasks.js";
import { feedbackRouter } from "./routes/feedback.js";
import { goalsRouter } from "./routes/goals.js";
import { calendarEventsRouter } from "./routes/calendarEvents.js";
import { filesRouter } from "./routes/files.js";
import { syncRouter } from "./routes/sync.js";
import { bumpDataVersion } from "./utils/syncVersion.js";
import { errorHandler, notFoundHandler } from "./middleware/error.js";

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
    if (WRITE_METHODS.has(req.method) && !req.path.startsWith("/api/auth")) {
      res.on("finish", () => {
        if (res.statusCode < 400) bumpDataVersion();
      });
    }
    next();
  });

  app.get("/api/health", (_req, res) => res.json({ status: "ok" }));
  app.use("/api/auth", authRouter);
  app.use("/api/users", usersRouter);
  app.use("/api/tasks", tasksRouter);
  app.use("/api/feedback", feedbackRouter);
  app.use("/api/goals", goalsRouter);
  app.use("/api/calendar-events", calendarEventsRouter);
  app.use("/api/files", filesRouter);
  app.use("/api/sync", syncRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
