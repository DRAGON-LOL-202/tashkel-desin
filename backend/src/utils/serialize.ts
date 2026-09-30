import type { User } from "../generated/prisma/client.ts";

export function publicUser(u: User) {
  return {
    id: u.id,
    name: u.name,
    username: u.username,
    email: u.email,
    role: u.role.toLowerCase() as "admin" | "manager" | "designer",
    jobTitle: u.jobTitle,
    isActive: u.isActive,
    isSystemUser: u.isSystemUser,
    createdAt: u.createdAt.toISOString(),
  };
}
export type PublicUser = ReturnType<typeof publicUser>;
