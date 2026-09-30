import { z } from "zod";

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "التاريخ بصيغة YYYY-MM-DD")
  .refine((s) => !Number.isNaN(Date.parse(`${s}T00:00:00Z`)) && new Date(`${s}T00:00:00Z`).toISOString().slice(0, 10) === s, "تاريخ غير صالح");

const typeInput = z
  .string()
  .transform((s) => s.toUpperCase())
  .pipe(z.enum(["WEEKLY", "MONTHLY", "QUARTERLY"]));

const statusInput = z
  .string()
  .transform((s) => s.toUpperCase())
  .pipe(z.enum(["NOT_STARTED", "IN_PROGRESS", "COMPLETED", "PAUSED"]));

const title = z.string().trim().min(1, "العنوان مطلوب").max(200);
const description = z.string().trim().max(2000);
const target = z.number().int("الهدف رقم صحيح").min(1, "الهدف 1 على الأقل").max(1_000_000);
const current = z.number().int("التقدّم رقم صحيح").min(0, "التقدّم لا يكون سالباً").max(1_000_000);

export const createGoalSchema = z
  .object({
    title,
    description: description.optional(),
    type: typeInput,
    target: target.default(1),
    current: current.default(0),
    startDate: isoDate,
    endDate: isoDate.optional(), // بدونه: أسبوعي +6 / شهري +29 / ربع سنوي +89 يوماً (كالواجهة)
    status: statusInput.optional(),
  })
  .refine((v) => !v.endDate || v.endDate >= v.startDate, { message: "تاريخ النهاية قبل البداية", path: ["endDate"] });

export const updateGoalSchema = z
  .object({
    title: title.optional(),
    description: description.optional(),
    type: typeInput.optional(),
    target: target.optional(),
    current: current.optional(),
    startDate: isoDate.optional(),
    endDate: isoDate.optional(),
    status: statusInput.optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: "لا توجد حقول للتعديل" });

export const listGoalsQuerySchema = z.object({
  type: typeInput.optional(),
  status: statusInput.optional(),
});
