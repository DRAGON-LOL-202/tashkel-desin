import { Router } from "express";
import { prisma } from "../db.js";
import { requireAuth, requireStaff } from "../middleware/auth.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { badRequest, conflict, notFound } from "../utils/httpError.js";
import { assertAttachmentsAllowed, deleteStoredObjects } from "../utils/attachments.js";
import { keysOf, removedKeys } from "../utils/attachmentKeys.ts";
import { productInclude, round2, serializeCategory, serializeProduct } from "../utils/productSerialize.js";
import { createCategorySchema, createProductSchema, updateProductSchema, type VariantInput } from "../validators/products.js";

// أسعار المنتجات للإدارة فقط (ADMIN/MANAGER)؛ المصمم يحصل على 403.
export const productsRouter = Router();
productsRouter.use(requireAuth, requireStaff);

const idOf = (v: unknown) => (typeof v === "string" && v.length > 0 && v.length <= 64 ? v : "");

const variantRows = (variants: VariantInput[]) =>
  variants.map((v, i) => ({
    label: v.label,
    materialCost: v.materialCost,
    machineCost: v.machineCost,
    cost: round2(v.materialCost + v.machineCost),
    price: round2(v.price),
    sortOrder: i,
  }));

async function assertCategoryExists(categoryId: string) {
  const c = await prisma().productCategory.findUnique({ where: { id: idOf(categoryId) }, select: { id: true } });
  if (!c) throw badRequest("التصنيف غير موجود");
}

async function getProduct(rawId: unknown) {
  const item = await prisma().product.findUnique({ where: { id: idOf(rawId) }, include: productInclude });
  if (!item) throw notFound("المنتج غير موجود");
  return item;
}

// ===== التصنيفات (المسارات الثابتة قبل /:id) =====
productsRouter.get(
  "/categories",
  asyncHandler(async (_req, res) => {
    const items = await prisma().productCategory.findMany({ orderBy: [{ createdAt: "asc" }, { id: "asc" }] });
    res.json({ categories: items.map(serializeCategory) });
  })
);

productsRouter.post(
  "/categories",
  asyncHandler(async (req, res) => {
    const { name } = createCategorySchema.parse(req.body);
    const dup = await prisma().productCategory.findFirst({ where: { name: { equals: name, mode: "insensitive" } } });
    if (dup) throw conflict("هذا التصنيف موجود مسبقاً");
    const created = await prisma().productCategory.create({ data: { name } });
    res.status(201).json({ category: serializeCategory(created) });
  })
);

// ===== المنتجات =====
productsRouter.get(
  "/",
  asyncHandler(async (_req, res) => {
    const items = await prisma().product.findMany({ include: productInclude, orderBy: [{ createdAt: "desc" }, { id: "desc" }] });
    res.json({ products: items.map(serializeProduct) });
  })
);

productsRouter.post(
  "/",
  asyncHandler(async (req, res) => {
    const user = req.user!;
    const body = createProductSchema.parse(req.body);
    await assertCategoryExists(body.categoryId);
    await assertAttachmentsAllowed(user.id, "products", body.attachments ?? [], []);
    const created = await prisma().product.create({
      data: {
        name: body.name,
        categoryId: body.categoryId,
        attachments: body.attachments ?? [],
        createdById: user.id,
        variants: { create: variantRows(body.variants) },
      },
      include: productInclude,
    });
    res.status(201).json({ product: serializeProduct(created) });
  })
);

productsRouter.patch(
  "/:id",
  asyncHandler(async (req, res) => {
    const existing = await getProduct(req.params.id);
    const body = updateProductSchema.parse(req.body);
    if (body.categoryId !== undefined) await assertCategoryExists(body.categoryId);
    if (body.attachments !== undefined) await assertAttachmentsAllowed(req.user!.id, "products", body.attachments, existing.attachments);

    // استبدال الخامات كاملة داخل عملية واحدة: لا حالة وسطى
    const updated = await prisma().$transaction(async (tx) => {
      if (body.variants !== undefined) {
        await tx.productVariant.deleteMany({ where: { productId: existing.id } });
        await tx.productVariant.createMany({ data: variantRows(body.variants).map((v) => ({ ...v, productId: existing.id })) });
      }
      return tx.product.update({
        where: { id: existing.id },
        data: {
          ...(body.name !== undefined ? { name: body.name } : {}),
          ...(body.categoryId !== undefined ? { categoryId: body.categoryId } : {}),
          ...(body.attachments !== undefined ? { attachments: body.attachments } : {}),
        },
        include: productInclude,
      });
    });
    if (body.attachments !== undefined) await deleteStoredObjects(removedKeys(existing.attachments, body.attachments));
    res.json({ product: serializeProduct(updated) });
  })
);

productsRouter.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    const existing = await getProduct(req.params.id);
    await prisma().product.delete({ where: { id: existing.id } });
    await deleteStoredObjects(keysOf(existing.attachments));
    res.json({ ok: true });
  })
);
