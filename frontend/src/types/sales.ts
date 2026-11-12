export type SalesOrderStatus = "REGISTERED" | "EXECUTED" | "SHIPPED" | "DELIVERED" | "RETURNED";

/** مكوّن (صنف مخزون) داخل منتج ثابت أو بند أوردر. quantity = كمية الوحدة الواحدة من المنتج */
export interface SalesComponent {
  id: string;
  itemId: string;
  itemName: string;
  unit: string;
  quantity: number;
  /** تكلفة وحدة المكوّن: حيّة من المخزون قبل التنفيذ، ومثبّتة بعده (تُحجب عن أدوار المبيعات المقيدة) */
  unitCost?: number;
  /** سعر بيع وحدة المكوّن (نفس القاعدة) */
  unitSell?: number;
  /** الرصيد المتاح الآن في المخزون */
  available: number;
  itemActive: boolean;
  /** تالف عند المرتجع (لا يعود للمخزون) */
  damaged: boolean;
}

/** منتج ثابت (مثل «بوكس كبير») */
export interface SalesProduct {
  id: string;
  name: string;
  notes: string;
  isActive: boolean;
  components: SalesComponent[];
  costPerUnit?: number;
  sellPerUnit?: number;
  createdAt: string;
  updatedAt: string;
}

export interface SalesOrderLine {
  id: string;
  /** null إن حُذف المنتج الثابت لاحقاً (المحتويات والاسم محفوظان في البند) */
  productId: string | null;
  productName: string;
  quantity: number;
  components: SalesComponent[];
  costPerUnit?: number;
  sellPerUnit?: number;
  totalCost?: number;
  totalSell?: number;
}

export interface SalesShortage {
  itemId: string;
  itemName: string;
  unit: string;
  needed: number;
  available: number;
}

export interface SalesOrder {
  id: string;
  /** يوم الأوردر YYYY-MM-DD */
  date: string;
  /** رقم البوليصة */
  waybill: string;
  /** اسم المقفل */
  closerName: string;
  status: SalesOrderStatus;
  /** هل خُصمت المكونات من المخزون فعلاً */
  stockDeducted: boolean;
  notes: string;
  createdById: string;
  createdByName: string;
  createdAt: string;
  updatedAt: string;
  lines: SalesOrderLine[];
  costTotal?: number;
  sellTotal?: number;
  profit?: number;
  /** تكلفة المكونات التالفة عند المرتجع (تدخل في تالف اليوم) */
  damagedTotal?: number;
  /** الشركة علّمت الأوردر «مرتجع» ليراجعه الموظف ويسجله (لا أثر على المخزون) */
  returnFlagged: boolean;
  returnFlaggedAt: string | null;
  /** أوردر فتاة أُلغي بعد التصدير: يبقى ظاهراً بسبب الإلغاء ولا يقبل تعديلاً ولا تنفيذاً */
  cancelled?: boolean;
  cancelledAt?: string | null;
  cancelReason?: string | null;
  /** نقص الرصيد قبل التنفيذ */
  shortages: SalesShortage[];
  /** مكونات مؤرشفة في المخزون (تمنع التنفيذ) */
  archivedItems: string[];
}

export interface SalesProductInput {
  name: string;
  notes?: string;
  isActive?: boolean;
  components: { itemId: string; quantity: number }[];
}

export interface SalesOrderCreateInput {
  date: string;
  waybill?: string;
  closerName?: string;
  notes?: string;
  lines: { productId: string; quantity: number }[];
}

export interface SalesOrderPatch {
  date?: string;
  waybill?: string;
  closerName?: string;
  notes?: string;
  status?: SalesOrderStatus;
  /** علامة «مرتجع» للمراجعة (لا تغيّر الحالة ولا المخزون) */
  returnFlagged?: boolean;
  /** مع status = RETURNED: معرّفات المكونات التالفة التي لا تعود للمخزون */
  damagedComponentIds?: string[];
}
