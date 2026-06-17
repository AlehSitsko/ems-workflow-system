import { useState } from "react";
import { HashRouter, Routes, Route, Navigate } from "react-router-dom";

import "./App.css";

import AppLayout from "./components/layout/AppLayout";

import HomePage from "./pages/HomePage";
import CallFormPage from "./pages/CallFormPage";
import PatientsPage from "./pages/PatientsPage";
import CallsPage from "./pages/CallsPage";
import UserManualPage from "./pages/UserManualPage";
import EmployeesPage from "./pages/EmployeesPage";
import CrewPlannerPage from "./pages/CrewPlannerPage";
import SupervisorDashboardPage from "./pages/SupervisorDashboardPage";
import LoginPage from "./pages/LoginPage";
import UserManagementPage from "./pages/UserManagementPage";
import DispatchBoardPage from "./pages/DispatchBoardPage";
import NotificationSettingsPage from "./pages/NotificationSettingsPage";
import KioskPage from "./pages/KioskPage";

import {
  getCurrentUser,
  logoutUser,
  hasSupervisorAccess,
  hasPatientAccess,
  hasEmployeeAccess,
  hasCrewPlannerAccess,
  hasAdminAccess,
  hasDispatchAccess,
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
    // HashRouter is used because the app is deployed to GitHub Pages.
    // It keeps routes after the # symbol and prevents 404 errors on refresh.
    <HashRouter>
      <Routes>
        <Route path="/" element={<Navigate to="/home" replace />} />

        {/* Kiosk — no auth required */}
        <Route path="/kiosk" element={<KioskPage />} />

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
              <CallsPage />
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
              <UserManualPage />
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

        <Route path="*" element={<Navigate to="/home" replace />} />
      </Routes>
    </HashRouter>
  );
}

export default App;