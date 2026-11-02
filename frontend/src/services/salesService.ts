import { api } from "../lib/api";
import type { SalesOrder, SalesOrderCreateInput, SalesOrderPatch, SalesProduct, SalesProductInput } from "../types";

// المبيعات العامة (للإدارة فقط). الدوال لا تستخدم this فيمكن تمريرها مباشرة إلى useResource.
export const salesService = {
  async listProducts(): Promise<SalesProduct[]> {
    const { products } = await api<{ products: SalesProduct[] }>("/sales/products");
    return products;
  },

  async createProduct(input: SalesProductInput): Promise<SalesProduct> {
    const { product } = await api<{ product: SalesProduct }>("/sales/products", { method: "POST", body: input });
    return product;
  },

  async updateProduct(id: string, input: Partial<SalesProductInput>): Promise<SalesProduct> {
    const { product } = await api<{ product: SalesProduct }>(`/sales/products/${id}`, { method: "PATCH", body: input });
    return product;
  },

  async removeProduct(id: string): Promise<void> {
    await api<{ ok: true }>(`/sales/products/${id}`, { method: "DELETE" });
  },

  /** أوردرات يوم واحد (YYYY-MM-DD) */
  async listOrders(date: string): Promise<SalesOrder[]> {
    const { orders } = await api<{ orders: SalesOrder[] }>("/sales/orders", { query: { date } });
    return orders;
  },

  /** بحث برقم البوليصة أو اسم المقفل في كل الأيام */
  async searchOrders(q: string): Promise<SalesOrder[]> {
    const { orders } = await api<{ orders: SalesOrder[] }>("/sales/orders", { query: { q } });
    return orders;
  },

  async closers(): Promise<string[]> {
    const { closers } = await api<{ closers: string[] }>("/sales/closers");
    return closers;
  },

  async createOrder(input: SalesOrderCreateInput): Promise<SalesOrder> {
    const { order } = await api<{ order: SalesOrder }>("/sales/orders", { method: "POST", body: input });
    return order;
  },

  async updateOrder(id: string, patch: SalesOrderPatch): Promise<SalesOrder> {
    const { order } = await api<{ order: SalesOrder }>(`/sales/orders/${id}`, { method: "PATCH", body: patch });
    return order;
  },

  async removeOrder(id: string): Promise<void> {
    await api<{ ok: true }>(`/sales/orders/${id}`, { method: "DELETE" });
  },

  async addLine(orderId: string, productId: string, quantity = 1): Promise<SalesOrder> {
    const { order } = await api<{ order: SalesOrder }>(`/sales/orders/${orderId}/lines`, { method: "POST", body: { productId, quantity } });
    return order;
  },

  async setLineQuantity(orderId: string, lineId: string, quantity: number): Promise<SalesOrder> {
    const { order } = await api<{ order: SalesOrder }>(`/sales/orders/${orderId}/lines/${lineId}`, { method: "PATCH", body: { quantity } });
    return order;
  },

  async removeLine(orderId: string, lineId: string): Promise<SalesOrder> {
    const { order } = await api<{ order: SalesOrder }>(`/sales/orders/${orderId}/lines/${lineId}`, { method: "DELETE" });
    return order;
  },
};
