import { z } from "zod";

const MAX_QTY = 1_000_000_000;
export const round3 = (n: number) => Math.round(n * 1000) / 1000;

const qty = (label: string) =>
  z
    .number({ message: `${label} يجب أن تكون رقماً` })
    .finite()
    .min(0, `${label} لا يمكن أن تكون سالبة`)
    .max(MAX_QTY, `${label} كبيرة جداً`)
    .transform(round3);

const name = z.string().trim().min(1, "الاسم مطلوب").max(150, "الاسم طويل جداً");
const unit = z.string().trim().min(1, "الوحدة مطلوبة").max(30, "اسم الوحدة طويل جداً");
const notes = z.string().trim().max(1000, "الملاحظات طويلة جداً");
const sku = z
  .string()
  .trim()
  .max(64, "الكود طويل جداً")
  .nullable()
  .transform((v) => (v === null || v === "" ? null : v));

export const createItemSchema = z.object({
  name,
  sku: sku.optional(),
  unit: unit.default("قطعة"),
  minQuantity: qty("الحد الأدنى").default(0),
  initialQuantity: qty("الكمية الافتتاحية").default(0),
  notes: notes.default(""),
});

export const updateItemSchema = z
  .object({
    name: name.optional(),
    sku: sku.optional(),
    unit: unit.optional(),
    minQuantity: qty("الحد الأدنى").optional(),
    notes: notes.optional(),
    isActive: z.boolean().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: "لا توجد حقول للتعديل" });

// IN/OUT: quantity = مقدار الحركة (> 0). ADJUST (جرد): quantity = الرصيد الجديد الفعلي (>= 0).
export const createMovementSchema = z
  .object({
    type: z.enum(["IN", "OUT", "ADJUST"], { message: "نوع الحركة غير صالح" }),
    quantity: qty("الكمية"),
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
  })
  .transform((v) => {
    const merged = new Map<string, number>();
    for (const l of v.lines) merged.set(l.itemId, round3((merged.get(l.itemId) ?? 0) + l.quantity));
    return { lines: [...merged].map(([itemId, quantity]) => ({ itemId, quantity })), note: v.note };
  });

export type WithdrawInput = z.infer<typeof withdrawSchema>;
export type CreateItemInput = z.infer<typeof createItemSchema>;
export type UpdateItemInput = z.infer<typeof updateItemSchema>;
export type CreateMovementInput = z.infer<typeof createMovementSchema>;
