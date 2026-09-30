import { z } from "zod";

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "التاريخ بصيغة YYYY-MM-DD")
  .refine((s) => !Number.isNaN(Date.parse(`${s}T00:00:00Z`)) && new Date(`${s}T00:00:00Z`).toISOString().slice(0, 10) === s, "تاريخ غير صالح");

const title = z.string().trim().min(1, "العنوان مطلوب").max(200);
const description = z.string().trim().max(2000);
const color = z.string().trim().regex(/^#[0-9a-fA-F]{6}$/, "اللون بصيغة #RRGGBB");

export const createCalendarEventSchema = z
  .object({
    title,
    description: description.optional(),
    startDate: isoDate,
    endDate: isoDate,
    color: color.optional(),
  })
  .refine((v) => v.endDate >= v.startDate, { message: "تاريخ النهاية قبل البداية", path: ["endDate"] });

export const updateCalendarEventSchema = z
  .object({
    title: title.optional(),
    description: description.optional(),
    startDate: isoDate.optional(),
    endDate: isoDate.optional(),
    color: color.optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: "لا توجد حقول للتعديل" });

// فلترة بالتداخل مع نطاق: from/to (كلاهما اختياري).
export const listCalendarEventsQuerySchema = z
  .object({ from: isoDate.optional(), to: isoDate.optional() })
  .refine((v) => !v.from || !v.to || v.to >= v.from, { message: "نطاق التاريخ غير صالح", path: ["to"] });
