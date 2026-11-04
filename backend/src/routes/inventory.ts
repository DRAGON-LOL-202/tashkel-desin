import { Router } from "express";
import { randomUUID } from "node:crypto";
import type { Prisma } from "../generated/prisma/client.ts";
import { prisma } from "../db.js";
import { isStaff, requireAuth, requireRole, requireStaff } from "../middleware/auth.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { badRequest, conflict, forbidden, notFound } from "../utils/httpError.js";
import {
  allowedCategoryIds,
  effectiveInventoryAccess,
  isRestrictedRole,
  isSalesInventoryAllowed,
  isSalesRole,
  isWithdrawOnlyAllowed,
} from "../utils/inventoryAccess.js";
import {
  computeInventoryStats,
  inventoryItemInclude,
  movementInclude,
  num2,
  num3,
  serializeInventoryCategory,
  serializeInventoryItem,
  serializeInventoryMovement,
  stripInventoryStatsPrices,
} from "../utils/inventorySerialize.js";
import { assertAttachmentsAllowed, deleteStoredObjects } from "../utils/attachments.js";
import { keysOf, removedKeys } from "../utils/attachmentKeys.ts";
import { handleLowStockTransition } from "../utils/inventoryLowStock.js";
import {
  DEFAULT_INVENTORY_UNITS,
  createCategorySchema,
  createItemSchema,
  createMovementSchema,
  deleteCategorySchema,
  round3,
  updateCategorySchema,
  updateItemSchema,
  withdrawSchema,
} from "../validators/inventory.js";

// الصلاحيات:
// - مستوى الوصول (inventoryAccess): الإدارة كامل دائماً؛ المصمم حسب ما يحدده المدير (بلا وصول / السحب فقط / كامل)؛
//   «تعبئة» و«مشغل» سحب فقط ومن كل تصنيفات المجموعات الرئيسية (خامات / اكسسوارات وهدايا) الممنوحة لكل مستخدم.
// - «السحب فقط» لا يرى أسعاراً ولا إحصاءات قيمة، ولا يصل لغير مسارات السحب الأربعة.
// - غير الإدارة يرى سحوباته فقط.
// - الإدارة (ADMIN / MANAGER) تدير التصنيفات والعناصر والحركات والتقارير.
// - الحذف النهائي لعنصر مخزون: المدير العام (ADMIN) والمدير (MANAGER).
export const inventoryRouter = Router();
inventoryRouter.use(requireAuth);

// بوابة مستوى الوصول: بلا وصول ← 403 على كل شيء؛ السحب فقط ← القائمة البيضاء (GET / و/categories و/withdrawals وPOST /withdrawals).
inventoryRouter.use((req, _res, next) => {
  if (isSalesRole(req.user!)) {
    if (!isSalesInventoryAllowed(req.user!.role, req.method, req.path, req.body)) {
      return next(forbidden("ليس لديك صلاحية الوصول للمخزون"));
    }
    return next();
  }
  const level = effectiveInventoryAccess(req.user!);
  if (level === "NONE") return next(forbidden("ليس لديك صلاحية الوصول للمخزون"));
  if (level === "WITHDRAW" && !isWithdrawOnlyAllowed(req.method, req.path)) return next(forbidden());
  next();
});

const requireStaffOrSupervisor = requireRole("ADMIN", "MANAGER", "SALES_SUPERVISOR");
const isWithdrawOnly = (u: Parameters<typeof effectiveInventoryAccess>[0]) => effectiveInventoryAccess(u) === "WITHDRAW";
const shouldHideInventoryPrices = (u: Parameters<typeof isSalesRole>[0]) => isSalesRole(u);
/** حركات السحب بلا أسعار لمن يملك «السحب فقط» ولأدوار المبيعات */
const hideWithdrawalMoney = (u: Parameters<typeof effectiveInventoryAccess>[0]) => isWithdrawOnly(u) || shouldHideInventoryPrices(u);
/** التصنيفات المسموحة لتعبئة/مشغل؛ null = بلا قيد تصنيفات (إدارة أو مصمم) */
const categoryScope = (u: Parameters<typeof isRestrictedRole>[0] & { id: string }) => (isRestrictedRole(u) ? allowedCategoryIds(u.id) : Promise.resolve(null));

