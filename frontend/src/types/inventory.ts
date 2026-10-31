import type { ImageAttachment } from "./attachment";

export type InventoryMovementType = "IN" | "OUT" | "ADJUST";

export interface InventoryCategory {
  id: string;
  name: string;
}

export interface InventoryData {
  items: InventoryItem[];
  categories: InventoryCategory[];
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
  /** الرصيد وصل للحد الأدنى أو أقل (يحسبه الـ backend) */
  isLow: boolean;
  notes: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface InventoryMovement {
  id: string;
  itemId: string;
  itemName: string;
  unit: string;
  /** معرّف طلب السحب (عدة أصناف معاً) أو null */
  batchId: string | null;
  type: InventoryMovementType;
  /** موقّعة: + إدخال / - إخراج */
  delta: number;
  balanceAfter: number;
  note: string;
  createdById: string;
  createdByName: string;
  createdAt: string;
}

export interface InventoryItemInput {
  name: string;
  categoryId: string;
  attachments: ImageAttachment[];
  sku: string | null;
  unit: string;
  minQuantity: number;
  notes: string;
  /** عند الإنشاء فقط */
  initialQuantity?: number;
  /** عند التعديل فقط */
  isActive?: boolean;
}

export interface WithdrawLine {
  itemId: string;
  quantity: number;
}

export interface InventoryMovementInput {
  type: InventoryMovementType;
  quantity: number;
  note: string;
}
