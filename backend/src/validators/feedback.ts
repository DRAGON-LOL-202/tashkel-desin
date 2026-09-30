import { z } from "zod";
import { attachmentsSchema as attachments } from "./attachments.js";

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "التاريخ بصيغة YYYY-MM-DD")
  .refine((s) => !Number.isNaN(Date.parse(`${s}T00:00:00Z`)) && new Date(`${s}T00:00:00Z`).toISOString().slice(0, 10) === s, "تاريخ غير صالح");

const typeInput = z
  .string()
  .transform((s) => s.toUpperCase())
  .pipe(z.enum(["PROBLEM", "OPERATIONAL", "IDEA"]));

const statusInput = z
  .string()
  .transform((s) => s.toUpperCase())
  .pipe(z.enum(["OPEN", "RESOLVED"]));


const title = z.string().trim().min(1, "العنوان مطلوب").max(200);
const description = z.string().trim().max(5000);

export const createFeedbackSchema = z.object({
  title,
  description: description.default(""),
  attachments: attachments.optional(),
  type: typeInput,
  date: isoDate,
});

export const updateFeedbackSchema = z
  .object({
    title: title.optional(),
    description: description.optional(),
    attachments: attachments.optional(),
    type: typeInput.optional(),
    date: isoDate.optional(),
    status: statusInput.optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: "لا توجد حقول للتعديل" });

export const listFeedbackQuerySchema = z.object({
  type: typeInput.optional(),
  status: statusInput.optional(),
  from: isoDate.optional(),
  to: isoDate.optional(),
});

// حذف جماعي (نفس خيارات الواجهة: النوع + فترة زمنية). بدون أي خيار = حذف الكل.
export const bulkDeleteSchema = z.object({
  type: typeInput.optional(),
  fromDate: isoDate.optional(),
  toDate: isoDate.optional(),
});
