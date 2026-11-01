import { api } from "../lib/api";
import type { ApiUser, CreateUserInput, TeamMember, UpdateProfileInput, UpdateUserInput, UserRole } from "../types";

export const roleLabel: Record<UserRole, string> = {
  admin: "مدير النظام",
  manager: "مدير",
  designer: "مصمم",
  packer: "تعبئة",
  operator: "مشغل",
};

export const inventoryAccessLabel = {
  none: "بلا وصول للمخزون",
  withdraw: "السحب فقط",
  full: "المخزون كامل",
} as const;

/** تحويل مستخدم الـ API إلى نموذج العرض المستخدم في الواجهة */
export function toMember(user: ApiUser): TeamMember {
  return {
    id: user.id,
    name: user.name,
    role: user.jobTitle?.trim() || roleLabel[user.role],
    accessRole: user.role,
    email: user.email,
    username: user.username,
    isActive: user.isActive,
    isSystemUser: user.isSystemUser,
    inventoryAccess: user.inventoryAccess ?? "none",
    ...(user.allowedCategoryIds ? { allowedCategoryIds: user.allowedCategoryIds } : {}),
  };
}

export const usersService = {
  /** للإدارة فقط (ADMIN/MANAGER)؛ المصمم يحصل على 403 من الـ backend */
  async list(): Promise<TeamMember[]> {
    const { users } = await api<{ users: ApiUser[] }>("/users");
    return users.map(toMember);
  },

  async create(input: CreateUserInput): Promise<TeamMember> {
    const { user } = await api<{ user: ApiUser }>("/users", { method: "POST", body: input });
    return toMember(user);
  },

  async update(id: string, input: UpdateUserInput): Promise<TeamMember> {
    const { user } = await api<{ user: ApiUser }>(`/users/${id}`, { method: "PATCH", body: input });
    return toMember(user);
  },

  async setActive(id: string, isActive: boolean): Promise<TeamMember> {
    const { user } = await api<{ user: ApiUser }>(`/users/${id}/status`, { method: "PATCH", body: { isActive } });
    return toMember(user);
  },

  /** purge=true: حذف الحساب مع كل بياناته. بدونه: يُرفض الحذف (409) إن كانت له بيانات مرتبطة. */
  async remove(id: string, purge = false): Promise<void> {
    await api<{ ok: true }>(`/users/${id}${purge ? "?purge=true" : ""}`, { method: "DELETE" });
  },

  /** الملف الشخصي: الاسم/البريد/المسمى + تغيير كلمة المرور (بالحالية). لا دور ولا صلاحيات. */
  async updateMe(input: UpdateProfileInput): Promise<TeamMember> {
    const { user } = await api<{ user: ApiUser }>("/users/me", { method: "PATCH", body: input });
    return toMember(user);
  },
};