const CATEGORY_INCLUDE = { group: { select: { id: true, name: true } }, _count: { select: { items: true } } } as const;

const idOf = (v: unknown) => (typeof v === "string" && v.length > 0 && v.length <= 64 ? v : "");

const isUniqueViolation = (e: unknown) => (e as { code?: string })?.code === "P2002";

async function assertGroupExists(groupId: string) {
  const g = await prisma().inventoryGroup.findUnique({ where: { id: idOf(groupId) }, select: { id: true } });
  if (!g) throw badRequest("المجموعة الرئيسية غير موجودة");
}

async function assertCategoryExists(categoryId: string) {
  const c = await prisma().inventoryCategory.findUnique({ where: { id: idOf(categoryId) }, select: { id: true } });
  if (!c) throw badRequest("التصنيف غير موجود");
}

async function getItem(rawId: unknown) {
  const item = await prisma().inventoryItem.findUnique({ where: { id: idOf(rawId) }, include: inventoryItemInclude });
  if (!item) throw notFound("عنصر المخزون غير موجود");
  return item;
}

/** توليد كود منتج تلقائي غير مكرر بصيغة INV-0001 */
async function generateNextSku(tx: Pick<Prisma.TransactionClient, "inventoryItem"> = prisma()): Promise<string> {
  const existing = await tx.inventoryItem.findMany({
    where: { sku: { startsWith: "INV-" } },
    select: { sku: true },
  });
  let maxNum = 0;
  const used = new Set<string>();
  for (const row of existing) {
    if (!row.sku) continue;
    used.add(row.sku.toUpperCase());
    const m = /^INV-(\d+)$/i.exec(row.sku.trim());
    if (m) {
      const n = Number.parseInt(m[1], 10);
      if (Number.isFinite(n) && n > maxNum) maxNum = n;
    }
  }
  let candidateNum = maxNum + 1;
  while (true) {
    const candidate = `INV-${String(candidateNum).padStart(4, "0")}`;
    if (!used.has(candidate)) {
      const clash = await tx.inventoryItem.findUnique({ where: { sku: candidate }, select: { id: true } });
      if (!clash) return candidate;
    }
    candidateNum++;
  }
}

/** حركة بلا لقطة سعر ولا قيمة (لمن يملك «السحب فقط» أو أدوار المبيعات) */
function stripMovementPrices<T extends { unitPriceSnapshot: number; movementValue: number }>(m: T): Omit<T, "unitPriceSnapshot" | "movementValue"> {
  const { unitPriceSnapshot: _p, movementValue: _v, ...rest } = m;
  return rest;
}

/** صنف بلا أسعار ولا إجمالي قيمة (لأدوار المبيعات) */
function stripItemPrices<T extends { unitPrice: number; sellPrice: number; totalValue: number }>(
  item: T
): Omit<T, "unitPrice" | "sellPrice" | "totalValue"> {
  const { unitPrice: _p, sellPrice: _s, totalValue: _v, ...rest } = item;
  return rest;
}

