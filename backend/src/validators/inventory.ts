import { z } from "zod";
import { attachmentsSchema } from "./attachments.js";

export const DEFAULT_INVENTORY_UNITS = [
  "قطعة",
  "لوح",
  "متر",
  "متر مربع",
  "كيلو",
  "جرام",
  "لتر",
  "عبوة",
  "ربطة",
  "صندوق",
] as const;

const MAX_QTY = 1_000_000_000;
const MAX_PRICE = 1_000_000_000;
export const round3 = (n: number) => Math.round(n * 1000) / 1000;
export const round2 = (n: number) => Math.round(n * 100) / 100;

const qty = (label: string) =>
  z
    .number({ message: `${label} يجب أن تكون رقماً` })
    .finite()
    .min(0, `${label} لا يمكن أن تكون سالبة`)
    .max(MAX_QTY, `${label} كبيرة جداً`)
    .transform(round3);

const price = (label: string) =>
  z
    .number({ message: `${label} يجب أن يكون رقماً` })
    .finite()
    .min(0, `${label} لا يمكن أن يكون سالباً`)
    .max(MAX_PRICE, `${label} كبير جداً`)
    .transform(round2);

const name = z.string().trim().min(1, "الاسم مطلوب").max(150, "الاسم طويل جداً");
const categoryId = z.string().min(1, "التصنيف مطلوب").max(64);
const attachments = attachmentsSchema.max(10, "الحد الأقصى 10 صور للعنصر");
const categoryName = z.string().trim().min(1, "اسم التصنيف مطلوب").max(60, "اسم التصنيف طويل جداً");
const categoryDescription = z.string().trim().max(500, "وصف التصنيف طويل جداً");
const groupId = z.string().trim().min(1, "المجموعة الرئيسية مطلوبة").max(64);

export const createCategorySchema = z.object({
  name: categoryName,
  description: categoryDescription.default(""),
  groupId,
});

export const updateCategorySchema = z
  .object({
    name: categoryName.optional(),
    description: categoryDescription.optional(),
    groupId: groupId.optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: "لا توجد حقول للتعديل" });

export const deleteCategorySchema = z.object({
  reassignToCategoryId: z.string().trim().min(1).max(64).optional(),
});

const unit = z.string().trim().min(1, "الوحدة مطلوبة").max(30, "اسم الوحدة طويل جداً");
const notes = z.string().trim().max(1000, "الملاحظات طويلة جداً");
const reason = z.string().trim().max(500, "السبب طويل جداً");
const referenceId = z
  .string()
  .trim()
  .max(100, "رقم العملية المرجعية طويل جداً")
  .nullable()
  .optional()
  .transform((v) => (v === undefined || v === null || v === "" ? null : v));

const sku = z
  .string()
  .trim()
  .max(64, "الكود طويل جداً")
  .nullable()
  .transform((v) => (v === null || v === "" ? null : v));

export const createItemSchema = z.object({
  name,
  categoryId,
  attachments: attachments.default([]),
  sku: sku.optional(),
  autoGenerateSku: z.boolean().optional().default(false),
  unit: unit.default("قطعة"),
  minQuantity: qty("الحد الأدنى").default(0),
  initialQuantity: qty("الكمية الافتتاحية").default(0),
  unitPrice: price("سعر الوحدة").default(0),
  notes: notes.default(""),
});

export const updateItemSchema = z
  .object({
    name: name.optional(),
    categoryId: categoryId.optional(),
    attachments: attachments.optional(),
    sku: sku.optional(),
    unit: unit.optional(),
    minQuantity: qty("الحد الأدنى").optional(),
    unitPrice: price("سعر الوحدة").optional(),
    notes: notes.optional(),
    isActive: z.boolean().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: "لا توجد حقول للتعديل" });

// IN/OUT/RETURN: quantity = مقدار الحركة (> 0). ADJUST (جرد): quantity = الرصيد الفعلي الجديد بالمخزن (>= 0).
export const createMovementSchema = z
  .object({
    type: z.enum(["IN", "OUT", "ADJUST", "RETURN"], { message: "نوع الحركة غير صالح" }),
    quantity: qty("الكمية"),
    reason: reason.default(""),
    referenceId,
    note: notes.default(""),
  })
  .superRefine((v, ctx) => {
    if (v.type !== "ADJUST" && v.quantity <= 0) {
      ctx.addIssue({ code: "custom", path: ["quantity"], message: "الكمية يجب أن تكون أكبر من صفر" });
    }
  });

// سحب من المخزون: عدة أصناف في طلب واحد. تكرار نفس الصنف يُجمع كمياته.
export const withdrawSchema = z
  .object({
    lines: z
      .array(
        z.object({
          itemId: z.string().trim().min(1, "الصنف مطلوب").max(64),
          quantity: qty("الكمية").refine((v) => v > 0, "الكمية يجب أن تكون أكبر من صفر"),
        }),
        { message: "أضف صنفاً واحداً على الأقل" }
      )
      .min(1, "أضف صنفاً واحداً على الأقل")
      .max(50, "عدد الأصناف كبير جداً"),
    note: notes.default(""),
    requestId: z.string().trim().min(1).max(64).optional(),
  })
  .transform((v) => {
    const merged = new Map<string, number>();
    for (const l of v.lines) merged.set(l.itemId, round3((merged.get(l.itemId) ?? 0) + l.quantity));
    return {
      lines: [...merged].map(([itemId, quantity]) => ({ itemId, quantity })),
      note: v.note,
      requestId: v.requestId,
    };
  });

export type WithdrawInput = z.infer<typeof withdrawSchema>;
export type CreateItemInput = z.infer<typeof createItemSchema>;
export type UpdateItemInput = z.infer<typeof updateItemSchema>;
export type CreateMovementInput = z.infer<typeof createMovementSchema>;
