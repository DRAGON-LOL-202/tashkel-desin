import type { Prisma } from "../generated/prisma/client.ts";
import { serializeAttachments } from "./attachments.js";

export const inventoryItemInclude = { category: true } satisfies Prisma.InventoryItemInclude;

export type InventoryItemRow = Prisma.InventoryItemGetPayload<{ include: typeof inventoryItemInclude }>;

export function serializeInventoryCategory(c: { id: string; name: string }) {
  return { id: c.id, name: c.name };
}

/** Decimal → رقم بثلاث خانات عشرية */
export const num3 = (d: { toString(): string }) => Math.round(Number(d.toString()) * 1000) / 1000;

export function serializeInventoryItem(i: InventoryItemRow) {
  const quantity = num3(i.quantity);
  const minQuantity = num3(i.minQuantity);
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
    // تنبيه نقص: الرصيد وصل للحد الأدنى أو أقل (ويُهمل إن لم يُحدَّد حد أدنى)
    isLow: minQuantity > 0 && quantity <= minQuantity,
    notes: i.notes,
    isActive: i.isActive,
    createdAt: i.createdAt.toISOString(),
    updatedAt: i.updatedAt.toISOString(),
  };
}

type MovementRow = Prisma.InventoryMovementGetPayload<{
  include: { createdBy: { select: { id: true; name: true } }; item: { select: { name: true; unit: true } } };
}>;

export function serializeInventoryMovement(m: MovementRow) {
  return {
    id: m.id,
    itemId: m.itemId,
    itemName: m.item.name,
    unit: m.item.unit,
    batchId: m.batchId,
    type: m.type,
    delta: num3(m.delta),
    balanceAfter: num3(m.balanceAfter),
    note: m.note,
    createdById: m.createdById,
    createdByName: m.createdBy.name,
    createdAt: m.createdAt.toISOString(),
  };
}
