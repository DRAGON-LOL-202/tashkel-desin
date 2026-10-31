import { api } from "../lib/api";
import { toAttachmentPayload } from "../lib/attachments";
import type { InventoryCategory, InventoryData, InventoryItem, InventoryItemInput, InventoryMovement, InventoryMovementInput, WithdrawLine } from "../types";

const toBody = <T extends { attachments?: InventoryItemInput["attachments"] }>(input: T) => ({
  ...input,
  ...(input.attachments ? { attachments: input.attachments.map(toAttachmentPayload) } : {}),
});

export const inventoryService = {
  /** كل العناصر (بما فيها المعطّلة) والتصنيفات معاً ليعمل مع useResource والمزامنة الحية */
  async list(): Promise<InventoryData> {
    const [{ items }, { categories }] = await Promise.all([
      api<{ items: InventoryItem[] }>("/inventory?includeInactive=true"),
      api<{ categories: InventoryCategory[] }>("/inventory/categories"),
    ]);
    return { items, categories };
  },

  async createCategory(name: string): Promise<InventoryCategory> {
    const { category } = await api<{ category: InventoryCategory }>("/inventory/categories", { method: "POST", body: { name } });
    return category;
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
    return api<{ item: InventoryItem; movement: InventoryMovement }>(`/inventory/${id}/movements`, { method: "POST", body: input });
  },

  /** سحب عدة أصناف في طلب واحد (كله أو لا شيء) */
  async withdraw(lines: WithdrawLine[], note: string): Promise<InventoryMovement[]> {
    const { movements } = await api<{ movements: InventoryMovement[] }>("/inventory/withdrawals", { method: "POST", body: { lines, note } });
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
};
