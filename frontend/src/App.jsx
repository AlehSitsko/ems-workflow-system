import { lazy, Suspense, useState } from "react";
import { HashRouter, Routes, Route, Navigate } from "react-router-dom";

import "./App.css";
import { ThemeProvider } from "./context/ThemeContext";
import { ToastProvider } from "./components/ui/ToastProvider";
import { ConfirmProvider } from "./components/ui/ConfirmDialog";
import { UserSettingsProvider } from "./context/UserSettingsContext";

import AppLayout from "./components/layout/AppLayout";

import HomePage from "./pages/HomePage";
import CallFormPage from "./pages/CallFormPage";
import CallsPage from "./pages/CallsPage";
import SupervisorDashboardPage from "./pages/SupervisorDashboardPage";
import LoginPage from "./pages/LoginPage";
import UserManagementPage from "./pages/UserManagementPage";
import NotificationSettingsPage from "./pages/NotificationSettingsPage";
import KioskPage from "./pages/KioskPage";
import PayrollPage from "./pages/PayrollPage";
import ComplianceDashboardPage from "./pages/ComplianceDashboardPage";
import AuditLogPage from "./pages/AuditLogPage";

// Lazy-loaded: the heaviest pages, split into their own chunks so the initial
// bundle stays smaller. AppLayout/sidebar render immediately either way —
// only the page content area shows the fallback while the chunk loads.
const PatientsPage = lazy(() => import("./pages/PatientsPage"));
const UserManualPage = lazy(() => import("./pages/UserManualPage"));
const EmployeesPage = lazy(() => import("./pages/EmployeesPage"));
const CrewPlannerPage = lazy(() => import("./pages/CrewPlannerPage"));
const DispatchBoardPage = lazy(() => import("./pages/DispatchBoardPage"));
const TasksPage = lazy(() => import("./pages/TasksPage"));
const CalendarPage = lazy(() => import("./pages/CalendarPage"));
const VehiclesListPage = lazy(() => import("./pages/fleet/VehiclesListPage"));
const VehicleWorkspacePage = lazy(() => import("./pages/fleet/VehicleWorkspacePage"));

function PageFallback() {
  return <div className="page-stack"><p className="text-muted">Loading...</p></div>;
}

import {
  getCurrentUser,
  logoutUser,
  hasSupervisorAccess,
  hasPatientAccess,
  hasEmployeeAccess,
  hasCrewPlannerAccess,
  hasAdminAccess,
  hasDispatchAccess,
  hasFleetAccess,
} from "./api/authApi";

