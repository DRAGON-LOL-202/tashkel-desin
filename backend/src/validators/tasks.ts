import { z } from "zod";
import { attachmentsSchema as attachments } from "./attachments.js";

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "التاريخ بصيغة YYYY-MM-DD")
  .refine((s) => !Number.isNaN(Date.parse(`${s}T00:00:00Z`)) && new Date(`${s}T00:00:00Z`).toISOString().slice(0, 10) === s, "تاريخ غير صالح");

const id = z.string().min(1).max(64);

const priorityInput = z
  .string()
  .transform((s) => s.toUpperCase())
  .pipe(z.enum(["LOW", "MEDIUM", "HIGH"]));


const title = z.string().trim().min(1, "العنوان مطلوب").max(200);
const description = z.string().trim().max(5000);
const target = z.number().int().min(1).max(1_000_000);
const current = z.number().int().min(0).max(1_000_000);

export const createTaskSchema = z.object({
  title,
  description: description.optional(),
  attachments: attachments.optional(),
  target: target.default(1),
  current: current.default(0),
  priority: priorityInput.default("MEDIUM"),
  date: isoDate,
  assigneeId: id.optional(),
  parentId: id.optional(),
});

export const updateTaskSchema = z
  .object({
    title: title.optional(),
    description: description.optional(),
    attachments: attachments.optional(),
    target: target.optional(),
    current: current.optional(),
    priority: priorityInput.optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: "لا توجد حقول للتعديل" });

export const listQuerySchema = z.object({
  date: isoDate.optional(),
  from: isoDate.optional(),
  to: isoDate.optional(),
  assigneeId: id.optional(),
});

export const progressSchema = z.object({ current });
export const stopSchema = z.object({ note: z.string().trim().max(500).optional() });
export const commentSchema = z.object({ text: z.string().trim().min(1, "نص التعليق مطلوب").max(2000) });
export const reorderSchema = z.object({ orderedIds: z.array(id).min(1).max(2000) });
export const moveSchema = z.object({ assigneeId: id, beforeTaskId: id.optional() });
export const copyTaskSchema = z.object({ assigneeId: id });
export const moveUnfinishedSchema = z.object({ date: isoDate });
