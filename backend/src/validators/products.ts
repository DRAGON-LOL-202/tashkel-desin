import { z } from "zod";
import { attachmentsSchema } from "./attachments.js";

const MAX_PRICE = 10_000_000;

const price = z
  .number({ message: "السعر يجب أن يكون رقماً" })
  .finite()
  .min(0, "السعر لا يمكن أن يكون سالباً")
  .max(MAX_PRICE, "السعر كبير جداً");

const round2 = (n: number) => Math.round(n * 100) / 100;

// التكلفة = تكلفة الخامة + تكلفة وقت الماكينة. للتوافق مع العملاء القدامى: إن وصل `cost` فقط يُعتبر كله تكلفة خامة.
const variantSchema = z
  .object({
    label: z.string().trim().max(100, "اسم الخامة طويل جداً").default(""),
    materialCost: price.optional(),
    machineCost: price.optional(),
    cost: price.optional(),
    price,
  })
  .superRefine((v, ctx) => {
    if (v.materialCost === undefined && v.cost === undefined) {
      ctx.addIssue({ code: "custom", path: ["materialCost"], message: "تكلفة الخامة مطلوبة" });
    }
  })
  .transform((v) => {
    const materialCost = round2(v.materialCost ?? v.cost ?? 0);
    const machineCost = round2(v.machineCost ?? 0);
    return { label: v.label, materialCost, machineCost, cost: round2(materialCost + machineCost), price: v.price };
  });

const name = z.string().trim().min(1, "اسم المنتج مطلوب").max(200);
const categoryId = z.string().min(1, "التصنيف مطلوب").max(64);
const variants = z.array(variantSchema).min(1, "أضف خامة واحدة على الأقل").max(20, "الحد الأقصى 20 خامة");
const attachments = attachmentsSchema.max(1, "صورة واحدة فقط للمنتج");

export const createCategorySchema = z.object({
  name: z.string().trim().min(1, "اسم التصنيف مطلوب").max(60, "اسم التصنيف طويل جداً"),
});

export const createProductSchema = z.object({
  name,
  categoryId,
  variants,
  attachments: attachments.optional(),
});

export const updateProductSchema = z
  .object({
    name: name.optional(),
    categoryId: categoryId.optional(),
    variants: variants.optional(),
    attachments: attachments.optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: "لا توجد حقول للتعديل" });

export type VariantInput = z.infer<typeof variantSchema>;