/** بداية اليوم الحالي لحساب عدد حركات اليوم */
function startOfTodayUtc(): Date {
  const now = new Date();
  const tz = process.env.ATTENDANCE_TZ?.trim() || "Africa/Cairo";
  try {
    const isoDay = new Intl.DateTimeFormat("en-CA", {
      timeZone: tz,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(now);
    return new Date(`${isoDay}T00:00:00.000Z`);
  } catch {
    return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  }
}

// ===== القائمة والإحصائيات =====
inventoryRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const q = typeof req.query.q === "string" ? req.query.q.trim().slice(0, 100) : "";
    const includeInactive = req.query.includeInactive === "true";
    const categoryId = typeof req.query.categoryId === "string" && req.query.categoryId ? idOf(req.query.categoryId) : "";
    const statusFilter = typeof req.query.status === "string" ? req.query.status.toUpperCase() : "";
    const sortBy = typeof req.query.sortBy === "string" ? req.query.sortBy : "name";
    const sortDir = req.query.sortDir === "desc" ? -1 : 1;

    const withdrawOnly = isWithdrawOnly(req.user!);
    const hidePrices = shouldHideInventoryPrices(req.user!);
    const editorPickerOnly = req.user!.role === "SALES_EDITOR";
    const scope = await categoryScope(req.user!);
    const [allItems, todayMovementsCount] = await Promise.all([
      prisma().inventoryItem.findMany({
        // «السحب فقط» أو منفّذ الأوردرات: المفعّلة فقط، ولتعبئة/مشغل تصنيفاتهما فقط (بلا تصنيفات ← لا أصناف)
        where: withdrawOnly || editorPickerOnly ? { isActive: true, ...(scope ? { categoryId: { in: scope } } : {}) } : undefined,
        include: inventoryItemInclude,
        orderBy: [{ name: "asc" }, { id: "asc" }],
      }),
      withdrawOnly || editorPickerOnly
        ? Promise.resolve(0)
        : prisma().inventoryMovement.count({
            where: { createdAt: { gte: startOfTodayUtc() } },
          }),
    ]);

    const allSerialized = allItems.map(serializeInventoryItem);
    // إحصاءات القيمة والإجمالي لا تُحسب ولا تُرسل لمن يملك «السحب فقط» أو منفّذ الأوردرات
    const rawStats = withdrawOnly || editorPickerOnly ? undefined : computeInventoryStats(allSerialized, todayMovementsCount);

    let rows = allSerialized.filter((i) => (includeInactive && !withdrawOnly && ! hidePrices ? true : i.isActive));
    if (categoryId) rows = rows.filter((i) => i.categoryId === categoryId);
    if (q) {
      const ql = q.toLowerCase();
      rows = rows.filter((i) => i.name.toLowerCase().includes(ql) || (i.sku ?? "").toLowerCase().includes(ql));
    }
    if (req.query.lowOnly === "true") rows = rows.filter((i) => i.isLow);
    if (statusFilter === "AVAILABLE" || statusFilter === "LOW_STOCK" || statusFilter === "OUT_OF_STOCK") {
      rows = rows.filter((i) => i.status === statusFilter);
    } else if (statusFilter === "SHORTAGE") {
      rows = rows.filter((i) => i.isShortage);
    }

    if (sortBy === "quantity") {
      rows.sort((a, b) => (a.quantity - b.quantity) * sortDir || a.name.localeCompare(b.name, "ar"));
    } else if (sortBy === "value" && !withdrawOnly && !hidePrices) {
      rows.sort((a, b) => (a.totalValue - b.totalValue) * sortDir || a.name.localeCompare(b.name, "ar"));
    } else if (sortBy === "name" && sortDir === -1) {
      rows.reverse();
    }

    if (withdrawOnly) {
      // لا أسعار ولا قيمة ولا اقتراح إعادة طلب في ردود «السحب فقط»
      res.json({ items: rows.map(({ unitPrice: _p, sellPrice: _s, totalValue: _v, suggestedReorderQty: _r, ...rest }) => rest) });
      return;
    }
    if (hidePrices) {
      res.json({
        items: rows.map(stripItemPrices),
        ...(rawStats ? { stats: stripInventoryStatsPrices(rawStats) } : {}),
      });
      return;
    }
    res.json({ items: rows, stats: rawStats });
  })
);

// ===== توليد كود منتج تلقائي =====
inventoryRouter.get(
  "/next-sku",
  requireStaffOrSupervisor,
  asyncHandler(async (_req, res) => {
    const sku = await generateNextSku();
    res.json({ sku });
  })
);

// ===== وحدات القياس (الافتراضية + أي وحدات مخصصة مستخدمة) =====
inventoryRouter.get(
  "/units",
  asyncHandler(async (_req, res) => {
    const rows = await prisma().inventoryItem.findMany({
      select: { unit: true },
      distinct: ["unit"],
    });
    const set = new Set<string>(DEFAULT_INVENTORY_UNITS);
    for (const r of rows) {
      if (r.unit.trim()) set.add(r.unit.trim());
    }
    res.json({ units: [...set] });
  })
);

