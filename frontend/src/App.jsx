import { useState } from "react";
import { HashRouter, Routes, Route, NavLink, Navigate } from "react-router-dom";

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

import {
  getCurrentUser,
  logoutUser,
  hasSupervisorAccess,
} from "./api/authApi";

function App() {
  const [currentUser, setCurrentUser] = useState(getCurrentUser());

  // Add Bootstrap active styling to the current navigation link.
  const getNavLinkClass = ({ isActive }) =>
    `nav-link${isActive ? " active fw-semibold" : ""}`;

  // Save logged-in user in application state.
  const handleLogin = (user) => {
    setCurrentUser(user);
  };

  // Clear logged-in user from localStorage and application state.
  const handleLogout = () => {
    logoutUser();
    setCurrentUser(null);
  };

  // Protect pages from being opened without login.
  const ProtectedRoute = ({ children }) => {
    if (!currentUser) {
      return <Navigate to="/login" replace />;
    }

    return children;
  };

  // Prevent logged-in users from staying on the login page.
  const LoginRoute = ({ children }) => {
    if (currentUser) {
      return <Navigate to="/home" replace />;
    }

    return children;
  };

  // Protect supervisor-level pages.
  const SupervisorRoute = ({ children }) => {
    if (!currentUser) {
      return <Navigate to="/login" replace />;
    }

    if (!hasSupervisorAccess(currentUser)) {
      return <Navigate to="/home" replace />;
    }

    return children;
  };

  // Protect admin-only pages.
  const AdminRoute = ({ children }) => {
    if (!currentUser) {
      return <Navigate to="/login" replace />;
    }

    if (currentUser.role !== "admin") {
      return <Navigate to="/home" replace />;
    }

    return children;
  };

  return (
    // HashRouter is used because the app is deployed to GitHub Pages.
    // It keeps routes after the # symbol and prevents 404 errors on refresh.
    <HashRouter>
      <nav className="navbar navbar-expand-lg navbar-dark bg-dark">
        <div className="container-fluid px-3">
          <span className="navbar-brand fw-bold">EMS Workflow System</span>

          {currentUser && (
            <>
              <div className="navbar-nav ms-3">
                <NavLink to="/home" className={getNavLinkClass}>
                  Home
                </NavLink>

                <NavLink to="/call-form" className={getNavLinkClass}>
                  Call Form
                </NavLink>

                <NavLink to="/patients" className={getNavLinkClass}>
                  Patients
                </NavLink>

                <NavLink to="/calls" className={getNavLinkClass}>
                  Calls
                </NavLink>

                {hasSupervisorAccess(currentUser) && (
                  <>
                    <NavLink to="/supervisor" className={getNavLinkClass}>
                      Supervisor
                    </NavLink>

                    <NavLink to="/employees" className={getNavLinkClass}>
                      Employees
                    </NavLink>
                  </>
                )}

                {currentUser.role === "admin" && (
                  <NavLink to="/users" className={getNavLinkClass}>
                    Users
                  </NavLink>
                )}

                <NavLink to="/crew-planner" className={getNavLinkClass}>
                  Crew Planner
                </NavLink>

                <NavLink to="/manual" className={getNavLinkClass}>
                  User Manual
                </NavLink>
              </div>

              <div className="ms-auto d-flex align-items-center gap-3">
                <span className="text-light small">
                  {currentUser.display_name} ({currentUser.role})
                </span>

                <button
                  type="button"
                  className="btn btn-outline-light btn-sm"
                  onClick={handleLogout}
                >
                  Logout
                </button>
              </div>
            </>
          )}
        </div>
      </nav>

      <Routes>
        <Route path="/" element={<Navigate to="/home" replace />} />

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
            <ProtectedRoute>
              <HomePage currentUser={currentUser} />
            </ProtectedRoute>
          }
        />

        <Route
          path="/call-form"
          element={
            <ProtectedRoute>
              <CallFormPage />
            </ProtectedRoute>
          }
        />

        <Route
          path="/patients"
          element={
            <ProtectedRoute>
              <PatientsPage />
            </ProtectedRoute>
          }
        />

        <Route
          path="/calls"
          element={
            <ProtectedRoute>
              <CallsPage />
            </ProtectedRoute>
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
            <ProtectedRoute>
              <UserManualPage />
            </ProtectedRoute>
          }
        />

        <Route
          path="/employees"
          element={
            <SupervisorRoute>
              <EmployeesPage />
            </SupervisorRoute>
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
            <ProtectedRoute>
              <CrewPlannerPage />
            </ProtectedRoute>
          }
        />

        <Route path="*" element={<Navigate to="/home" replace />} />
      </Routes>
    </HashRouter>
  );
}

export default App;