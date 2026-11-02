import type { Prisma } from "../generated/prisma/client.ts";
import { calcTotalValue, num2, num3 } from "./inventorySerialize.js";

const itemSelect = { id: true, name: true, unit: true, unitPrice: true, sellPrice: true, quantity: true, isActive: true } as const;

export const salesProductInclude = {
  components: { include: { item: { select: itemSelect } }, orderBy: { id: "asc" } },
} satisfies Prisma.SalesProductInclude;

export const salesOrderInclude = {
  createdBy: { select: { id: true, name: true } },
  lines: {
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    include: { components: { include: { item: { select: itemSelect } }, orderBy: { id: "asc" } } },
  },
} satisfies Prisma.SalesOrderInclude;

export type SalesProductRow = Prisma.SalesProductGetPayload<{ include: typeof salesProductInclude }>;
export type SalesOrderRow = Prisma.SalesOrderGetPayload<{ include: typeof salesOrderInclude }>;

const toCents = (n: number) => Math.round(n * 100);
const fromCents = (c: number) => Math.round(c) / 100;

interface ComponentLike {
  id: string;
  itemId: string;
  quantity: { toString(): string };
  unitCostSnapshot?: { toString(): string } | null;
  unitSellSnapshot?: { toString(): string } | null;
  damaged?: boolean;
  item: { name: string; unit: string; unitPrice: { toString(): string }; sellPrice: { toString(): string }; quantity: { toString(): string }; isActive: boolean };
}

function serializeComponent(c: ComponentLike) {
  const quantity = num3(c.quantity);
  // بعد التنفيذ تُثبَّت الأسعار؛ قبله تُقرأ حيّة من المخزون
  const unitCost = c.unitCostSnapshot != null ? num2(c.unitCostSnapshot) : num2(c.item.unitPrice);
  const unitSell = c.unitSellSnapshot != null ? num2(c.unitSellSnapshot) : num2(c.item.sellPrice);
  return {
    id: c.id,
    itemId: c.itemId,
    itemName: c.item.name,
    unit: c.item.unit,
    quantity,
    unitCost,
    unitSell,
    available: num3(c.item.quantity),
    itemActive: c.item.isActive,
    damaged: c.damaged === true,
  };
}

function sumUnits(components: ReturnType<typeof serializeComponent>[]) {
  let cost = 0;
  let sell = 0;
  for (const c of components) {
    cost += toCents(calcTotalValue(c.quantity, c.unitCost));
    sell += toCents(calcTotalValue(c.quantity, c.unitSell));
  }
  return { costCents: cost, sellCents: sell };
}

export function serializeSalesProduct(p: SalesProductRow) {
  const components = p.components.map(serializeComponent);
  const { costCents, sellCents } = sumUnits(components);
  return {
    id: p.id,
    name: p.name,
    notes: p.notes,
    isActive: p.isActive,
    components,
    costPerUnit: fromCents(costCents),
    sellPerUnit: fromCents(sellCents),
    createdAt: p.createdAt.toISOString(),
    updatedAt: p.updatedAt.toISOString(),
  };
}

export function serializeSalesOrder(o: SalesOrderRow) {
  let costCents = 0;
  let sellCents = 0;
  let damagedCents = 0; // تكلفة المكونات التالفة (بسعر التكلفة المثبّت وقت التنفيذ)
  const needsMilli = new Map<string, { name: string; unit: string; available: number; active: boolean; milli: number }>();

  const lines = o.lines.map((l) => {
    const components = l.components.map(serializeComponent);
    const unit = sumUnits(components);
    costCents += unit.costCents * l.quantity;
    sellCents += unit.sellCents * l.quantity;
    for (const c of components) {
      if (c.damaged) damagedCents += toCents(calcTotalValue(c.quantity, c.unitCost)) * l.quantity;
      const cur = needsMilli.get(c.itemId) ?? { name: c.itemName, unit: c.unit, available: c.available, active: c.itemActive, milli: 0 };
      cur.milli += Math.round(c.quantity * 1000) * l.quantity;
      needsMilli.set(c.itemId, cur);
    }
    return {
      id: l.id,
      productId: l.productId,
      productName: l.productName,
      quantity: l.quantity,
      components,
      costPerUnit: fromCents(unit.costCents),
      sellPerUnit: fromCents(unit.sellCents),
      totalCost: fromCents(unit.costCents * l.quantity),
      totalSell: fromCents(unit.sellCents * l.quantity),
    };
  });

  // تنبيهات قبل التنفيذ فقط: نقص الرصيد أو مكوّن مؤرشف (التنفيذ سيرفض)
  const shortages: { itemId: string; itemName: string; unit: string; needed: number; available: number }[] = [];
  const archivedItems: string[] = [];
  if (!o.stockDeducted) {
    for (const [itemId, n] of needsMilli) {
      const needed = n.milli / 1000;
      if (!n.active) archivedItems.push(n.name);
      else if (needed > n.available) shortages.push({ itemId, itemName: n.name, unit: n.unit, needed, available: n.available });
    }
  }

  return {
    id: o.id,
    date: o.date,
    waybill: o.waybill,
    closerName: o.closerName,
    status: o.status,
    stockDeducted: o.stockDeducted,
    notes: o.notes,
    createdById: o.createdById,
    createdByName: o.createdBy.name,
    createdAt: o.createdAt.toISOString(),
    updatedAt: o.updatedAt.toISOString(),
    lines,
    costTotal: fromCents(costCents),
    sellTotal: fromCents(sellCents),
    profit: fromCents(sellCents - costCents),
    /** تكلفة التالف في هذا الأوردر (يدخل في إجمالي التالف لليوم) */
    damagedTotal: fromCents(damagedCents),
    /** الشركة علّمت الأوردر «مرتجع» ليراجعه الموظف ويسجله (لا أثر على المخزون) */
    returnFlagged: o.returnFlagged,
    returnFlaggedAt: o.returnFlaggedAt ? o.returnFlaggedAt.toISOString() : null,
    shortages,
    archivedItems,
  };
}

export type SerializedSalesOrder = ReturnType<typeof serializeSalesOrder>;