// ===== المجموعات الرئيسية (قراءة فقط: ثابتتان، لا إنشاء ولا تعديل ولا حذف) =====
inventoryRouter.get(
  "/groups",
  requireStaff,
  asyncHandler(async (_req, res) => {
    const groups = await prisma().inventoryGroup.findMany({ orderBy: [{ sortOrder: "asc" }, { id: "asc" }], select: { id: true, key: true, name: true } });
    const cats = await prisma().inventoryCategory.findMany({ where: { groupId: { not: null } }, select: { groupId: true, _count: { select: { items: true } } } });
    const unassigned = await prisma().inventoryCategory.findMany({ where: { groupId: null }, select: { _count: { select: { items: true } } } });
    res.json({
      groups: groups.map((g) => {
        const mine = cats.filter((c) => c.groupId === g.id);
        return { ...g, categoriesCount: mine.length, itemsCount: mine.reduce((s, c) => s + c._count.items, 0) };
      }),
      unassigned: { categoriesCount: unassigned.length, itemsCount: unassigned.reduce((s, c) => s + c._count.items, 0) },
    });
  })
);

// ===== التصنيفات (المسارات الثابتة قبل /:id) =====
inventoryRouter.get(
  "/categories",
  asyncHandler(async (req, res) => {
    const q = typeof req.query.q === "string" ? req.query.q.trim().slice(0, 100) : "";
    const scope = await categoryScope(req.user!);
    const items = await prisma().inventoryCategory.findMany({
      where: {
        ...(scope ? { id: { in: scope } } : {}),
        ...(q
          ? {
              OR: [
                { name: { contains: q, mode: "insensitive" } },
                { description: { contains: q, mode: "insensitive" } },
              ],
            }
          : {}),
      },
      include: CATEGORY_INCLUDE,
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    });
    res.json({ categories: items.map(serializeInventoryCategory) });
  })
);

inventoryRouter.post(
  "/categories",
  requireStaff,
  asyncHandler(async (req, res) => {
    const { name, description, groupId } = createCategorySchema.parse(req.body);
    await assertGroupExists(groupId);
    const dup = await prisma().inventoryCategory.findFirst({ where: { name: { equals: name, mode: "insensitive" } } });
    if (dup) throw conflict("هذا التصنيف موجود مسبقاً");
    const created = await prisma().inventoryCategory.create({
      data: { name, description, groupId },
      include: CATEGORY_INCLUDE,
    });
    res.status(201).json({ category: serializeInventoryCategory(created) });
  })
);

inventoryRouter.patch(
  "/categories/:id",
  requireStaff,
  asyncHandler(async (req, res) => {
    const categoryId = idOf(req.params.id);
    const existing = await prisma().inventoryCategory.findUnique({ where: { id: categoryId } });
    if (!existing) throw notFound("التصنيف غير موجود");
    const body = updateCategorySchema.parse(req.body);
    if (body.groupId !== undefined) await assertGroupExists(body.groupId);
    if (body.name !== undefined) {
      const dup = await prisma().inventoryCategory.findFirst({
        where: { name: { equals: body.name, mode: "insensitive" }, id: { not: existing.id } },
      });
      if (dup) throw conflict("هذا التصنيف موجود مسبقاً");
    }
    const updated = await prisma().inventoryCategory.update({
      where: { id: existing.id },
      data: {
        ...(body.name !== undefined ? { name: body.name } : {}),
        ...(body.description !== undefined ? { description: body.description } : {}),
        ...(body.groupId !== undefined ? { groupId: body.groupId } : {}),
      },
      include: CATEGORY_INCLUDE,
    });
    res.json({ category: serializeInventoryCategory(updated) });
  })
);

inventoryRouter.delete(
  "/categories/:id",
  requireStaff,
  asyncHandler(async (req, res) => {
    const categoryId = idOf(req.params.id);
    const existing = await prisma().inventoryCategory.findUnique({
      where: { id: categoryId },
      include: CATEGORY_INCLUDE,
    });
    if (!existing) throw notFound("التصنيف غير موجود");

    const parsedBody = deleteCategorySchema.safeParse(req.body ?? {});
    const queryReassign = typeof req.query.reassignToCategoryId === "string" ? req.query.reassignToCategoryId.trim() : undefined;
    const reassignToCategoryId = (parsedBody.success ? parsedBody.data.reassignToCategoryId : undefined) || queryReassign;

    const itemsCount = existing._count.items;
    if (itemsCount > 0) {
      if (!reassignToCategoryId) {
        throw conflict(`لا يمكن حذف التصنيف «${existing.name}» لاحتوائه على ${itemsCount} منتج. انقل المنتجات إلى تصنيف آخر أولاً`);
      }
      const targetId = idOf(reassignToCategoryId);
      if (!targetId || targetId === existing.id) {
        throw badRequest("اختر تصنيفاً بديلاً مختلفاً لنقل المنتجات إليه");
      }
      const target = await prisma().inventoryCategory.findUnique({ where: { id: targetId }, select: { id: true } });
      if (!target) throw badRequest("التصنيف البديل غير موجود");

      await prisma().$transaction([
        prisma().inventoryItem.updateMany({
          where: { categoryId: existing.id },
          data: { categoryId: target.id },
        }),
        prisma().inventoryCategory.delete({ where: { id: existing.id } }),
      ]);
      res.json({ ok: true, movedItems: itemsCount });
      return;
    }

    await prisma().inventoryCategory.delete({ where: { id: existing.id } });
    res.json({ ok: true, movedItems: 0 });
  })
);

