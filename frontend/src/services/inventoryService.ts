import { api } from "../lib/api";
import { toAttachmentPayload } from "../lib/attachments";
import { DEFAULT_INVENTORY_UNITS, calcTotalValue } from "../components/inventory/format";
import type {
  InventoryCategory,
  InventoryCategoryInput,
  InventoryData,
  InventoryItem,
  InventoryItemInput,
  InventoryMovement,
  InventoryMovementInput,
  InventoryMovementsQuery,
  InventoryStats,
  WithdrawLine,
} from "../types";

const toBody = <T extends { attachments?: InventoryItemInput["attachments"] }>(input: T) => ({
  ...input,
  ...(input.attachments ? { attachments: input.attachments.map(toAttachmentPayload) } : {}),
});

export const EMPTY_INVENTORY_STATS: InventoryStats = {
  totalItems: 0,
  totalQuantity: 0,
  totalValue: 0,
  availableCount: 0,
  lowStockCount: 0,
  outOfStockCount: 0,
  shortageCount: 0,
  todayMovementsCount: 0,
};

export const EMPTY_INVENTORY_DATA: InventoryData = {
  items: [],
  categories: [],
  stats: EMPTY_INVENTORY_STATS,
  units: [...DEFAULT_INVENTORY_UNITS],
};

function computeFallbackStats(items: InventoryItem[]): InventoryStats {
  const active = items.filter((i) => i.isActive);
  let totalQtyMilli = 0;
  let totalValueCents = 0;
  let availableCount = 0;
  let lowStockCount = 0;
  let outOfStockCount = 0;
  for (const item of active) {
    totalQtyMilli += Math.round(item.quantity * 1000);
    totalValueCents += Math.round((item.totalValue ?? calcTotalValue(item.quantity, item.unitPrice ?? 0)) * 100);
    if (item.status === "OUT_OF_STOCK" || item.quantity <= 0) outOfStockCount++;
    else if (item.status === "LOW_STOCK" || item.quantity <= item.minQuantity) lowStockCount++;
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
    todayMovementsCount: 0,
  };
}

export const inventoryService = {
  /** كل العناصر (بما فيها المؤرشفة) والتصنيفات والإحصائيات والوحدات معاً ليعمل مع useResource والمزامنة الحية */
  async list(): Promise<InventoryData> {
    const [invRes, catRes, unitsRes] = await Promise.all([
      api<{ items: InventoryItem[]; stats?: InventoryStats }>("/inventory?includeInactive=true"),
      api<{ categories: InventoryCategory[] }>("/inventory/categories"),
      api<{ units: string[] }>("/inventory/units").catch(() => ({ units: [...DEFAULT_INVENTORY_UNITS] })),
    ]);
    const items = invRes.items;
    const stats = invRes.stats ?? computeFallbackStats(items);
    const units = unitsRes.units?.length ? unitsRes.units : [...DEFAULT_INVENTORY_UNITS];
    return { items, categories: catRes.categories, stats, units };
  },

  async listCategories(q?: string): Promise<InventoryCategory[]> {
    const qs = q?.trim() ? `?q=${encodeURIComponent(q.trim())}` : "";
    const { categories } = await api<{ categories: InventoryCategory[] }>(`/inventory/categories${qs}`);
    return categories;
  },

  async createCategory(name: string, description = ""): Promise<InventoryCategory> {
    const { category } = await api<{ category: InventoryCategory }>("/inventory/categories", {
      method: "POST",
      body: { name, description },
    });
    return category;
  },

  async updateCategory(id: string, input: Partial<InventoryCategoryInput>): Promise<InventoryCategory> {
    const { category } = await api<{ category: InventoryCategory }>(`/inventory/categories/${id}`, {
      method: "PATCH",
      body: input,
    });
    return category;
  },

  async deleteCategory(id: string, reassignToCategoryId?: string): Promise<{ ok: true; movedItems: number }> {
    return api<{ ok: true; movedItems: number }>(`/inventory/categories/${id}`, {
      method: "DELETE",
      body: reassignToCategoryId ? { reassignToCategoryId } : {},
    });
  },

  async nextSku(): Promise<string> {
    const { sku } = await api<{ sku: string }>("/inventory/next-sku");
    return sku;
  },

  async getById(id: string): Promise<InventoryItem> {
    const { item } = await api<{ item: InventoryItem }>(`/inventory/${id}`);
    return item;
  },

  async create(input: InventoryItemInput): Promise<InventoryItem> {
    const { item } = await api<{ item: InventoryItem }>("/inventory", { method: "POST", body: toBody(input) });
    return item;
  },

  async update(id: string, input: Partial<InventoryItemInput>): Promise<InventoryItem> {
    const { item } = await api<{ item: InventoryItem }>(`/inventory/${id}`, { method: "PATCH", body: toBody(input) });
    return item;
  },

  async remove(id: string): Promise<void> {
    await api<{ ok: true }>(`/inventory/${id}`, { method: "DELETE" });
  },

  async move(id: string, input: InventoryMovementInput): Promise<{ item: InventoryItem; movement: InventoryMovement }> {
    return api<{ item: InventoryItem; movement: InventoryMovement }>(`/inventory/${id}/movements`, {
      method: "POST",
      body: input,
    });
  },

  /** سحب عدة أصناف في طلب واحد (كله أو لا شيء) */
  async withdraw(lines: WithdrawLine[], note: string, requestId?: string): Promise<InventoryMovement[]> {
    const { movements } = await api<{ movements: InventoryMovement[] }>("/inventory/withdrawals", {
      method: "POST",
      body: { lines, note, ...(requestId ? { requestId } : {}) },
    });
    return movements;
  },

  /** سجل السحوبات (الإدارة: الكل، المصمم: سحوباته) */
  async withdrawals(): Promise<InventoryMovement[]> {
    const { movements } = await api<{ movements: InventoryMovement[] }>("/inventory/withdrawals?limit=300");
    return movements;
  },

  async movements(id: string): Promise<InventoryMovement[]> {
    const { movements } = await api<{ movements: InventoryMovement[] }>(`/inventory/${id}/movements?limit=200`);
    return movements;
  },

  /** استعلام الحركات المفلترة للتقارير والتصدير */
  async queryMovements(query: InventoryMovementsQuery = {}): Promise<InventoryMovement[]> {
    const params = new URLSearchParams();
    if (query.from) params.set("from", query.from);
    if (query.to) params.set("to", query.to);
    if (query.categoryId && query.categoryId !== "all") params.set("categoryId", query.categoryId);
    if (query.itemId && query.itemId !== "all") params.set("itemId", query.itemId);
    if (query.type) params.set("type", query.type);
    params.set("limit", String(query.limit ?? 1000));
    const qs = params.toString();
    const { movements } = await api<{ movements: InventoryMovement[] }>(`/inventory/movements${qs ? `?${qs}` : ""}`);
    return movements;
  },
};
