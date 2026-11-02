import { prisma } from "../db.js";
import { notify, staffIds } from "./notify.js";

export interface LowStockTransition {
  id: string;
  name: string;
  unit: string;
  beforeQty: number;
  afterQty: number;
  minQty: number;
  wasAlertSent: boolean;
  isActive: boolean;
}

/**
 * تحديث حالة تنبيه نقص المخزون وإرسال إشعار داخل الموقع عند الوصول للحد الأدنى أو النفاد،
 * مع منع تكرار الإشعار لنفس حالة النقص حتى يُعاد تزويد المنتج فوق الحد الأدنى.
 */
export async function handleLowStockTransition(itemsToCheck: LowStockTransition[]) {
  try {
    const db = prisma();
    const recipients = await staffIds();
    for (const info of itemsToCheck) {
      if (!info.isActive) continue;
      // يعتبر في حالة نقص تستوجب الإشعار إذا وصل للحد الأدنى (عند وجود حد أدنى > 0) أو نفد الرصيد بعد أن كان متوفراً
      const isLowNow = (info.minQty > 0 && info.afterQty <= info.minQty) || (info.afterQty <= 0 && (info.beforeQty > 0 || info.minQty > 0));
      const isRecovered = info.afterQty > 0 && info.afterQty > info.minQty;

      if (isRecovered && info.wasAlertSent) {
        await db.inventoryItem.updateMany({
          where: { id: info.id, lowAlertSent: true },
          data: { lowAlertSent: false },
        });
      } else if (isLowNow && !info.wasAlertSent) {
        const updated = await db.inventoryItem.updateMany({
          where: { id: info.id, lowAlertSent: false },
          data: { lowAlertSent: true },
        });
        if (updated.count === 1 && recipients.length > 0) {
          const isOut = info.afterQty <= 0;
          const title = isOut ? `نفاد مخزون: ${info.name}` : `تنبيه نقص مخزون: ${info.name}`;
          const message = isOut
            ? `نفد رصيد «${info.name}» بالكامل من المخزون (الحد الأدنى: ${info.minQty} ${info.unit}).`
            : `وصل رصيد «${info.name}» إلى ${info.afterQty} ${info.unit} (الحد الأدنى: ${info.minQty} ${info.unit}).`;
          await notify({
            recipients,
            actor: null, // إشعار نظام يصل لجميع المديرين والمشرفين النشطين حتى لو كان أحدهم هو من أجرى العملية
            type: "INVENTORY_LOW",
            title,
            message,
          });
        }
      }
    }
  } catch (e) {
    console.error("low stock notify failed", e instanceof Error ? e.message : e);
  }
}
