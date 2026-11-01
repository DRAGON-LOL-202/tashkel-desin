import type { InventoryAccessLevel, UserRole } from "./task";

/** شكل المستخدم كما يعيده الـ backend (بدون passwordHash أبداً) */
export interface ApiUser {
  id: string;
  name: string;
  username: string;
  email: string;
  role: UserRole;
  jobTitle: string | null;
  isActive: boolean;
  isSystemUser: boolean;
  inventoryAccess: InventoryAccessLevel;
  allowedCategoryIds?: string[];
  createdAt: string;
}

export interface CreateUserInput {
  name: string;
  username: string;
  email: string;
  password: string;
  role: UserRole;
  jobTitle?: string;
  /** للمصمم فقط (يُتجاهل لغيره) */
  inventoryAccess?: InventoryAccessLevel;
  /** لتعبئة/مشغل فقط */
  allowedCategoryIds?: string[];
}

export type UpdateUserInput = Partial<Omit<CreateUserInput, "password">> & { password?: string };

export interface UpdateProfileInput {
  name?: string;
  email?: string;
  jobTitle?: string;
  currentPassword?: string;
  newPassword?: string;
}
