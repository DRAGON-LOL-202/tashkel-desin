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

/** بادئة قيمة فلتر المجموعة الرئيسية في قوائم الفلترة (لتمييزها عن معرّف تصنيف عادي). */
export const GROUP_FILTER_PREFIX = "group:";
/** قيمة فلتر المجموعة للتصنيفات التي بلا مجموعة. */
export const UNASSIGNED_FILTER_VALUE = `${GROUP_FILTER_PREFIX}none`;

export function groupFilterValue(groupId: string | null | undefined): string {
  return groupId ? `${GROUP_FILTER_PREFIX}${groupId}` : UNASSIGNED_FILTER_VALUE;
}

/**
 * هل الصنف (بتصنيفه) يطابق قيمة الفلتر؟ القيمة إما "all" أو معرّف تصنيف أو `group:<id>` لمجموعة رئيسية كاملة.
 */
export function matchesCategoryFilter(categoryId: string, filter: string, categories: InventoryCategory[]): boolean {
  if (filter === "all") return true;
  if (filter.startsWith(GROUP_FILTER_PREFIX)) {
    const cat = categories.find((c) => c.id === categoryId);
    return !!cat && groupFilterValue(cat.groupId) === filter;
  }
  return categoryId === filter;
}

/** هل قيمة الفلتر ما زالت موجودة (تصنيف أو مجموعة لها تصنيفات) ضمن القائمة الحالية؟ */
export function isValidCategoryFilter(filter: string, categories: InventoryCategory[]): boolean {
  if (filter === "all") return true;
  if (filter.startsWith(GROUP_FILTER_PREFIX)) return categories.some((c) => groupFilterValue(c.groupId) === filter);
  return categories.some((c) => c.id === filter);
}
