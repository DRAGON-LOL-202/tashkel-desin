export interface BoxComponentQty {
  itemId: string;
  quantity: number | string;
}

export interface ItemAdjustPrices {
  addPrice: number;
  removePrice: number;
}

const toCents = (n: number) => Math.round(n * 100);
const toMilli = (v: number | string) => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? Math.round(n * 1000) : 0;
};

/**
 * نفس معادلة الباكند (calcAdjustedBoxPriceCents) بالقروش لتطابق المعاينة الفورية في الفاتورة مع الحفظ الفعلي على الخادم.
 */
export function calcAdjustedBoxPrice(
  fixedPrice: number,
  defaultComponents: BoxComponentQty[],
  selectedComponents: BoxComponentQty[],
  itemPrices: ReadonlyMap<string, ItemAdjustPrices>
): { basePrice: number; delta: number; unitPrice: number; unitCents: number } {
  const fixedCents = toCents(fixedPrice);
  const defMilli = new Map<string, number>();
  for (const c of defaultComponents) {
    defMilli.set(c.itemId, (defMilli.get(c.itemId) ?? 0) + toMilli(c.quantity));
  }
  const selMilli = new Map<string, number>();
  for (const c of selectedComponents) {
    selMilli.set(c.itemId, (selMilli.get(c.itemId) ?? 0) + toMilli(c.quantity));
  }
  const allIds = new Set([...defMilli.keys(), ...selMilli.keys()]);
  let deltaCents = 0;
  for (const itemId of allIds) {
    const diffMilli = (selMilli.get(itemId) ?? 0) - (defMilli.get(itemId) ?? 0);
    if (diffMilli === 0) continue;
    const prices = itemPrices.get(itemId);
    if (!prices) continue;
    if (diffMilli > 0) {
      deltaCents += Math.round((diffMilli * toCents(prices.addPrice)) / 1000);
    } else {
      deltaCents -= Math.round(((-diffMilli) * toCents(prices.removePrice)) / 1000);
    }
  }
  const unitCents = Math.max(0, fixedCents + deltaCents);
  return {
    basePrice: Math.round(fixedCents) / 100,
    delta: Math.round(deltaCents) / 100,
    unitPrice: Math.round(unitCents) / 100,
    unitCents,
  };
}