function App() {
  const [currentUser, setCurrentUser] = useState(getCurrentUser());

  // Save logged-in user in application state.
  const handleLogin = (user) => {
    setCurrentUser(user);
  };

  // Clear logged-in user from localStorage and application state.
  const handleLogout = () => {
    logoutUser();
    setCurrentUser(null);
  };

  // Wrap protected pages inside the shared application layout.
  const ProtectedLayout = ({ children }) => {
    if (!currentUser) {
      return <Navigate to="/login" replace />;
    }

    return (
      <AppLayout currentUser={currentUser} onLogout={handleLogout}>
        {children}
      </AppLayout>
    );
  };

  // Prevent logged-in users from staying on the login page.
  const LoginRoute = ({ children }) => {
    if (currentUser) {
      return <Navigate to="/home" replace />;
    }

    return children;
  };

  // Protect pages that should only be available to patient/call users.
  const PatientRoute = ({ children }) => {
    if (!currentUser) {
      return <Navigate to="/login" replace />;
    }

    if (!hasPatientAccess(currentUser)) {
      return <Navigate to="/home" replace />;
    }

    return (
      <AppLayout currentUser={currentUser} onLogout={handleLogout}>
        {children}
      </AppLayout>
    );
  };

  // Protect pages that should only be available to employee record users.
  const EmployeeRoute = ({ children }) => {
    if (!currentUser) {
      return <Navigate to="/login" replace />;
    }

    if (!hasEmployeeAccess(currentUser)) {
      return <Navigate to="/home" replace />;
    }

    return (
      <AppLayout currentUser={currentUser} onLogout={handleLogout}>
        {children}
      </AppLayout>
    );
  };

  // Protect pages that should only be available to crew planning users.
  const CrewPlannerRoute = ({ children }) => {
    if (!currentUser) {
      return <Navigate to="/login" replace />;
    }

    if (!hasCrewPlannerAccess(currentUser)) {
      return <Navigate to="/home" replace />;
    }

    return (
      <AppLayout currentUser={currentUser} onLogout={handleLogout}>
        {children}
      </AppLayout>
    );
  };

  // Protect dispatch board — not accessible to HR.
  const DispatchRoute = ({ children }) => {
    if (!currentUser) {
      return <Navigate to="/login" replace />;
    }

    if (!hasDispatchAccess(currentUser)) {
      return <Navigate to="/home" replace />;
    }

    return (
      <AppLayout currentUser={currentUser} onLogout={handleLogout}>
        {children}
      </AppLayout>
    );
  };

  // Protect Fleet pages. Dispatchers get read-only visibility; HR has no
  // operational reason to see the fleet.
  const FleetRoute = ({ children }) => {
    if (!currentUser) {
      return <Navigate to="/login" replace />;
    }

    if (!hasFleetAccess(currentUser)) {
      return <Navigate to="/home" replace />;
    }

    return (
      <AppLayout currentUser={currentUser} onLogout={handleLogout}>
        {children}
      </AppLayout>
    );
  };

  // Protect supervisor-level pages.
  const SupervisorRoute = ({ children }) => {
    if (!currentUser) {
      return <Navigate to="/login" replace />;
    }

    if (!hasSupervisorAccess(currentUser)) {
      return <Navigate to="/home" replace />;
    }

    return (
      <AppLayout currentUser={currentUser} onLogout={handleLogout}>
        {children}
      </AppLayout>
    );
  };

  // Protect the Tasks module — visible to admin/supervisor/hr/dispatcher,
  // each scoped to their own visible tasks server-side.
  const TasksRoute = ({ children }) => {
    if (!currentUser) {
      return <Navigate to="/login" replace />;
    }

    if (!["admin", "supervisor", "hr", "dispatcher"].includes(currentUser.role)) {
      return <Navigate to="/home" replace />;
    }

    return (
      <AppLayout currentUser={currentUser} onLogout={handleLogout}>
        {children}
      </AppLayout>
    );
  };

  // Protect admin-only pages.
  const AdminRoute = ({ children }) => {
    if (!currentUser) {
      return <Navigate to="/login" replace />;
    }

    if (!hasAdminAccess(currentUser)) {
      return <Navigate to="/home" replace />;
    }

    return (
      <AppLayout currentUser={currentUser} onLogout={handleLogout}>
        {children}
      </AppLayout>
    );
  };

  return (
    <ThemeProvider>
    <ToastProvider>
    <ConfirmProvider>
    <UserSettingsProvider currentUser={currentUser}>
    <HashRouter>
      <Suspense fallback={<PageFallback />}>
      <Routes>
        <Route path="/" element={<Navigate to="/home" replace />} />

        {/* Kiosk — no auth required, but pass currentUser for Back button */}
        <Route path="/kiosk" element={<KioskPage currentUser={currentUser} />} />

        <Route
          path="/login"
          element={
            <LoginRoute>
              <LoginPage onLogin={handleLogin} />
            </LoginRoute>
          }
        />

        <Route
          path="/home"
          element={
            <ProtectedLayout>
              <HomePage currentUser={currentUser} />
            </ProtectedLayout>
          }
        />

        <Route
          path="/call-form"
          element={
            <PatientRoute>
              <CallFormPage />
            </PatientRoute>
          }
        />

        <Route
          path="/patients"
          element={
            <PatientRoute>
              <PatientsPage />
            </PatientRoute>
          }
        />

        <Route
          path="/calls"
          element={
            <PatientRoute>
              <CallsPage currentUser={currentUser} />
            </PatientRoute>
          }
        />

        <Route
          path="/supervisor"
          element={
            <SupervisorRoute>
              <SupervisorDashboardPage />
            </SupervisorRoute>
          }
        />

        <Route
          path="/manual"
          element={
            <ProtectedLayout>
              <UserManualPage currentUser={currentUser} />
            </ProtectedLayout>
          }
        />

        <Route
          path="/employees"
          element={
            <EmployeeRoute>
              <EmployeesPage />
            </EmployeeRoute>
          }
        />

        <Route
          path="/users"
          element={
            <AdminRoute>
              <UserManagementPage />
            </AdminRoute>
          }
        />

        <Route
          path="/crew-planner"
          element={
            <CrewPlannerRoute>
              <CrewPlannerPage />
            </CrewPlannerRoute>
          }
        />

        <Route
          path="/dispatch"
          element={
            <DispatchRoute>
              <DispatchBoardPage />
            </DispatchRoute>
          }
        />

        <Route
          path="/notifications"
          element={
            <ProtectedLayout>
              <NotificationSettingsPage currentUser={currentUser} />
            </ProtectedLayout>
          }
        />

        <Route
          path="/payroll"
          element={
            <EmployeeRoute>
              <PayrollPage />
            </EmployeeRoute>
          }
        />

        <Route
          path="/compliance"
          element={
            <EmployeeRoute>
              <ComplianceDashboardPage currentUser={currentUser} />
            </EmployeeRoute>
          }
        />

        <Route
          path="/audit"
          element={
            <EmployeeRoute>
              <AuditLogPage currentUser={currentUser} />
            </EmployeeRoute>
          }
        />

        <Route
          path="/tasks"
          element={
            <TasksRoute>
              <TasksPage currentUser={currentUser} />
            </TasksRoute>
          }
        />

        <Route
          path="/fleet/vehicles"
          element={
            <FleetRoute>
              <VehiclesListPage currentUser={currentUser} />
            </FleetRoute>
          }
        />

        <Route
          path="/fleet/vehicles/:vehicleId"
          element={
            <FleetRoute>
              <VehicleWorkspacePage currentUser={currentUser} />
            </FleetRoute>
          }
        />

        <Route
          path="/calendar"
          element={
            <ProtectedLayout>
              <CalendarPage currentUser={currentUser} />
            </ProtectedLayout>
          }
        />

        <Route path="*" element={<Navigate to="/home" replace />} />
      </Routes>
      </Suspense>
    </HashRouter>
    </UserSettingsProvider>
    </ConfirmProvider>
    </ToastProvider>
    </ThemeProvider>
  );
}

export default App;