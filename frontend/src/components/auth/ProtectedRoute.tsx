import type { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import type { AppPage } from "../../lib/permissions";
import { canAccessPage, defaultPathForRole } from "../../lib/permissions";
import { useAuth } from "./AuthProvider";

export function ProtectedRoute({ page, children }: { page: AppPage; children: ReactNode }) {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  if (!canAccessPage(user.accessRole, page)) {
    return <Navigate to={defaultPathForRole(user.accessRole)} replace />;
  }
  return <>{children}</>;
}
