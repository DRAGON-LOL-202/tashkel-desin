import { api, tokenStore } from "../lib/api";
import type { ApiUser, TeamMember } from "../types";
import { toMember } from "./usersService";

export const authService = {
  hasToken(): boolean {
    return tokenStore.get() !== null;
  },

  async login(username: string, password: string): Promise<TeamMember> {
    const { token, user } = await api<{ token: string; user: ApiUser }>("/auth/login", {
      method: "POST",
      body: { username, password },
      skipAuthEvent: true,
    });
    tokenStore.set(token);
    return toMember(user);
  },

  /** المستخدم الحالي كما يحدده الـ backend من التوكن (لا نثق بما في المتصفح) */
  async me(): Promise<TeamMember> {
    const { user } = await api<{ user: ApiUser }>("/auth/me");
    return toMember(user);
  },

  async logout(): Promise<void> {
    try {
      await api<{ ok: true }>("/auth/logout", { method: "POST", skipAuthEvent: true });
    } catch {
      // logout بلا حالة: يكفي إتلاف التوكن محلياً حتى لو فشل الطلب
    } finally {
      tokenStore.clear();
    }
  },
};
