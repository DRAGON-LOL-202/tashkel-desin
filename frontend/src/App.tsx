import { HashRouter, Navigate, Route, Routes } from "react-router-dom";
import { ToastProvider } from "./components/ui/ToastProvider";
import { AuthProvider, useAuth } from "./components/auth/AuthProvider";
import { ProtectedRoute } from "./components/auth/ProtectedRoute";
import { defaultPathForRole } from "./lib/permissions";
import Dashboard from "./pages/Dashboard";
import ProductionTasksPage from "./pages/ProductionTasks";
import FeedbackPage from "./pages/Feedback";
import GoalsPage from "./pages/Goals";
import ProductsPage from "./pages/Products";
import InventoryPage from "./pages/Inventory";
import LowStockPage from "./pages/LowStock";
import WithdrawalsPage from "./pages/Withdrawals";
import SalesPage from "./pages/Sales";
import SalesOrdersPage from "./pages/SalesOrders";
import AgentOrdersPage from "./pages/AgentOrders";
import SalesFollowUpPage from "./pages/SalesFollowUp";
import AgentAccountsPage from "./pages/AgentAccounts";
import GeneralAccountsPage from "./pages/GeneralAccounts";
import SchedulePage from "./pages/Schedule";
import TeamDashboardPage from "./pages/TeamDashboard";
import ManageUsersPage from "./pages/ManageUsers";
import LoginPage from "./pages/Login";
import ProfilePage from "./pages/Profile";
import NotificationsPage from "./pages/Notifications";
import { PushBridge } from "./components/notifications/PushBridge";
import { TimerAlarmDialog } from "./components/notifications/TimerAlarmDialog";

function HomeRoute() {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  const home = defaultPathForRole(user);
  return home !== "/" ? <Navigate to={home} replace /> : <Dashboard />;
}

function FallbackRoute() {
  const { user } = useAuth();
  return <Navigate to={user ? defaultPathForRole(user) : "/login"} replace />;
}

export default function App() {
  return (
    <ToastProvider>
      <HashRouter>
        <AuthProvider>
          <PushBridge />
          <TimerAlarmDialog />
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/" element={<HomeRoute />} />
            <Route path="/daily-tasks" element={<ProtectedRoute page="dailyTasks"><Dashboard /></ProtectedRoute>} />
            <Route path="/production-tasks" element={<ProtectedRoute page="productionTasks"><ProductionTasksPage /></ProtectedRoute>} />
            <Route path="/notifications" element={<ProtectedRoute page="notifications"><NotificationsPage /></ProtectedRoute>} />
            <Route path="/feedback" element={<ProtectedRoute page="feedback"><FeedbackPage /></ProtectedRoute>} />
            <Route path="/goals" element={<ProtectedRoute page="goals"><GoalsPage /></ProtectedRoute>} />
            <Route path="/schedule" element={<ProtectedRoute page="schedule"><SchedulePage /></ProtectedRoute>} />
            {/* لوحة الفريق (Dashboard في القائمة). إدارة الحسابات في /manage-users */}
            <Route path="/users" element={<ProtectedRoute page="users"><TeamDashboardPage /></ProtectedRoute>} />
            <Route path="/products" element={<ProtectedRoute page="products"><ProductsPage /></ProtectedRoute>} />
            <Route path="/inventory" element={<ProtectedRoute page="inventory"><InventoryPage /></ProtectedRoute>} />
            <Route path="/inventory/shortages" element={<ProtectedRoute page="inventory"><LowStockPage /></ProtectedRoute>} />
            <Route path="/withdrawals" element={<ProtectedRoute page="withdrawals"><WithdrawalsPage /></ProtectedRoute>} />
            <Route path="/sales" element={<ProtectedRoute page="sales"><SalesPage /></ProtectedRoute>} />
            <Route path="/sales-orders" element={<ProtectedRoute page="salesOrders"><SalesOrdersPage /></ProtectedRoute>} />
            <Route path="/agent-orders" element={<ProtectedRoute page="agentOrders"><AgentOrdersPage /></ProtectedRoute>} />
            <Route path="/sales-follow-up" element={<ProtectedRoute page="salesFollowUp"><SalesFollowUpPage /></ProtectedRoute>} />
            <Route path="/agent-accounts" element={<ProtectedRoute page="agentAccounts"><AgentAccountsPage /></ProtectedRoute>} />
            <Route path="/general-accounts" element={<ProtectedRoute page="generalAccounts"><GeneralAccountsPage /></ProtectedRoute>} />
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
