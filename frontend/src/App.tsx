import { lazy, Suspense } from "react";
import { HashRouter, Navigate, Route, Routes } from "react-router-dom";
import { ToastProvider } from "./components/ui/ToastProvider";
import { ErrorBoundary } from "./components/ui/ErrorBoundary";
import { FullPageLoading } from "./components/ui/StatusViews";
import { AuthProvider, useAuth } from "./components/auth/AuthProvider";
import { ProtectedRoute } from "./components/auth/ProtectedRoute";
import { DepartmentProvider } from "./components/departments/DepartmentProvider";
import { defaultPathForRole } from "./lib/permissions";
import { PushBridge } from "./components/notifications/PushBridge";
import { TimerAlarmDialog } from "./components/notifications/TimerAlarmDialog";

const LoginPage = lazy(() => import("./pages/Login"));
const WorkspacePage = lazy(() => import("./pages/Workspace"));
const Dashboard = lazy(() => import("./pages/Dashboard"));
const ProductionTasksPage = lazy(() => import("./pages/ProductionTasks"));
const FeedbackPage = lazy(() => import("./pages/Feedback"));
const GoalsPage = lazy(() => import("./pages/Goals"));
const InventoryPage = lazy(() => import("./pages/Inventory"));
const LowStockPage = lazy(() => import("./pages/LowStock"));
const WithdrawalsPage = lazy(() => import("./pages/Withdrawals"));
const SalesPage = lazy(() => import("./pages/Sales"));
const SalesOrdersPage = lazy(() => import("./pages/SalesOrders"));
const AgentOrdersPage = lazy(() => import("./pages/AgentOrders"));
const AgentSupervisorOrdersPage = lazy(() => import("./pages/AgentSupervisorOrders"));
const SalesFollowUpPage = lazy(() => import("./pages/SalesFollowUp"));
const AgentAccountsPage = lazy(() => import("./pages/AgentAccounts"));
const GeneralAccountsPage = lazy(() => import("./pages/GeneralAccounts"));
const SchedulePage = lazy(() => import("./pages/Schedule"));
const TeamDashboardPage = lazy(() => import("./pages/TeamDashboard"));
const ManageUsersPage = lazy(() => import("./pages/ManageUsers"));
const ProfilePage = lazy(() => import("./pages/Profile"));
const NotificationsPage = lazy(() => import("./pages/Notifications"));

function HomeRoute() {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  return <Navigate to={defaultPathForRole(user)} replace />;
}

function FallbackRoute() {
  const { user } = useAuth();
  return <Navigate to={user ? defaultPathForRole(user) : "/login"} replace />;
}

export default function App() {
  return (
    <ErrorBoundary>
      <ToastProvider>
        <HashRouter>
          <AuthProvider>
            <DepartmentProvider>
              <PushBridge />
              <TimerAlarmDialog />
              <Suspense fallback={<FullPageLoading />}>
                <Routes>
                  <Route path="/login" element={<LoginPage />} />
                  <Route path="/" element={<HomeRoute />} />
                  <Route path="/workspace" element={<ProtectedRoute page="workspace"><WorkspacePage /></ProtectedRoute>} />
                  <Route path="/daily-tasks" element={<ProtectedRoute page="dailyTasks"><Dashboard /></ProtectedRoute>} />
                  <Route path="/production-tasks" element={<ProtectedRoute page="productionTasks"><ProductionTasksPage /></ProtectedRoute>} />
                  <Route path="/notifications" element={<ProtectedRoute page="notifications"><NotificationsPage /></ProtectedRoute>} />
                  <Route path="/feedback" element={<ProtectedRoute page="feedback"><FeedbackPage /></ProtectedRoute>} />
                  <Route path="/goals" element={<ProtectedRoute page="goals"><GoalsPage /></ProtectedRoute>} />
                  <Route path="/schedule" element={<ProtectedRoute page="schedule"><SchedulePage /></ProtectedRoute>} />
                  {/* لوحة الفريق (Dashboard في القائمة). إدارة الحسابات في /manage-users */}
                  <Route path="/users" element={<ProtectedRoute page="users"><TeamDashboardPage /></ProtectedRoute>} />
                  <Route path="/inventory" element={<ProtectedRoute page="inventory"><InventoryPage /></ProtectedRoute>} />
                  <Route path="/inventory/shortages" element={<ProtectedRoute page="inventory"><LowStockPage /></ProtectedRoute>} />
                  <Route path="/withdrawals" element={<ProtectedRoute page="withdrawals"><WithdrawalsPage /></ProtectedRoute>} />
                  <Route path="/sales" element={<ProtectedRoute page="sales"><SalesPage /></ProtectedRoute>} />
                  <Route path="/sales-orders" element={<ProtectedRoute page="salesOrders"><SalesOrdersPage /></ProtectedRoute>} />
                  <Route path="/agent-orders" element={<ProtectedRoute page="agentOrders"><AgentOrdersPage /></ProtectedRoute>} />
                  <Route path="/agent-supervisor" element={<ProtectedRoute page="agentSupervisor"><AgentSupervisorOrdersPage /></ProtectedRoute>} />
                  <Route path="/sales-follow-up" element={<ProtectedRoute page="salesFollowUp"><SalesFollowUpPage /></ProtectedRoute>} />
                  <Route path="/agent-accounts" element={<ProtectedRoute page="agentAccounts"><AgentAccountsPage /></ProtectedRoute>} />
                  <Route path="/general-accounts" element={<ProtectedRoute page="generalAccounts"><GeneralAccountsPage /></ProtectedRoute>} />
                  <Route path="/manage-users" element={<ProtectedRoute page="manageUsers"><ManageUsersPage /></ProtectedRoute>} />
                  <Route path="/dashboard" element={<Navigate to="/users" replace />} />
                  <Route path="/profile" element={<ProtectedRoute page="profile"><ProfilePage /></ProtectedRoute>} />
                  <Route path="*" element={<FallbackRoute />} />
                </Routes>
              </Suspense>
            </DepartmentProvider>
          </AuthProvider>
        </HashRouter>
      </ToastProvider>
    </ErrorBoundary>
  );
}
