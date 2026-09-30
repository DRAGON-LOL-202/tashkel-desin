import { useCallback, useEffect, useState } from "react";
import type { TeamMember } from "../types";
import { useAuth } from "../components/auth/AuthProvider";
import { usersService } from "../services/usersService";
import { errorMessage } from "../lib/api";

/**
 * أعضاء الفريق يأتون من جدول Users (المفعّلون فقط) — أي مستخدم جديد يظهر تلقائياً بدون مهام وهمية.
 * المصمم لا يستدعي /users (403)، فيرى نفسه فقط.
 */
export function useTeamMembers() {
  const { user } = useAuth();
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!user) return;
    setError(null);
    try {
      if (user.accessRole === "designer") {
        setMembers([user]);
      } else {
        const all = await usersService.list();
        setMembers(all.filter((member) => member.isActive));
      }
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    void load();
  }, [load]);

  return { members, loading, error, reload: load };
}