// ===== سجل الحركات المفلتر (للتقارير والتدقيق) =====
inventoryRouter.get(
  "/movements",
  asyncHandler(async (req, res) => {
    const rawLimit = Number(req.query.limit);
    const limit = Number.isInteger(rawLimit) && rawLimit > 0 ? Math.min(rawLimit, 2000) : 500;
    const staff = isStaff(req.user!);
    const itemId = typeof req.query.itemId === "string" && req.query.itemId ? idOf(req.query.itemId) : "";
    const categoryId = typeof req.query.categoryId === "string" && req.query.categoryId ? idOf(req.query.categoryId) : "";
    const rawType = typeof req.query.type === "string" ? req.query.type.toUpperCase() : "";
    const type = rawType === "IN" || rawType === "OUT" || rawType === "ADJUST" || rawType === "RETURN" ? rawType : undefined;
    const from = typeof req.query.from === "string" && /^\d{4}-\d{2}-\d{2}$/.test(req.query.from) ? req.query.from : "";
    const to = typeof req.query.to === "string" && /^\d{4}-\d{2}-\d{2}$/.test(req.query.to) ? req.query.to : "";

    const where: Prisma.InventoryMovementWhereInput = {
      ...(staff ? {} : { createdById: req.user!.id }),
      ...(itemId ? { itemId } : {}),
      ...(categoryId ? { item: { categoryId } } : {}),
      ...(type ? { type } : {}),
      ...(from || to
        ? {
            createdAt: {
              ...(from ? { gte: new Date(`${from}T00:00:00.000Z`) } : {}),
              ...(to ? { lt: new Date(Date.parse(`${to}T00:00:00.000Z`) + 86_400_000) } : {}),
            },
          }
        : {}),
    };

    const rows = await prisma().inventoryMovement.findMany({
      where,
      include: movementInclude,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: limit,
    });
    res.json({ movements: rows.map(serializeInventoryMovement) });
  })
);

