import type { Prisma } from "../generated/prisma/client.ts";
import { num2, num3 } from "./inventorySerialize.js";
import type { LowStockTransition } from "./inventoryLowStock.js";
import { round3 } from "../validators/inventory.js";

export type StockOrderLineComponent = {
  id: string;
  itemId: string;
  quantity: { toString(): string };
};

export type StockOrderShape = {
  id: string;
  waybill: string;
  lines: {
    quantity: number;
    components: StockOrderLineComponent[];
  }[];
};

export const orderLabel = (o: Pick<StockOrderShape, "id" | "waybill">) =>
  o.waybill ? `بوليصة ${o.waybill}` : `أوردر ${o.id.slice(-6)}`;

/** المكوّنات المطلوبة من المخزون لأوردر (مجمّعة لكل صنف) بالألف من الوحدة لتفادي أخطاء الفاصلة العائمة */
export function neededByItem(order: Pick<StockOrderShape, "lines">, skip?: Set<string>) {
  const needs = new Map<string, number>();
  for (const l of order.lines) {
    for (const c of l.components) {
      if (skip?.has(c.id)) continue; // مكوّن تالف: لا يُحتسب ضمن ما يعود للمخزون
      needs.set(c.itemId, (needs.get(c.itemId) ?? 0) + Math.round(num3(c.quantity) * 1000) * l.quantity);
    }
  }
  return needs;
}

export async function lockItems(tx: Prisma.TransactionClient, ids: string[]) {
  if (ids.length === 0) return [];
  await tx.$queryRaw`SELECT "id" FROM "InventoryItem" WHERE "id" = ANY(${ids}::text[]) ORDER BY "id" FOR UPDATE`;
  return tx.inventoryItem.findMany({ where: { id: { in: ids } } });
}

/** إعادة المكونات المخصومة إلى المخزون (حركة RETURN) */
export async function restoreOrderStock(
  tx: Prisma.TransactionClient,
  order: StockOrderShape,
  userId: string,
  reason: string,
  clearSnapshots: boolean,
  damaged?: Set<string>
): Promise<LowStockTransition[]> {
  const needs = neededByItem(order, damaged);
  const ids = [...needs.keys()].sort();
  const byId = new Map((await lockItems(tx, ids)).map((i) => [i.id, i]));
  const transitions: LowStockTransition[] = [];
  for (const id of ids) {
    const item = byId.get(id);
    if (!item) continue;
    const back = (needs.get(id) ?? 0) / 1000;
    const before = num3(item.quantity);
    const after = round3(before + back);
    await tx.inventoryItem.update({ where: { id }, data: { quantity: after } });
    await tx.inventoryMovement.create({
      data: {
        itemId: id,
        type: "RETURN",
        previousBalance: before,
        delta: back,
        balanceAfter: after,
        unitPriceSnapshot: num2(item.unitPrice),
        reason: `${reason} — ${orderLabel(order)}`,
        referenceId: `sales:${order.id}`,
        note: damaged && damaged.size > 0 ? "إعادة تلقائية للمخزون (باستثناء التالف)" : "إعادة تلقائية للمخزون",
        createdById: userId,
      },
    });
    transitions.push({
      id,
      name: item.name,
      unit: item.unit,
      beforeQty: before,
      afterQty: after,
      minQty: num3(item.minQuantity),
      wasAlertSent: item.lowAlertSent,
      isActive: item.isActive,
    });
  }
  if (clearSnapshots) {
    await tx.salesOrderComponent.updateMany({ where: { line: { orderId: order.id } }, data: { unitCostSnapshot: null, unitSellSnapshot: null } });
  }
  return transitions;
}
