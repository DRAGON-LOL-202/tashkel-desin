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
  AgentSalesPage,
  AgentSummary,
  ExportResult,
  FollowList,
  FollowOrder,
  GeneralAccountsResponse,
  OrderLogEntry,
  SalesPageAdminRow,
  SupervisorAgentOrder,
  SupervisorFilters,
  SupervisorOrdersList,
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

  async pages(): Promise<AgentSalesPage[]> {
    const { pages } = await api<{ pages: AgentSalesPage[] }>("/agent/pages");
    return pages;
  },

  async items(): Promise<AgentItem[]> {
    const { items } = await api<{ items: AgentItem[] }>("/agent/items");
    return items;
  },

  async orders(bucket: AgentBucket, q: string): Promise<AgentOrder[]> {
    const { orders } = await api<{ orders: AgentOrder[] }>("/agent/orders", { query: { bucket, q } });
    return orders;
  },

  async ordersPage(
    bucket: AgentBucket,
    q: string,
    page?: { limit?: number; offset?: number }
  ): Promise<{ orders: AgentOrder[]; total: number; hasMore: boolean }> {
    return api<{ orders: AgentOrder[]; total: number; hasMore: boolean }>("/agent/orders", {
      query: {
        bucket,
        q,
        ...(page?.limit !== undefined ? { limit: String(page.limit) } : {}),
        ...(page?.offset !== undefined ? { offset: String(page.offset) } : {}),
      },
    });
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

  async cancel(id: string, reason: string): Promise<AgentOrder> {
    const { order } = await api<{ order: AgentOrder }>(`/agent/orders/${id}/cancel`, { method: "POST", body: { reason, confirm: true } });
    return order;
  },
};

// مشرف الفتيات (SALES_AGENT_SUPERVISOR) والإدارة: تجميع وتصدير أوردرات الفتيات للإنتاج
export const agentSupervisorService = {
  async filters(): Promise<SupervisorFilters> {
    return api<SupervisorFilters>("/agent-supervisor/filters");
  },

  async orders(params: {
    status?: string;
    agentId?: string;
    salesPageId?: string;
    q?: string;
    from?: string;
    to?: string;
    limit?: string;
    offset?: string;
  }): Promise<SupervisorOrdersList> {
    return api<SupervisorOrdersList>("/agent-supervisor/orders", { query: params });
  },

  async exportOrders(ids: string[]): Promise<{ results: ExportResult[]; orders: SupervisorAgentOrder[] }> {
    return api("/agent-supervisor/orders/export", { method: "POST", body: { ids, confirm: true } });
  },

  async cancel(id: string, reason: string): Promise<SupervisorAgentOrder> {
    const { order } = await api<{ order: SupervisorAgentOrder }>(`/agent-supervisor/orders/${id}/cancel`, {
      method: "POST",
      body: { reason, confirm: true },
    });
    return order;
  },
};

// المحاسب والإدارة
export const accountingService = {
  async followOrders(params: {
    agentId?: string;
    salesPageId?: string;
    status?: string;
    q?: string;
    from?: string;
    to?: string;
    limit?: string;
    offset?: string;
  }): Promise<FollowList> {
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

  async general(range: { from?: string; to?: string; salesPageId?: string }): Promise<GeneralAccountsResponse> {
    return api<GeneralAccountsResponse>("/accounting/general", { query: range });
  },

  async pages(): Promise<{ id: string; name: string; isActive: boolean }[]> {
    const { pages } = await api<{ pages: { id: string; name: string; isActive: boolean }[] }>("/accounting/pages");
    return pages;
  },
};

// إدارة Prefix الفتيات وصفحات البيع (الإدارة فقط)
export const agentAdminService = {
  async list(): Promise<AgentAdminRow[]> {
    const { agents } = await api<{ agents: AgentAdminRow[] }>("/sales-agents");
    return agents;
  },

  async setPrefix(userId: string, prefix: number, startSeq?: number): Promise<void> {
    await api(`/sales-agents/${userId}/prefix`, { method: "PUT", body: startSeq === undefined ? { prefix } : { prefix, startSeq } });
  },

  async listPages(): Promise<SalesPageAdminRow[]> {
    const { pages } = await api<{ pages: SalesPageAdminRow[] }>("/sales-agents/pages");
    return pages;
  },

  async createPage(name: string): Promise<SalesPageAdminRow> {
    const { page } = await api<{ page: SalesPageAdminRow }>("/sales-agents/pages", { method: "POST", body: { name } });
    return page;
  },

  async updatePage(id: string, input: { name?: string; isActive?: boolean }): Promise<SalesPageAdminRow> {
    const { page } = await api<{ page: SalesPageAdminRow }>(`/sales-agents/pages/${id}`, { method: "PATCH", body: input });
    return page;
  },

  async deletePage(id: string): Promise<void> {
    await api<{ ok: true }>(`/sales-agents/pages/${id}`, { method: "DELETE" });
  },
};