// ===== السحب من المخزون (لكل مستخدم مسجّل) =====
// طلب واحد بعدة أصناف: كله أو لا شيء. تُقفل صفوف الأصناف مرتبة بالمعرّف (يمنع الجمود بين طلبين متزامنين)،
// ثم يُتحقق من الرصيد وتُسجَّل حركة OUT لكل صنف بنفس batchId.
inventoryRouter.post(
  "/withdrawals",
  asyncHandler(async (req, res) => {
    const body = withdrawSchema.parse(req.body);
    const userId = req.user!.id;
    const ids = body.lines.map((l) => idOf(l.itemId)).sort();
    if (ids.some((id) => id === "")) throw badRequest("صنف غير صالح");
    const batchId = body.requestId ?? randomUUID();

    const transitions: Array<{
      id: string;
      name: string;
      unit: string;
      beforeQty: number;
      afterQty: number;
      minQty: number;
      wasAlertSent: boolean;
      isActive: boolean;
    }> = [];

    const movements = await prisma().$transaction(async (tx) => {
      if (body.requestId) {
        const dupBatch = await tx.inventoryMovement.findFirst({ where: { batchId }, select: { id: true } });
        if (dupBatch) throw conflict("تم تنفيذ عملية السحب هذه مسبقاً");
      }
      await tx.$queryRaw`SELECT "id" FROM "InventoryItem" WHERE "id" = ANY(${ids}::text[]) ORDER BY "id" FOR UPDATE`;
      const allowedScope = isRestrictedRole(req.user!)
        ? new Set(await allowedCategoryIds(userId, tx))
        : null;
      const items = await tx.inventoryItem.findMany({ where: { id: { in: ids } } });
      const byId = new Map(items.map((i) => [i.id, i]));
      const created: { id: string }[] = [];
      for (const line of [...body.lines].sort((a, b) => (a.itemId < b.itemId ? -1 : 1))) {
        const item = byId.get(line.itemId);
        if (!item) throw notFound("أحد الأصناف غير موجود");
        // تعبئة/مشغل: التحقق داخل المعاملة وبعد قفل الصفوف؛ أي صنف خارج تصنيفاته يرفض الطلب كله بلا خصم جزئي
        if (allowedScope && !allowedScope.has(item.categoryId)) throw forbidden("لا تملك صلاحية السحب من أحد هذه الأصناف");
        if (!item.isActive) throw badRequest(`«${item.name}» غير مفعّل`);
        const before = num3(item.quantity);
        const after = round3(before - line.quantity);
        if (after < 0) throw conflict(`الرصيد غير كافٍ لـ «${item.name}» (المتاح ${before} ${item.unit})`);
        await tx.inventoryItem.update({ where: { id: item.id }, data: { quantity: after } });
        created.push(
          await tx.inventoryMovement.create({
            data: {
              itemId: item.id,
              type: "OUT",
              previousBalance: before,
              delta: -line.quantity,
              balanceAfter: after,
              unitPriceSnapshot: num2(item.unitPrice),
              note: body.note,
              batchId,
              createdById: userId,
            },
            select: { id: true },
          })
        );
        transitions.push({
          id: item.id,
          name: item.name,
          unit: item.unit,
          beforeQty: before,
          afterQty: after,
          minQty: num3(item.minQuantity),
          wasAlertSent: item.lowAlertSent,
          isActive: item.isActive,
        });
      }
      return tx.inventoryMovement.findMany({
        where: { id: { in: created.map((c) => c.id) } },
        include: movementInclude,
        orderBy: [{ id: "asc" }],
      });
    });

    await handleLowStockTransition(transitions);
    const out = movements.map(serializeInventoryMovement);
    res.status(201).json({ batchId, movements: hideWithdrawalMoney(req.user!) ? out.map(stripMovementPrices) : out });
  })
);

// سجل السحوبات: الإدارة ترى الجميع، والمصمم يرى سحوباته فقط.
inventoryRouter.get(
  "/withdrawals",
  asyncHandler(async (req, res) => {
    const raw = Number(req.query.limit);
    const limit = Number.isInteger(raw) && raw > 0 ? Math.min(raw, 500) : 200;
    const staff = isStaff(req.user!);
    const rows = await prisma().inventoryMovement.findMany({
      where: { batchId: { not: null }, ...(staff ? {} : { createdById: req.user!.id }) },
      include: movementInclude,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: limit,
    });
    const out = rows.map(serializeInventoryMovement);
    res.json({ movements: hideWithdrawalMoney(req.user!) ? out.map(stripMovementPrices) : out });
  })
);

// ===== تفاصيل عنصر واحد =====
inventoryRouter.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const item = await getItem(req.params.id);
    const serialized = serializeInventoryItem(item);
    res.json({ item: shouldHideInventoryPrices(req.user!) ? stripItemPrices(serialized) : serialized });
  })
);

// ===== سجل حركات عنصر =====
inventoryRouter.get(
  "/:id/movements",
  asyncHandler(async (req, res) => {
    const item = await getItem(req.params.id);
    const raw = Number(req.query.limit);
    const limit = Number.isInteger(raw) && raw > 0 ? Math.min(raw, 500) : 100;
    const rows = await prisma().inventoryMovement.findMany({
      where: { itemId: item.id },
      include: movementInclude,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: limit,
    });
    const out = rows.map(serializeInventoryMovement);
    res.json({ movements: shouldHideInventoryPrices(req.user!) ? out.map(stripMovementPrices) : out });
  })
);

