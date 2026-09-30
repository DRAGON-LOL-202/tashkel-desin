import { HashRouter, Navigate, Route, Routes } from "react-router-dom";
import { ToastProvider } from "./components/ui/ToastProvider";
import { AuthProvider, useAuth } from "./components/auth/AuthProvider";
import { ProtectedRoute } from "./components/auth/ProtectedRoute";
import { defaultPathForRole } from "./lib/permissions";
import Dashboard from "./pages/Dashboard";
import FeedbackPage from "./pages/Feedback";
import GoalsPage from "./pages/Goals";
import SchedulePage from "./pages/Schedule";
import TeamDashboardPage from "./pages/TeamDashboard";
import ManageUsersPage from "./pages/ManageUsers";
import LoginPage from "./pages/Login";
import ProfilePage from "./pages/Profile";

function HomeRoute() {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  return user.accessRole === "designer" ? <Navigate to="/daily-tasks" replace /> : <Dashboard />;
}

function FallbackRoute() {
  const { user } = useAuth();
  return <Navigate to={user ? defaultPathForRole(user.accessRole) : "/login"} replace />;
}

export default function App() {
  return (
    <ToastProvider>
      <HashRouter>
        <AuthProvider>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/" element={<HomeRoute />} />
            <Route path="/daily-tasks" element={<ProtectedRoute page="dailyTasks"><Dashboard /></ProtectedRoute>} />
            <Route path="/feedback" element={<ProtectedRoute page="feedback"><FeedbackPage /></ProtectedRoute>} />
            <Route path="/goals" element={<ProtectedRoute page="goals"><GoalsPage /></ProtectedRoute>} />
            <Route path="/schedule" element={<ProtectedRoute page="schedule"><SchedulePage /></ProtectedRoute>} />
            {/* لوحة الفريق (Dashboard في القائمة). إدارة الحسابات في /manage-users */}
            <Route path="/users" element={<ProtectedRoute page="users"><TeamDashboardPage /></ProtectedRoute>} />
            <Route path="/manage-users" element={<ProtectedRoute page="manageUsers"><ManageUsersPage /></ProtectedRoute>} />
            <Route path="/dashboard" element={<Navigate to="/users" replace />} />
            <Route path="/profile" element={<ProtectedRoute page="profile"><ProfilePage /></ProtectedRoute>} />
            <Route path="*" element={<FallbackRoute />} />
          </Routes>
        </AuthProvider>
      </HashRouter>
    </ToastProvider>
  );
}
