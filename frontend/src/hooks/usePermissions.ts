import { useAuth } from "../components/auth/AuthProvider";

/**
 * صلاحيات العرض فقط (UX). الحماية الحقيقية في الـ backend: أي استدعاء ممنوع يعيد 403
 * حتى لو ظهر الزر. ADMIN/MANAGER = إدارة كاملة، DESIGNER = مهامه وملاحظاته وملفه.
 */
export function usePermissions() {
  const { user } = useAuth();
  const role = user?.accessRole;
  const isStaff = role === "admin" || role === "manager";
  const isSalesFlagger = role === "sales_flagger";
  const isSalesEditor = role === "sales_editor";
  const isSalesSupervisor = role === "sales_supervisor";
  const isSalesRestricted = isSalesFlagger || isSalesEditor || isSalesSupervisor;
  return {
    isStaff,
    userId: user?.id,
    /** تعديل/حذف المهام ونقلها بين الأعضاء */
    canManageTasks: isStaff,
    /** المخزون: الجميع يرى، الإدارة (المدير العام والمدير) تضيف وتعدّل وتسجّل الحركات وتحذف نهائياً */
    canManageInventory: isStaff,
    canDeleteInventory: isStaff,
    /** إضافة صنف جديد للمخزون وإضافة كمية (حركة وارد IN): الإدارة + مشرف المبيعات */
    canAddStock: isStaff || isSalesSupervisor,
    /** إخفاء جميع الأسعار والإجماليات في المخزون والحركات (مشرف مبيعات ومنفّذ أوردرات ومراجع مرتجعات) */
    hideInventoryPrices: isSalesRestricted,
    /** المبيعات: زر علامة «مرتجع» للمراجعة */
    canFlagReturn: isStaff || isSalesFlagger || isSalesEditor || isSalesSupervisor,
    /** المبيعات: إضافة/حذف/تعديل الأوردر وبنوده ومكوّناته وإنشاء منتج ثابت جديد */
    canEditSalesOrders: isStaff || isSalesEditor || isSalesSupervisor,
    /** المبيعات: تغيير حالة الأوردر (تنفيذ/شحن/تسليم/مرتجع فعلي) — للإدارة فقط لأنها تخصم/تعيد المخزون */
    canChangeSalesOrderStatus: isStaff,
    /** المبيعات: تعديل أو إيقاف أو حذف منتج ثابت موجود — للإدارة فقط */
    canManageSalesProducts: isStaff,
    /** المصمم يحذف تعليقه فقط؛ الإدارة أي تعليق */
    canDeleteComment: (commentUserId?: string) => isStaff || (!!user && commentUserId === user.id),
  };
}
