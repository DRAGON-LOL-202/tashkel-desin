import type { InventoryCategory } from "../../types";

export const UNASSIGNED_LABEL = "غير مصنّفة";

/**
 * يجمّع التصنيفات تحت المجموعة الرئيسية: خامات ثم اكسسوارات وهدايا، وأي تصنيف قديم بلا مجموعة تحت «غير مصنّفة» أخيراً.
 */
export function groupCategories(categories: InventoryCategory[]): { label: string; items: InventoryCategory[] }[] {
  const map = new Map<string, InventoryCategory[]>();
  for (const c of categories) {
    const key = c.groupName ?? UNASSIGNED_LABEL;
    map.set(key, [...(map.get(key) ?? []), c]);
  }
  const rank = (label: string) => (label === UNASSIGNED_LABEL ? 99 : label === "خامات" ? 0 : label === "اكسسوارات وهدايا" ? 1 : 2);
  return [...map.entries()].map(([label, items]) => ({ label, items })).sort((a, b) => rank(a.label) - rank(b.label));
}
