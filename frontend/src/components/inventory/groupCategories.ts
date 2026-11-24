import type { InventoryCategory, InventoryItem, InventoryStats } from "../../types";
import { calcTotalValue } from "./format";

export type WarehouseTab = "ALL" | "MATERIALS" | "ACCESSORIES_GIFTS";

export const WAREHOUSE_TABS: readonly {
  key: WarehouseTab;
  label: string;
  shortLabel: string;
  groupId?: string;
}[] = [
  { key: "ALL", label: "كل المخزون", shortLabel: "الكل" },
  { key: "MATERIALS", label: "مخزون الخامات", shortLabel: "خامات", groupId: "invgrp_materials" },
  { key: "ACCESSORIES_GIFTS", label: "مخزون الإكسسوارات والهدايا", shortLabel: "اكسسوارات وهدايا", groupId: "invgrp_accessories_gifts" },
];

export function parseWarehouseTab(raw: string | null | undefined): WarehouseTab {
  if (raw === "MATERIALS" || raw === "ACCESSORIES_GIFTS") return raw;
  return "ALL";
}

export function categoryMatchesWarehouse(
  c: Pick<InventoryCategory, "groupId" | "groupKey" | "groupName">,
  tab: WarehouseTab
): boolean {
  if (tab === "ALL") return true;
  if (tab === "MATERIALS") {
    return c.groupKey === "MATERIALS" || c.groupId === "invgrp_materials" || c.groupName === "خامات";
  }
  return c.groupKey === "ACCESSORIES_GIFTS" || c.groupId === "invgrp_accessories_gifts" || c.groupName === "اكسسوارات وهدايا";
}

export function computeScopedInventoryStats(items: InventoryItem[], todayMovementsCount: number): InventoryStats {
  let activeCount = 0;
  let totalQtyMilli = 0;
  let totalValueCents = 0;
  let availableCount = 0;
  let lowStockCount = 0;
  let outOfStockCount = 0;

  for (const item of items) {
    if (!item.isActive) continue;
    activeCount++;
    const totalVal = calcTotalValue(item.quantity, item.unitPrice ?? 0);
    const status = item.quantity <= 0 ? "OUT_OF_STOCK" : item.quantity <= item.minQuantity ? "LOW_STOCK" : "AVAILABLE";

    totalQtyMilli += Math.round(item.quantity * 1000);
    totalValueCents += Math.round(totalVal * 100);
    if (status === "OUT_OF_STOCK") outOfStockCount++;
    else if (status === "LOW_STOCK") lowStockCount++;
    else availableCount++;
  }

  return {
    totalItems: activeCount,
    totalQuantity: Math.round(totalQtyMilli) / 1000,
    totalValue: Math.round(totalValueCents) / 100,
    availableCount,
    lowStockCount,
    outOfStockCount,
    shortageCount: lowStockCount + outOfStockCount,
    todayMovementsCount,
  };
}

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
