import { api } from "../lib/api";
import type {
  AgentAccountDetail,
  AgentAccountRow,
  AgentAccountTotals,
  AgentAdminRow,
  AgentBucket,
  AgentItem,
  AgentOrder,
  AgentOrderInput,
  AgentProduct,
  AgentProfile,
  AgentSummary,
  ExportResult,
  FollowList,
  FollowOrder,
  GeneralAccounts,
  OrderLogEntry,
} from "../types";

// مساحة الفتاة (SALES_AGENT). العزل مفروض في الباكند بمعرّف الفتاة من التوكن.
export const agentService = {
  async me(): Promise<AgentProfile | null> {
    const { profile } = await api<{ profile: AgentProfile | null }>("/agent/me");
    return profile;
  },

  async products(): Promise<AgentProduct[]> {
    const { products } = await api<{ products: AgentProduct[] }>("/agent/products");
    return products;
  },

  async items(): Promise<AgentItem[]> {
    const { items } = await api<{ items: AgentItem[] }>("/agent/items");
    return items;
  },

  async orders(bucket: AgentBucket, q: string): Promise<AgentOrder[]> {
    const { orders } = await api<{ orders: AgentOrder[] }>("/agent/orders", { query: { bucket, q } });
    return orders;
  },

  async dashboard(): Promise<AgentSummary> {
    const { summary } = await api<{ summary: AgentSummary }>("/agent/dashboard");
    return summary;
  },

  async create(input: AgentOrderInput): Promise<AgentOrder> {
    const { order } = await api<{ order: AgentOrder }>("/agent/orders", { method: "POST", body: input });
    return order;
  },

  async update(id: string, input: Partial<AgentOrderInput>): Promise<AgentOrder> {
    const { order } = await api<{ order: AgentOrder }>(`/agent/orders/${id}`, { method: "PATCH", body: input });
    return order;
  },

  async remove(id: string): Promise<void> {
    await api<{ ok: true }>(`/agent/orders/${id}`, { method: "DELETE" });
  },

  async exportOrders(ids: string[]): Promise<{ results: ExportResult[]; orders: AgentOrder[] }> {
    return api("/agent/orders/export", { method: "POST", body: { ids, confirm: true } });
  },

  async cancel(id: string, reason: string): Promise<AgentOrder> {
    const { order } = await api<{ order: AgentOrder }>(`/agent/orders/${id}/cancel`, { method: "POST", body: { reason, confirm: true } });
    return order;
  },
};

// المحاسب والإدارة
export const accountingService = {
  async followOrders(params: { agentId?: string; status?: string; q?: string; from?: string; to?: string }): Promise<FollowList> {
    return api<FollowList>("/accounting/orders", { query: params });
  },

  async setStatus(id: string, status: "SHIPPED" | "DELIVERED"): Promise<FollowOrder> {
    const { order } = await api<{ order: FollowOrder }>(`/accounting/orders/${id}/status`, { method: "PATCH", body: { status } });
    return order;
  },

  async setReturnFlag(id: string, flagged: boolean): Promise<FollowOrder> {
    const { order } = await api<{ order: FollowOrder }>(`/accounting/orders/${id}/return-flag`, { method: "PATCH", body: { flagged } });
    return order;
  },

  async setShipping(id: string, shippingPrice: number | null): Promise<FollowOrder> {
    const { order } = await api<{ order: FollowOrder }>(`/accounting/orders/${id}/shipping`, { method: "PUT", body: { shippingPrice } });
    return order;
  },

  async log(id: string): Promise<OrderLogEntry[]> {
    const { logs } = await api<{ logs: OrderLogEntry[] }>(`/accounting/orders/${id}/log`);
    return logs;
  },

  async agents(range: { from?: string; to?: string }): Promise<{ agents: AgentAccountRow[]; totals: AgentAccountTotals }> {
    return api("/accounting/agents", { query: range });
  },

  async agent(id: string, bucket: AgentBucket, range: { from?: string; to?: string }): Promise<AgentAccountDetail> {
    return api(`/accounting/agents/${id}`, { query: { bucket, ...range } });
  },

  async general(range: { from?: string; to?: string }): Promise<GeneralAccounts> {
    const { general } = await api<{ general: GeneralAccounts }>("/accounting/general", { query: range });
    return general;
  },
};

// إدارة Prefix الفتيات (الإدارة فقط)
export const agentAdminService = {
  async list(): Promise<AgentAdminRow[]> {
    const { agents } = await api<{ agents: AgentAdminRow[] }>("/sales-agents");
    return agents;
  },

  async setPrefix(userId: string, prefix: number, startSeq?: number): Promise<void> {
    await api(`/sales-agents/${userId}/prefix`, { method: "PUT", body: startSeq === undefined ? { prefix } : { prefix, startSeq } });
  },
};
