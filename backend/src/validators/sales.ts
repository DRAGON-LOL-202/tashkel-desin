import { z } from "zod";
import { round3 } from "./inventory.js";

export const SALES_ORDER_STATUSES = ["REGISTERED", "EXECUTED", "SHIPPED", "DELIVERED", "RETURNED"] as const;

const id = z.string().trim().min(1, "معرّف غير صالح").max(64);
const name = z.string().trim().min(1, "الاسم مطلوب").max(120, "الاسم طويل جداً");
const notes = z.string().trim().max(1000, "الملاحظات طويلة جداً");
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "تاريخ غير صالح");
const waybill = z.string().trim().max(60, "رقم البوليصة طويل جداً");
const closerName = z.string().trim().max(80, "اسم المقفل طويل جداً");
const lineQty = z
  .number({ message: "العدد يجب أن يكون رقماً" })
  .int("العدد يجب أن يكون عدداً صحيحاً")
  .min(1, "العدد لا يقل عن 1")
  .max(1000, "العدد كبير جداً");

const componentQty = z
  .number({ message: "الكمية يجب أن تكون رقماً" })
  .finite()
  .max(1_000_000, "الكمية كبيرة جداً")
  .transform(round3)
  .refine((v) => v > 0, "الكمية يجب أن تكون أكبر من صفر");

// تكرار نفس المكوّن يُجمع كمياته
const components = z
  .array(z.object({ itemId: id, quantity: componentQty }), { message: "أضف مكوناً واحداً على الأقل" })
  .min(1, "أضف مكوناً واحداً على الأقل")
  .max(50, "عدد المكونات كبير جداً")
  .transform((list) => {
    const merged = new Map<string, number>();
    for (const c of list) merged.set(c.itemId, round3((merged.get(c.itemId) ?? 0) + c.quantity));
    return [...merged].map(([itemId, quantity]) => ({ itemId, quantity }));
  });

export const createProductSchema = z.object({
  name,
  notes: notes.default(""),
  components,
});

export const updateProductSchema = z
  .object({
    name: name.optional(),
    notes: notes.optional(),
    isActive: z.boolean().optional(),
    components: components.optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: "لا توجد حقول للتعديل" });

// تكرار نفس المنتج يُجمع عدده
export const createOrderSchema = z
  .object({
    date: isoDate,
    waybill: waybill.default(""),
    closerName: closerName.default(""),
    notes: notes.default(""),
    lines: z
      .array(z.object({ productId: id, quantity: lineQty.default(1) }), { message: "أضف منتجاً واحداً على الأقل" })
      .min(1, "أضف منتجاً واحداً على الأقل")
      .max(20, "عدد المنتجات كبير جداً"),
  })
  .transform((v) => {
    const merged = new Map<string, number>();
    for (const l of v.lines) merged.set(l.productId, (merged.get(l.productId) ?? 0) + l.quantity);
    return { ...v, lines: [...merged].map(([productId, quantity]) => ({ productId, quantity: Math.min(quantity, 1000) })) };
  });

export const updateOrderSchema = z
  .object({
    date: isoDate.optional(),
    waybill: waybill.optional(),
    closerName: closerName.optional(),
    notes: notes.optional(),
    status: z.enum(SALES_ORDER_STATUSES, { message: "حالة غير صالحة" }).optional(),
    // المكونات التالفة عند المرتجع (معرّفات SalesOrderComponent): لا تعود للمخزون
    damagedComponentIds: z.array(id).max(500, "عدد المكونات كبير جداً").optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: "لا توجد حقول للتعديل" })
  .refine((v) => v.damagedComponentIds === undefined || v.damagedComponentIds.length === 0 || v.status === "RETURNED", {
    message: "تحديد التالف متاح عند اختيار «مرتجع» فقط",
  });

export const addLineSchema = z.object({ productId: id, quantity: lineQty.default(1) });
export const updateLineSchema = z.object({ quantity: lineQty });
