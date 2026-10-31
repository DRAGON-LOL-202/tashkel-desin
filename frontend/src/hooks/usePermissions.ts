import { useAuth } from "../components/auth/AuthProvider";

/**
 * صلاحيات العرض فقط (UX). الحماية الحقيقية في الـ backend: أي استدعاء ممنوع يعيد 403
 * حتى لو ظهر الزر. ADMIN/MANAGER = إدارة كاملة، DESIGNER = مهامه وملاحظاته وملفه.
 */
export function usePermissions() {
  const { user } = useAuth();
  const isStaff = user?.accessRole === "admin" || user?.accessRole === "manager";
  return {
    isStaff,
    userId: user?.id,
    /** تعديل/حذف المهام ونقلها بين الأعضاء */
    canManageTasks: isStaff,
    /** المخزون: الجميع يرى، الإدارة تضيف وتعدّل وتسجّل الحركات، والمدير العام وحده يحذف نهائياً */
    canManageInventory: isStaff,
    canDeleteInventory: user?.accessRole === "admin",
    /** المصمم يحذف تعليقه فقط؛ الإدارة أي تعليق */
    canDeleteComment: (commentUserId?: string) => isStaff || (!!user && commentUserId === user.id),
  };
}
