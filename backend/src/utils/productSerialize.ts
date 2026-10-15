import type { Prisma } from "../generated/prisma/client.ts";
import { serializeAttachments } from "./attachments.js";

export const productInclude = {
  category: true,
  variants: { orderBy: [{ sortOrder: "asc" }, { id: "asc" }] },
} satisfies Prisma.ProductInclude;

export type ProductWithRefs = Prisma.ProductGetPayload<{ include: typeof productInclude }>;

/** Decimal → رقم بخانتين عشريتين */
const num = (d: { toString(): string }) => Math.round(Number(d.toString()) * 100) / 100;

export function serializeProduct(p: ProductWithRefs) {
  return {
    id: p.id,
    name: p.name,
    categoryId: p.categoryId,
    categoryName: p.category.name,
    attachments: serializeAttachments(p.attachments),
    variants: p.variants.map((v) => ({ id: v.id, label: v.label, cost: num(v.cost), price: num(v.price) })),
    createdById: p.createdById,
    createdAt: p.createdAt.toISOString(),
    updatedAt: p.updatedAt.toISOString(),
  };
}

export function serializeCategory(c: { id: string; name: string }) {
  return { id: c.id, name: c.name };
}

export const round2 = (n: number) => Math.round(n * 100) / 100;
