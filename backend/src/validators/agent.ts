import { z } from "zod";

const id = z.string().trim().min(1, "معرّف غير صالح").max(64);
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "تاريخ غير صالح");
const money = z
  .number({ message: "المبلغ يجب أن يكون رقماً" })
  .finite()
  .min(0, "المبلغ لا يقل عن صفر")
  .max(10_000_000, "المبلغ كبير جداً")
  .refine((v) => Math.abs(v * 100 - Math.round(v * 100)) < 1e-6, "المبلغ بحد أقصى خانتين عشريتين");
const lineQty = z.number({ message: "العدد يجب أن يكون رقماً" }).int("العدد يجب أن يكون عدداً صحيحاً").min(1, "العدد لا يقل عن 1").max(1000, "العدد كبير جداً");

// كمية المكوّن للبوكس الواحد (تعديل الفتاة لمحتويات البوكس): > 0 وبحد أقصى 3 خانات عشرية مثل المخزون
const componentQty = z
  .number({ message: "كمية المحتوى يجب أن تكون رقماً" })
  .finite()
  .gt(0, "كمية المحتوى يجب أن تكون أكبر من صفر")
  .max(100_000, "كمية المحتوى كبيرة جداً")
  .refine((v) => Math.abs(v * 1000 - Math.round(v * 1000)) < 1e-6, "كمية المحتوى بحد أقصى 3 خانات عشرية");

const lines = z
  .array(
    z.object({
      productId: id,
      quantity: lineQty.default(1),
      // اختياري: محتويات هذا البوكس بعد تعديل الفتاة. إن غابت تُنسخ محتويات المنتج الثابت كما هي.
      components: z.array(z.object({ itemId: id, quantity: componentQty }), { message: "محتويات البوكس غير صالحة" }).min(1, "البوكس يحتاج محتوى واحداً على الأقل").max(60, "محتويات البوكس كثيرة جداً").optional(),
    }),
    { message: "أضف منتجاً واحداً على الأقل" }
  )
  .min(1, "أضف منتجاً واحداً على الأقل")
  .max(20, "عدد المنتجات كبير جداً")
  .transform((list) => {
    // نفس الصنف مكرر داخل بوكس واحد: تُجمع كمياته. ونفس البوكس بنفس المحتويات يُدمج في بند واحد؛ البوكسات المختلفة المحتوى تبقى بنوداً منفصلة.
    const merged = new Map<string, { productId: string; quantity: number; components?: { itemId: string; quantity: number }[] }>();
    for (const l of list) {
      let components: { itemId: string; quantity: number }[] | undefined;
      if (l.components) {
        const byItem = new Map<string, number>();
        for (const c of l.components) byItem.set(c.itemId, Math.round(((byItem.get(c.itemId) ?? 0) + c.quantity) * 1000) / 1000);
        components = [...byItem].map(([itemId, quantity]) => ({ itemId, quantity })).sort((a, b) => (a.itemId < b.itemId ? -1 : a.itemId > b.itemId ? 1 : 0));
      }
      const key = `${l.productId}|${components ? components.map((c) => `${c.itemId}:${c.quantity}`).join(",") : "default"}`;
      const cur = merged.get(key);
      if (cur) cur.quantity = Math.min(cur.quantity + l.quantity, 1000);
      else merged.set(key, { productId: l.productId, quantity: l.quantity, ...(components ? { components } : {}) });
    }
    return [...merged.values()];
  });

const customer = {
  customerName: z.string().trim().min(1, "اسم العميل مطلوب").max(120, "اسم العميل طويل جداً"),
  customerPhone: z.string().trim().max(30, "رقم الهاتف طويل جداً"),
  customerAddress: z.string().trim().max(300, "العنوان طويل جداً"),
  notes: z.string().trim().max(1000, "الملاحظات طويلة جداً"),
};

export const createAgentOrderSchema = z.object({
  date: isoDate,
  customerName: customer.customerName,
  customerPhone: customer.customerPhone.default(""),
  customerAddress: customer.customerAddress.default(""),
  notes: customer.notes.default(""),
  lines,
});

export const updateAgentOrderSchema = z
  .object({
    date: isoDate.optional(),
    customerName: customer.customerName.optional(),
    customerPhone: customer.customerPhone.optional(),
    customerAddress: customer.customerAddress.optional(),
    notes: customer.notes.optional(),
    lines: lines.optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: "لا توجد حقول للتعديل" });

// التأكيد الصريح مطلوب في الباكند أيضاً: التصدير والإلغاء لا يحدثان بطلب عابر
export const exportOrdersSchema = z.object({
  ids: z.array(id).min(1, "اختر أوردراً واحداً على الأقل").max(100, "عدد الأوردرات كبير جداً"),
  confirm: z.literal(true, { message: "يلزم تأكيد التصدير" }),
});

export const cancelOrderSchema = z.object({
  reason: z.string().trim().min(3, "سبب الإلغاء مطلوب (3 أحرف على الأقل)").max(500, "سبب الإلغاء طويل جداً"),
  confirm: z.literal(true, { message: "يلزم تأكيد الإلغاء" }),
});

export const setPrefixSchema = z.object({
  prefix: z.number({ message: "Prefix يجب أن يكون رقماً" }).int("Prefix يجب أن يكون عدداً صحيحاً").min(1, "Prefix لا يقل عن 1").max(9_999_999, "Prefix كبير جداً"),
  // رقم البدء: أول رقم تسلسلي (رقم البوليصة = Prefix × 100 + رقم البدء). اختياري؛ يُضبط قبل إنشاء أي أوردر فقط
  startSeq: z.number({ message: "رقم البدء يجب أن يكون رقماً" }).int("رقم البدء يجب أن يكون عدداً صحيحاً").min(1, "رقم البدء لا يقل عن 1").max(9_999_999, "رقم البدء كبير جداً").optional(),
});

export const accountantStatusSchema = z.object({ status: z.enum(["SHIPPED", "DELIVERED"], { message: "الحالة المسموحة: شحن أو تم التسليم" }) });
export const returnFlagSchema = z.object({ flagged: z.boolean({ message: "قيمة غير صالحة" }) });
export const shippingPriceSchema = z.object({ shippingPrice: money.nullable() });
