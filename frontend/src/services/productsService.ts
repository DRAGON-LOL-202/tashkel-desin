import { api } from "../lib/api";
import { toAttachmentPayload } from "../lib/attachments";
import type { Product, ProductCategory, ProductInput, ProductsData } from "../types";

const toBody = (input: Partial<ProductInput>) => ({
  ...input,
  ...(input.attachments ? { attachments: input.attachments.map(toAttachmentPayload) } : {}),
});

// أسعار المنتجات للإدارة فقط (المصمم يحصل على 403 من الـ backend).
export const productsService = {
  /** المنتجات والتصنيفات معاً ليعمل مع useResource والمزامنة الحية */
  async list(): Promise<ProductsData> {
    const [{ products }, { categories }] = await Promise.all([
      api<{ products: Product[] }>("/products"),
      api<{ categories: ProductCategory[] }>("/products/categories"),
    ]);
    return { products, categories };
  },

  async create(input: ProductInput): Promise<Product> {
    const { product } = await api<{ product: Product }>("/products", { method: "POST", body: toBody(input) });
    return product;
  },

  async update(id: string, input: Partial<ProductInput>): Promise<Product> {
    const { product } = await api<{ product: Product }>(`/products/${id}`, { method: "PATCH", body: toBody(input) });
    return product;
  },

  async remove(id: string): Promise<void> {
    await api<{ ok: true }>(`/products/${id}`, { method: "DELETE" });
  },

  async createCategory(name: string): Promise<ProductCategory> {
    const { category } = await api<{ category: ProductCategory }>("/products/categories", { method: "POST", body: { name } });
    return category;
  },
};
