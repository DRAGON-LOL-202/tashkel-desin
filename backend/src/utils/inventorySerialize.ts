import type { Prisma } from "../generated/prisma/client.ts";
import { serializeAttachments } from "./attachments.js";

export const inventoryItemInclude = { category: true } satisfies Prisma.InventoryItemInclude;

export type InventoryItemRow = Prisma.InventoryItemGetPayload<{ include: typeof inventoryItemInclude }>;

export type InventoryStockStatus = "AVAILABLE" | "LOW_STOCK" | "OUT_OF_STOCK";

export function serializeInventoryCategory(c: {
  id: string;
  name: string;
  description?: string;
  createdAt?: Date;
  updatedAt?: Date;
  _count?: { items: number };
}) {
  return {
    id: c.id,
    name: c.name,
    description: c.description ?? "",
    itemsCount: c._count?.items ?? 0,
    createdAt: c.createdAt ? c.createdAt.toISOString() : new Date(0).toISOString(),
    updatedAt: c.updatedAt ? c.updatedAt.toISOString() : new Date(0).toISOString(),
  };
}

/** Decimal → رقم بثلاث خانات عشرية (كميات) */
export const num3 = (d: { toString(): string } | number) => Math.round(Number(d.toString()) * 1000) / 1000;

/** Decimal → رقم بخانتين عشريتين (أموال بالجنيه المصري) */
export const num2 = (d: { toString(): string } | number) => Math.round(Number(d.toString()) * 100) / 100;

/**
 * حساب قيمة المنتج (الكمية × سعر الوحدة) بدقة عشرية تامة دون أخطاء الفاصلة العائمة.
 * يحوّل الكمية إلى أجزاء من الألف والسعر إلى قروش ثم يقسم ويقرّب لأقرب قرش.
 */
export function calcTotalValue(quantity: number, unitPrice: number): number {
  const qMilli = Math.round(quantity * 1000);
  const pCents = Math.round(unitPrice * 100);
  return Math.round((qMilli * pCents) / 1000) / 100;
}

/**
 * حالة المخزون:
 * - OUT_OF_STOCK (نافد): الكمية = 0
 * - LOW_STOCK (منخفض): الكمية > 0 وتساوي الحد الأدنى أو أقل منه
 * - AVAILABLE (متوفر): الكمية > 0 وأعلى من الحد الأدنى
 */
export function getStockStatus(quantity: number, minQuantity: number): InventoryStockStatus {
  if (quantity <= 0) return "OUT_OF_STOCK";
  if (quantity <= minQuantity) return "LOW_STOCK";
  return "AVAILABLE";
}

/** الكمية المقترحة لإعادة الطلب عند النقص (للوصول إلى ضعف الحد الأدنى أو 1 على الأقل) */
export function calcSuggestedReorderQty(quantity: number, minQuantity: number): number {
  if (quantity > minQuantity && quantity > 0) return 0;
  if (minQuantity <= 0) return quantity <= 0 ? 1 : 0;
  const target = Math.round(minQuantity * 2 * 1000) / 1000;
  const diff = Math.round((target - quantity) * 1000) / 1000;
  return Math.max(diff, Math.round((minQuantity - quantity + 1) * 1000) / 1000, 1);
}

export function serializeInventoryItem(i: InventoryItemRow) {
  const quantity = num3(i.quantity);
  const minQuantity = num3(i.minQuantity);
  const unitPrice = num2(i.unitPrice);
  const totalValue = calcTotalValue(quantity, unitPrice);
  const status = getStockStatus(quantity, minQuantity);
  const isOutOfStock = status === "OUT_OF_STOCK";
  const isLowStock = status === "LOW_STOCK";
  // isLow: الرصيد وصل للحد الأدنى أو أقل (عند تحديد حد أدنى > 0) أو نفد مع وجود حد أدنى
  const isLow = minQuantity > 0 && quantity <= minQuantity;
  // isShortage: يشمل المنخفض والنافد معاً لصفحة نواقص المخزون
  const isShortage = isOutOfStock || isLowStock;
  const suggestedReorderQty = calcSuggestedReorderQty(quantity, minQuantity);

  return {
    id: i.id,
    name: i.name,
    sku: i.sku,
    categoryId: i.categoryId,
    categoryName: i.category.name,
    attachments: serializeAttachments(i.attachments),
    unit: i.unit,
    quantity,
    minQuantity,
    unitPrice,
    totalValue,
    status,
    isOutOfStock,
    isLowStock,
    isLow,
    isShortage,
    suggestedReorderQty,
    notes: i.notes,
    isActive: i.isActive,
    createdAt: i.createdAt.toISOString(),
    updatedAt: i.updatedAt.toISOString(),
  };
}

export type SerializedInventoryItem = ReturnType<typeof serializeInventoryItem>;

export interface InventoryStats {
  totalItems: number;
  totalQuantity: number;
  totalValue: number;
  availableCount: number;
  lowStockCount: number;
  outOfStockCount: number;
  shortageCount: number;
  todayMovementsCount: number;
}

export function computeInventoryStats(items: SerializedInventoryItem[], todayMovementsCount: number): InventoryStats {
  const active = items.filter((i) => i.isActive);
  let totalQtyMilli = 0;
  let totalValueCents = 0;
  let availableCount = 0;
  let lowStockCount = 0;
  let outOfStockCount = 0;

  for (const item of active) {
    totalQtyMilli += Math.round(item.quantity * 1000);
    totalValueCents += Math.round(item.totalValue * 100);
    if (item.status === "OUT_OF_STOCK") outOfStockCount++;
    else if (item.status === "LOW_STOCK") lowStockCount++;
    else availableCount++;
  }

  return {
    totalItems: active.length,
    totalQuantity: Math.round(totalQtyMilli) / 1000,
    totalValue: Math.round(totalValueCents) / 100,
    availableCount,
    lowStockCount,
    outOfStockCount,
    shortageCount: lowStockCount + outOfStockCount,
    todayMovementsCount,
  };
}

export const movementInclude = {
  createdBy: { select: { id: true, name: true } },
  item: { select: { name: true, sku: true, unit: true, categoryId: true, category: { select: { name: true } } } },
} satisfies Prisma.InventoryMovementInclude;

type MovementRow = Prisma.InventoryMovementGetPayload<{
  include: typeof movementInclude;
}>;

export function serializeInventoryMovement(m: MovementRow) {
  const delta = num3(m.delta);
  const balanceAfter = num3(m.balanceAfter);
  const prevRaw = num3(m.previousBalance);
  const calcPrev = Math.round((balanceAfter - delta) * 1000) / 1000;
  const previousBalance = prevRaw === 0 && calcPrev !== 0 ? calcPrev : prevRaw;
  const unitPriceSnapshot = num2(m.unitPriceSnapshot);

  return {
    id: m.id,
    itemId: m.itemId,
    itemName: m.item.name,
    itemSku: m.item.sku,
    categoryId: m.item.categoryId,
    categoryName: m.item.category?.name ?? "",
    unit: m.item.unit,
    batchId: m.batchId,
    type: m.type,
    previousBalance,
    delta,
    balanceAfter,
    unitPriceSnapshot,
    movementValue: calcTotalValue(Math.abs(delta), unitPriceSnapshot),
    reason: m.reason,
    referenceId: m.referenceId,
    note: m.note,
    createdById: m.createdById,
    createdByName: m.createdBy.name,
    createdAt: m.createdAt.toISOString(),
  };
}
