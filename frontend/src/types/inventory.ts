import type { ImageAttachment } from "./attachment";

export type InventoryMovementType = "IN" | "OUT" | "ADJUST" | "RETURN";

export type InventoryStockStatus = "AVAILABLE" | "LOW_STOCK" | "OUT_OF_STOCK";

export interface InventoryCategory {
  id: string;
  name: string;
  description: string;
  /** المجموعة الرئيسية؛ null للتصنيفات القديمة التي لم يوزّعها المدير بعد */
  groupId: string | null;
  groupName: string | null;
  itemsCount: number;
  createdAt: string;
  updatedAt: string;
}

/** مجموعة رئيسية ثابتة (خامات / اكسسوارات وهدايا) */
export interface InventoryGroup {
  id: string;
  key: string;
  name: string;
  categoriesCount: number;
  itemsCount: number;
}

export interface InventoryGroupsData {
  groups: InventoryGroup[];
  unassigned: { categoriesCount: number; itemsCount: number };
}

export interface InventoryStats {
  totalItems: number;
  totalQuantity: number;
  totalValue: number;
  availableCount: number;
  lowStockCount: number;
  outOfStockCount: number;
  shortageCount: number;
  todayMovementsCount: number;
}

export interface InventoryData {
  items: InventoryItem[];
  categories: InventoryCategory[];
  /** المجموعات الرئيسية (للإدارة فقط؛ فارغة لمن لا يملك صلاحية) */
  groups: InventoryGroup[];
  stats: InventoryStats;
  units: string[];
}

export interface InventoryItem {
  id: string;
  name: string;
  categoryId: string;
  categoryName: string;
  /** صور العنصر (حتى 10) */
  attachments: ImageAttachment[];
  sku: string | null;
  unit: string;
  quantity: number;
  minQuantity: number;
  /** سعر الوحدة بالجنيه المصري */
  unitPrice: number;
  /** سعر البيع بالجنيه المصري */
  sellPrice: number;
  /** إجمالي القيمة = الكمية الحالية × سعر الوحدة */
  totalValue: number;
  /** حالة المخزون: AVAILABLE (متوفر) | LOW_STOCK (منخفض) | OUT_OF_STOCK (نافد) */
  status: InventoryStockStatus;
  isOutOfStock: boolean;
  isLowStock: boolean;
  /** الرصيد وصل للحد الأدنى أو أقل (يحسبه الـ backend) */
  isLow: boolean;
  /** منتج ناقص (منخفض أو نافد) */
  isShortage: boolean;
  /** الكمية المقترحة لإعادة الطلب */
  suggestedReorderQty: number;
  notes: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface InventoryMovement {
  id: string;
  itemId: string;
  itemName: string;
  itemSku?: string | null;
  categoryId?: string;
  categoryName?: string;
  unit: string;
  /** معرّف طلب السحب (عدة أصناف معاً) أو null */
  batchId: string | null;
  type: InventoryMovementType;
  /** الرصيد السابق قبل الحركة */
  previousBalance: number;
  /** موقّعة: + إدخال/مرتجع / - إخراج / ± فرق جرد */
  delta: number;
  balanceAfter: number;
  /** سعر الوحدة وقت تسجيل الحركة */
  unitPriceSnapshot: number;
  /** القيمة المالية للحركة */
  movementValue: number;
  /** سبب الجرد أو الإرجاع */
  reason: string;
  /** رقم العملية الأصلية (للمرتجعات) */
  referenceId: string | null;
  note: string;
  createdById: string;
  createdByName: string;
  createdAt: string;
}

export interface InventoryItemInput {
  name: string;
  categoryId: string;
  attachments: ImageAttachment[];
  sku?: string | null;
  autoGenerateSku?: boolean;
  unit: string;
  minQuantity: number;
  unitPrice: number;
  sellPrice: number;
  notes: string;
  /** عند الإنشاء فقط */
  initialQuantity?: number;
  /** عند التعديل فقط */
  isActive?: boolean;
}

export interface InventoryCategoryInput {
  name: string;
  description?: string;
  groupId?: string;
}

export interface WithdrawLine {
  itemId: string;
  quantity: number;
}

export interface InventoryMovementInput {
  type: InventoryMovementType;
  quantity: number;
  reason?: string;
  referenceId?: string | null;
  note: string;
}

export interface InventoryMovementsQuery {
  from?: string;
  to?: string;
  categoryId?: string;
  itemId?: string;
  type?: InventoryMovementType;
  limit?: number;
}
