import type { ImageAttachment } from "./attachment";

export interface ProductCategory {
  id: string;
  name: string;
}

/** خامة/نسخة من المنتج: التكلفة = تكلفة الخامة + تكلفة وقت الماكينة، ثم سعر البيع */
export interface ProductVariant {
  id?: string;
  label: string;
  /** تكلفة الخامة */
  materialCost: number;
  /** تكلفة وقت الماكينة */
  machineCost: number;
  /** إجمالي التكلفة (materialCost + machineCost) يحسبه الـ backend */
  cost: number;
  price: number;
}

export interface Product {
  id: string;
  name: string;
  categoryId: string;
  categoryName: string;
  /** صورة المنتج الأساسية (عنصر واحد كحد أقصى) */
  attachments: ImageAttachment[];
  variants: ProductVariant[];
  createdAt: string;
}

export interface ProductInput {
  name: string;
  categoryId: string;
  variants: { label: string; materialCost: number; machineCost: number; price: number }[];
  attachments: ImageAttachment[];
}

export interface ProductsData {
  products: Product[];
  categories: ProductCategory[];
}
