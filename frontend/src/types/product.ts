import type { ImageAttachment } from "./attachment";

export interface ProductCategory {
  id: string;
  name: string;
}

/** خامة/نسخة من المنتج: لكل خامة سعر تكلفة وسعر بيع */
export interface ProductVariant {
  id?: string;
  label: string;
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
  variants: { label: string; cost: number; price: number }[];
  attachments: ImageAttachment[];
}

export interface ProductsData {
  products: Product[];
  categories: ProductCategory[];
}
