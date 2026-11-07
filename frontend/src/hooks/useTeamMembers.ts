import { useCallback, useEffect, useState } from "react";
import type { TaskBoard, TeamMember } from "../types";
import { useAuth } from "../components/auth/AuthProvider";
import { usersService } from "../services/usersService";
import { errorMessage } from "../lib/api";
import { useLiveSync } from "./useLiveSync";

/**
 * أعضاء الفريق يأتون من جدول Users (المفعّلون فقط) — أي مستخدم جديد يظهر تلقائياً بدون مهام وهمية.
 * غير الإدارة (مصمم/تعبئة/مشغل) لا يستدعي /users (403)، فيرى نفسه فقط.
 * board: لوحة التصميم (الافتراضية، showTaskCard) أو لوحة الإنتاج (showProductionCard).
 */
export function useTeamMembers(board: TaskBoard = "design") {
  const { user } = useAuth();
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchMembers = useCallback(async (): Promise<TeamMember[] | null> => {
    if (!user) return null;
    // الكرت يظهر لمن حدّد المدير ظهوره فقط (showTaskCard للتصميم، showProductionCard للإنتاج)
    const hasCard = (member: TeamMember) => (board === "production" ? member.showProductionCard : member.showTaskCard);
    if (user.accessRole !== "admin" && user.accessRole !== "manager") return hasCard(user) ? [user] : [];
    const all = await usersService.list();
    return all.filter((member) => member.isActive && hasCard(member));
  }, [user, board]);

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
