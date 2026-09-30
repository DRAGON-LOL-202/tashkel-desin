import type { ErrorRequestHandler, RequestHandler } from "express";
import { ZodError } from "zod";
import { HttpError } from "../utils/httpError.js";

export const notFoundHandler: RequestHandler = (_req, res) => {
  res.status(404).json({ error: "المسار غير موجود", code: "NOT_FOUND" });
};

export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof ZodError) {
    return res.status(400).json({
      error: "بيانات غير صالحة",
      code: "VALIDATION",
      details: err.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
    });
  }
  if (err instanceof HttpError) {
    return res.status(err.status).json({ error: err.message, code: err.code });
  }
  if (err?.type === "entity.too.large") {
    return res.status(413).json({ error: "حجم الطلب كبير جداً", code: "TOO_LARGE" });
  }
  if (err?.type === "entity.parse.failed") {
    return res.status(400).json({ error: "JSON غير صالح", code: "BAD_JSON" });
  }
  console.error("Unhandled error:", err?.name, err?.message);
  res.status(500).json({ error: "حدث خطأ غير متوقع", code: "INTERNAL" });
};
