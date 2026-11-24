import { useAuth } from "../components/auth/AuthProvider";

/**
 * صلاحيات العرض فقط (UX). الحماية الحقيقية في الـ backend: أي استدعاء ممنوع يعيد 403
 * حتى لو ظهر الزر. ADMIN/MANAGER = إدارة كاملة، DESIGNER = مهامه وملاحظاته وملفه.
 */
export function usePermissions() {
  const { user } = useAuth();
  const role = user?.accessRole;
  const isAdmin = role === "admin";
  const isStaff = role === "admin" || role === "manager";
  const isSalesAccountant = role === "sales_accountant";
  const isSalesAgent = role === "sales_agent";
  const isSalesAgentSupervisor = role === "sales_agent_supervisor";
  const isSalesEditor = role === "sales_editor";
  const isSalesSupervisor = role === "sales_supervisor";
  const isSalesRestricted = isSalesAccountant || isSalesEditor || isSalesSupervisor || isSalesAgent || isSalesAgentSupervisor;
  return {
    isAdmin,
    isStaff,
    userId: user?.id,
    /** تعديل/حذف المهام ونقلها بين الأعضاء */
    canManageTasks: isStaff,
    /** المخزون: الجميع يرى، الإدارة (المدير العام والمدير) تضيف وتعدّل وتسجّل الحركات وتحذف نهائياً */
    canManageInventory: isStaff,
    canDeleteInventory: isStaff,
    /** تعديل بيانات صنف موجود في المخزون (بدون أرشفة أو حذف): الإدارة + مشرف المبيعات */
    canEditInventoryItem: isStaff || isSalesSupervisor,
    /** إضافة صنف جديد للمخزون وإضافة كمية (حركة وارد IN): الإدارة + مشرف المبيعات */
    canAddStock: isStaff || isSalesSupervisor,
    /** إخفاء جميع الأسعار والإجماليات في المخزون والحركات (مشرف مبيعات ومنفّذ أوردرات ومراجع مرتجعات) */
    hideInventoryPrices: isSalesRestricted,
    /** المبيعات: زر علامة «مرتجع» للمراجعة */
    canFlagReturn: isStaff || isSalesAccountant || isSalesEditor || isSalesSupervisor,
    /** المبيعات: إضافة/تعديل الأوردر وبنوده ومكوّناته ونقله وإنشاء منتج ثابت جديد */
    canEditSalesOrders: isStaff || isSalesEditor || isSalesSupervisor,
    /** حذف أوردرات المبيعات (بما فيها المنفّذة وأوردرات الفتيات): لمدير النظام فقط */
    canDeleteSalesOrders: isAdmin,
    /** المبيعات: تغيير حالة الأوردر (تنفيذ/شحن/تسليم/مرتجع فعلي) — الإدارة + مشرف المبيعات (تخصم/تعيد المخزون) */
    canChangeSalesOrderStatus: isStaff || isSalesSupervisor,
    /** شحن / تم التسليم: الإدارة فقط هنا (المحاسب من صفحة المتابعة؛ المشرف والمنفّذ بلا هذين الزرين) */
    canShipDeliver: isStaff,
    /** صفحة متابعة المبيعات وحسابات الفتيات: المحاسب والإدارة */
    isSalesAccountant,
    isSalesAgent,
    isSalesAgentSupervisor,
    canExportAgentOrders: isStaff || isSalesAgentSupervisor,
    canViewAgentAccounts: isStaff || isSalesAccountant,
    /** المبيعات: تعديل أو إيقاف أو حذف منتج ثابت موجود — الإدارة + منفّذ الأوردرات + مشرف المبيعات */
    canManageSalesProducts: isStaff || isSalesEditor || isSalesSupervisor,
    /** المصمم يحذف تعليقه فقط؛ الإدارة أي تعليق */
    canDeleteComment: (commentUserId?: string) => isStaff || (!!user && commentUserId === user.id),
  };
}