// ===== إنشاء عنصر =====
inventoryRouter.post(
  "/",
  requireStaffOrSupervisor,
  asyncHandler(async (req, res) => {
    const body = createItemSchema.parse(req.body);
    await assertCategoryExists(body.categoryId);
    await assertAttachmentsAllowed(req.user!.id, "inventory", body.attachments, []);
    try {
      const created = await prisma().$transaction(async (tx) => {
        const finalSku = body.sku ?? (body.autoGenerateSku ? await generateNextSku(tx) : null);
        const item = await tx.inventoryItem.create({
          data: {
            name: body.name,
            categoryId: body.categoryId,
            attachments: body.attachments,
            sku: finalSku,
            unit: body.unit,
            minQuantity: body.minQuantity,
            quantity: body.initialQuantity,
            unitPrice: body.unitPrice,
            sellPrice: body.sellPrice,
            notes: body.notes,
          },
        });
        // الرصيد الافتتاحي يُسجَّل كحركة إدخال مرة واحدة فقط عند الإنشاء ليبقى السجل مطابقاً للرصيد دائماً
        if (body.initialQuantity > 0) {
          await tx.inventoryMovement.create({
            data: {
              itemId: item.id,
              type: "IN",
              previousBalance: 0,
              delta: body.initialQuantity,
              balanceAfter: body.initialQuantity,
              unitPriceSnapshot: body.unitPrice,
              reason: "رصيد افتتاحي",
              note: "رصيد افتتاحي",
              createdById: req.user!.id,
            },
          });
        }
        return tx.inventoryItem.findUniqueOrThrow({ where: { id: item.id }, include: inventoryItemInclude });
      });

      if (body.minQuantity > 0 && body.initialQuantity <= body.minQuantity) {
        await handleLowStockTransition([
          {
            id: created.id,
            name: created.name,
            unit: created.unit,
            beforeQty: body.initialQuantity,
            afterQty: body.initialQuantity,
            minQty: body.minQuantity,
            wasAlertSent: false,
            isActive: created.isActive,
          },
        ]);
      }

      const serialized = serializeInventoryItem(created);
      res.status(201).json({ item: shouldHideInventoryPrices(req.user!) ? stripItemPrices(serialized) : serialized });
    } catch (e) {
      if (isUniqueViolation(e)) throw conflict("كود المنتج مستخدم مسبقاً");
      throw e;
    }
  })
);

// ===== تعديل بيانات عنصر (الرصيد يتغيّر بالحركات فقط، ولا تتكرر الحركة الافتتاحية) =====
inventoryRouter.patch(
  "/:id",
  requireStaff,
  asyncHandler(async (req, res) => {
    const existing = await getItem(req.params.id);
    const body = updateItemSchema.parse(req.body);
    if (body.categoryId !== undefined) await assertCategoryExists(body.categoryId);
    if (body.attachments !== undefined) await assertAttachmentsAllowed(req.user!.id, "inventory", body.attachments, existing.attachments);
    try {
      const updated = await prisma().inventoryItem.update({
        where: { id: existing.id },
        data: {
          ...(body.name !== undefined ? { name: body.name } : {}),
          ...(body.categoryId !== undefined ? { categoryId: body.categoryId } : {}),
          ...(body.attachments !== undefined ? { attachments: body.attachments } : {}),
          ...(body.sku !== undefined ? { sku: body.sku } : {}),
          ...(body.unit !== undefined ? { unit: body.unit } : {}),
          ...(body.minQuantity !== undefined ? { minQuantity: body.minQuantity } : {}),
          ...(body.unitPrice !== undefined ? { unitPrice: body.unitPrice } : {}),
          ...(body.sellPrice !== undefined ? { sellPrice: body.sellPrice } : {}),
          ...(body.notes !== undefined ? { notes: body.notes } : {}),
          ...(body.isActive !== undefined ? { isActive: body.isActive } : {}),
        },
        include: inventoryItemInclude,
      });
      if (body.attachments !== undefined) await deleteStoredObjects(removedKeys(existing.attachments, body.attachments));

      if (body.minQuantity !== undefined) {
        const currentQty = num3(updated.quantity);
        await handleLowStockTransition([
          {
            id: updated.id,
            name: updated.name,
            unit: updated.unit,
            beforeQty: currentQty,
            afterQty: currentQty,
            minQty: num3(updated.minQuantity),
            wasAlertSent: existing.lowAlertSent,
            isActive: updated.isActive,
          },
        ]);
      }

      res.json({ item: serializeInventoryItem(updated) });
    } catch (e) {
      if (isUniqueViolation(e)) throw conflict("كود المنتج مستخدم مسبقاً");
      throw e;
    }
  })
);

