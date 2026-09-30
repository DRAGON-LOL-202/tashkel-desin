import request from "supertest";
import bcrypt from "bcryptjs";
import { createApp } from "../src/app.ts";
import { prisma } from "../src/db.ts";
import { runSeed } from "../prisma/seed.ts";

export const app = createApp();
export const PASSWORD = process.env.ADMIN_PASSWORD!;

export async function resetDb() {
  await prisma().$executeRawUnsafe(
    'TRUNCATE "TaskTimeLog","TaskComment","Task","Feedback","Goal","CalendarEvent","User" RESTART IDENTITY CASCADE'
  );
  await runSeed();
}

export async function makeUser(username: string, role: "ADMIN" | "MANAGER" | "DESIGNER" = "DESIGNER", extra: Record<string, unknown> = {}) {
  return prisma().user.create({
    data: {
      name: username,
      username,
      email: `${username}@example.test`,
      passwordHash: await bcrypt.hash(PASSWORD, 4),
      role,
      ...extra,
    },
  });
}

export async function login(username: string, password = PASSWORD): Promise<string> {
  const res = await request(app).post("/api/auth/login").send({ username, password });
  if (res.status !== 200) throw new Error(`login failed for ${username}: ${res.status}`);
  return res.body.token as string;
}

export const api = (token?: string) => ({
  get: (url: string) => withAuth(request(app).get(url), token),
  post: (url: string) => withAuth(request(app).post(url), token),
  patch: (url: string) => withAuth(request(app).patch(url), token),
  delete: (url: string) => withAuth(request(app).delete(url), token),
});
function withAuth<T extends request.Test>(r: T, token?: string): T {
  return token ? (r.set("Authorization", `Bearer ${token}`) as T) : r;
}
