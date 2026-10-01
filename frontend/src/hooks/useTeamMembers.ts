import { useCallback, useEffect, useState } from "react";
import type { TeamMember } from "../types";
import { useAuth } from "../components/auth/AuthProvider";
import { usersService } from "../services/usersService";
import { errorMessage } from "../lib/api";
import { useLiveSync } from "./useLiveSync";

/**
 * أعضاء الفريق يأتون من جدول Users (المفعّلون فقط) — أي مستخدم جديد يظهر تلقائياً بدون مهام وهمية.
 * المصمم لا يستدعي /users (403)، فيرى نفسه فقط.
 */
export function useTeamMembers() {
  const { user } = useAuth();
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchMembers = useCallback(async (): Promise<TeamMember[] | null> => {
    if (!user) return null;
    if (user.accessRole === "designer") return [user];
    const all = await usersService.list();
    return all.filter((member) => member.isActive);
  }, [user]);

  const load = useCallback(async () => {
    if (!user) return;
    setError(null);
    try {
      const next = await fetchMembers();
      if (next) setMembers(next);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [user, fetchMembers]);

  // تحديث تلقائي صامت عند إضافة/تعديل مستخدم من أي شخص
  const silentSync = useCallback(async () => {
    try {
      const next = await fetchMembers();
      if (next) setMembers(next);
    } catch {
      // نُبقي القائمة الحالية
    }
  }, [fetchMembers]);
  useLiveSync(silentSync);

  useEffect(() => {
    void load();
  }, [load]);

  return { members, loading, error, reload: load };
}