// ===== حركة مخزون (وارد IN / إخراج OUT / جرد ADJUST / مرتجع RETURN) =====
// تُنفَّذ داخل معاملة واحدة مع قفل صف العنصر (FOR UPDATE): تسلسل الحركات المتزامنة على نفس العنصر،
// فلا يضيع تحديث ولا يهبط الرصيد تحت الصفر (يمنعه فحص هنا + قيد CHECK في قاعدة البيانات).
inventoryRouter.post(
  "/:id/movements",
  requireStaffOrSupervisor,
  asyncHandler(async (req, res) => {
    if (req.user!.role === "SALES_SUPERVISOR") {
      if (typeof req.body !== "object" || req.body === null || (req.body as Record<string, unknown>).type !== "IN") {
        throw forbidden();
      }
    }
    const itemId = idOf(req.params.id);
    const body = createMovementSchema.parse(req.body);
    if (req.user!.role === "SALES_SUPERVISOR" && body.type !== "IN") throw forbidden();
    const userId = req.user!.id;

    const result = await prisma().$transaction(async (tx) => {
      const locked = await tx.$queryRaw<{ id: string }[]>`SELECT "id" FROM "InventoryItem" WHERE "id" = ${itemId} FOR UPDATE`;
      if (locked.length === 0) throw notFound("عنصر المخزون غير موجود");
      const current = await tx.inventoryItem.findUniqueOrThrow({
        where: { id: itemId },
        select: { name: true, unit: true, quantity: true, minQuantity: true, unitPrice: true, lowAlertSent: true, isActive: true },
      });
      if (!current.isActive) throw badRequest("العنصر غير مفعّل");

      const before = num3(current.quantity);
      let after: number;
      if (body.type === "IN" || body.type === "RETURN") after = round3(before + body.quantity);
      else if (body.type === "OUT") after = round3(before - body.quantity);
      else after = body.quantity;

      if (after < 0) throw conflict(`الرصيد غير كافٍ (المتاح ${before})`);
      const delta = round3(after - before);

      await tx.inventoryItem.update({ where: { id: itemId }, data: { quantity: after } });
      const movement = await tx.inventoryMovement.create({
        data: {
          itemId,
          type: body.type,
          previousBalance: before,
          delta,
          balanceAfter: after,
          unitPriceSnapshot: num2(current.unitPrice),
          reason: body.reason,
          referenceId: body.referenceId ?? null,
          note: body.note,
          createdById: userId,
        },
        include: movementInclude,
      });
      const item = await tx.inventoryItem.findUniqueOrThrow({ where: { id: itemId }, include: inventoryItemInclude });
      return {
        item,
        movement,
        transition: {
          id: itemId,
          name: current.name,
          unit: current.unit,
          beforeQty: before,
          afterQty: after,
          minQty: num3(current.minQuantity),
          wasAlertSent: current.lowAlertSent,
          isActive: current.isActive,
        },
      };
    });

    await handleLowStockTransition([result.transition]);
    const hideMoney = shouldHideInventoryPrices(req.user!);
    const serializedItem = serializeInventoryItem(result.item);
    const serializedMovement = serializeInventoryMovement(result.movement);
    res.status(201).json({
      item: hideMoney ? stripItemPrices(serializedItem) : serializedItem,
      movement: hideMoney ? stripMovementPrices(serializedMovement) : serializedMovement,
    });
  })
);

// ===== حذف نهائي (المدير العام والمدير) — يحذف سجل حركاته أيضاً؛ الأفضل الأرشفة عبر isActive =====
inventoryRouter.delete(
  "/:id",
  requireStaff,
  asyncHandler(async (req, res) => {
    const existing = await getItem(req.params.id);
    try {
      await prisma().inventoryItem.delete({ where: { id: existing.id } });
    } catch (e) {
      // مكوّن في منتج/أوردر مبيعات (علاقة Restrict): نمنع الحذف برسالة واضحة بدل 500
      if ((e as { code?: string })?.code === "P2003") {
        throw conflict("لا يمكن حذف هذا المنتج لأنه داخل في محتويات منتجات أو أوردرات في صفحة المبيعات. استخدم الأرشفة بدلاً من الحذف.");
      }
      throw e;
    }
    await deleteStoredObjects(keysOf(existing.attachments));
    res.json({ ok: true });
  })
);
