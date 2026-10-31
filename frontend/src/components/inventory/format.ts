import type { InventoryMovementType, InventoryStockStatus } from "../../types";

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

/** رقم بحد أقصى ثلاث خانات عشرية بدون أصفار زائدة */
export const fmtQty = (n: number) => new Intl.NumberFormat("en-US", { maximumFractionDigits: 3 }).format(n);

/** تنسيق مالي بالجنيه المصري بدقة خانتين عشريتين */
export const fmtMoney = (n: number) =>
  `${new Intl.NumberFormat("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(Math.round(n * 100) / 100)} ج.م`;

/** حساب إجمالي القيمة (الكمية × سعر الوحدة) بدقة عشرية دون أخطاء الفاصلة العائمة */
export function calcTotalValue(quantity: number, unitPrice: number): number {
  if (!Number.isFinite(quantity) || !Number.isFinite(unitPrice)) return 0;
  const qMilli = Math.round(quantity * 1000);
  const pCents = Math.round(unitPrice * 100);
  return Math.round((qMilli * pCents) / 1000) / 100;
}

export const MOVEMENT_LABEL: Record<InventoryMovementType, string> = {
  IN: "وارد",
  OUT: "سحب",
  ADJUST: "تسوية جرد",
  RETURN: "مرتجع",
};

export const STATUS_META: Record<InventoryStockStatus, { label: string; color: string }> = {
  AVAILABLE: { label: "متوفر", color: "#1E8E5A" },
  LOW_STOCK: { label: "منخفض", color: "#D97706" },
  OUT_OF_STOCK: { label: "نافد", color: "#C0392B" },
};

/** تنسيق رقم عملية السحب بشكل مقروء */
export function formatBatchCode(batchId: string | null | undefined, fallbackId: string): string {
  const raw = (batchId || fallbackId).replace(/[^A-Za-z0-9]/g, "").toUpperCase();
  return `OP-${raw.slice(0, 8)}`;
}
