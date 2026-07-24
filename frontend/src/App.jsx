import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { createHashRouter, RouterProvider, Outlet, Navigate } from "react-router-dom";

import "./App.css";
import { ThemeProvider } from "./context/ThemeContext";
import { ToastProvider } from "./components/ui/ToastProvider";
import { ConfirmProvider } from "./components/ui/ConfirmDialog";
import { UserSettingsProvider } from "./context/UserSettingsContext";

import AppShell from "./components/layout/AppShell";

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
const LeaveReviewPage = lazy(() => import("./pages/LeaveReviewPage"));
const SchedulingInboxPage = lazy(() => import("./pages/SchedulingInboxPage"));
const CallWorkspacePage = lazy(() => import("./pages/calls/CallWorkspacePage"));
const ConfirmationRoundPage = lazy(() => import("./pages/calls/ConfirmationRoundPage"));
const DayCloseoutPage = lazy(() => import("./pages/operations/DayCloseoutPage"));
const RecurringTripsPage = lazy(() => import("./pages/calls/RecurringTripsPage"));
const PatientsPage = lazy(() => import("./pages/PatientsPage"));
const PatientWorkspacePage = lazy(() => import("./pages/patients/PatientWorkspacePage"));
const PatientFormPage = lazy(() => import("./pages/patients/PatientFormPage"));
const UserManualPage = lazy(() => import("./pages/UserManualPage"));
const EmployeesPage = lazy(() => import("./pages/EmployeesPage"));
const EmployeeWorkspacePage = lazy(() => import("./pages/employees/EmployeeWorkspacePage"));
const EmployeeFormPage = lazy(() => import("./pages/employees/EmployeeFormPage"));
const CrewPlannerPage = lazy(() => import("./pages/CrewPlannerPage"));
const DispatchBoardPage = lazy(() => import("./pages/DispatchBoardPage"));
const TasksPage = lazy(() => import("./pages/TasksPage"));
const CalendarPage = lazy(() => import("./pages/CalendarPage"));
const VehiclesListPage = lazy(() => import("./pages/fleet/VehiclesListPage"));
const VehicleWorkspacePage = lazy(() => import("./pages/fleet/VehicleWorkspacePage"));
const VehicleFormPage = lazy(() => import("./pages/fleet/VehicleFormPage"));

function PageFallback() {
  return <div className="page-stack"><p className="text-muted">Loading...</p></div>;
}

import {
  getCurrentUser,
  fetchCurrentUser,
  saveCurrentUser,
  logoutUser,
  hasSupervisorAccess,
  hasPatientAccess,
  hasEmployeeAccess,
  hasLeaveReviewAccess,
  hasCrewPlannerAccess,
  hasAdminAccess,
  hasDispatchAccess,
  hasFleetAccess,
} from "./api/authApi";

function App() {
  // The cached user gives the shell something to render immediately; the
  // session cookie is the actual identity, so it is confirmed with the server
  // below. A cached entry that no longer has a session behind it is discarded.
  const [currentUser, setCurrentUser] = useState(getCurrentUser());

  useEffect(() => {
    let cancelled = false;
    fetchCurrentUser().then((user) => {
      if (cancelled) return;
      if (user) {
        saveCurrentUser(user);
        setCurrentUser(user);
      } else {
        // No live session — clear the cache so the UI cannot show a signed-in
        // shell whose every request would come back 401.
        logoutUser();
        setCurrentUser(null);
      }
    });
    return () => { cancelled = true; };
  }, []);

  // Save logged-in user in application state.
  const handleLogin = (user) => {
    setCurrentUser(user);
  };

  // End the session server-side (the cookie is HttpOnly, so only the server can
  // clear it), then drop local state.
  const handleLogout = async () => {
    await logoutUser();
    setCurrentUser(null);
  };

  // Wrap protected pages inside the shared application layout.
  const ProtectedLayout = ({ children }) => {
    if (!currentUser) {
      return <Navigate to="/login" replace />;
    }

    return (
      <AppShell currentUser={currentUser} onLogout={handleLogout}>
        {children}
      </AppShell>
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
      <AppShell currentUser={currentUser} onLogout={handleLogout}>
        {children}
      </AppShell>
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
      <AppShell currentUser={currentUser} onLogout={handleLogout}>
        {children}
      </AppShell>
    );
  };

  // Leave review: HR and admin decide, a supervisor gets the read-only overview.
  const LeaveRoute = ({ children }) => {
    if (!currentUser) {
      return <Navigate to="/login" replace />;
    }

    if (!hasLeaveReviewAccess(currentUser)) {
      return <Navigate to="/home" replace />;
    }

    return (
      <AppShell currentUser={currentUser} onLogout={handleLogout}>
        {children}
      </AppShell>
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
      <AppShell currentUser={currentUser} onLogout={handleLogout}>
        {children}
      </AppShell>
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
      <AppShell currentUser={currentUser} onLogout={handleLogout}>
        {children}
      </AppShell>
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
      <AppShell currentUser={currentUser} onLogout={handleLogout}>
        {children}
      </AppShell>
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
      <AppShell currentUser={currentUser} onLogout={handleLogout}>
        {children}
      </AppShell>
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
      <AppShell currentUser={currentUser} onLogout={handleLogout}>
        {children}
      </AppShell>
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
      <AppShell currentUser={currentUser} onLogout={handleLogout}>
        {children}
      </AppShell>
    );
  };

  // A data router (createHashRouter) rather than the <HashRouter> component, so
  // pages can use useBlocker to guard sidebar navigation against unsaved edits.
  // Rebuilt only when the signed-in user changes (login/logout already remount),
  // so ordinary navigation keeps one stable router instance.
  const router = useMemo(() => createHashRouter([
    {
      // Root layout: one Suspense boundary for every lazy page.
      element: <Suspense fallback={<PageFallback />}><Outlet /></Suspense>,
      children: [
        { path: "/", element: <Navigate to="/home" replace /> },

        // Kiosk — no auth required, but pass currentUser for the Back button.
        { path: "/kiosk", element: <KioskPage currentUser={currentUser} /> },

        { path: "/login", element: <LoginRoute><LoginPage onLogin={handleLogin} /></LoginRoute> },

        { path: "/home", element: <ProtectedLayout><HomePage currentUser={currentUser} /></ProtectedLayout> },
        { path: "/call-form", element: <PatientRoute><CallFormPage /></PatientRoute> },
        { path: "/patients", element: <PatientRoute><PatientsPage /></PatientRoute> },

        // "new" and ":patientId/edit" precede ":patientId", or the workspace
        // route swallows them and looks up a patient named "new".
        { path: "/patients/new", element: <PatientRoute><PatientFormPage currentUser={currentUser} /></PatientRoute> },
        { path: "/patients/:patientId/edit", element: <PatientRoute><PatientFormPage currentUser={currentUser} /></PatientRoute> },
        { path: "/patients/:patientId", element: <PatientRoute><PatientWorkspacePage currentUser={currentUser} /></PatientRoute> },

        { path: "/calls", element: <PatientRoute><CallsPage currentUser={currentUser} /></PatientRoute> },
        { path: "/supervisor", element: <SupervisorRoute><SupervisorDashboardPage /></SupervisorRoute> },
        { path: "/manual", element: <ProtectedLayout><UserManualPage currentUser={currentUser} /></ProtectedLayout> },

        { path: "/employees", element: <EmployeeRoute><EmployeesPage /></EmployeeRoute> },
        { path: "/leave", element: <LeaveRoute><LeaveReviewPage currentUser={currentUser} /></LeaveRoute> },
        // "new" and ":employeeId/edit" must precede ":employeeId".
        { path: "/employees/new", element: <EmployeeRoute><EmployeeFormPage currentUser={currentUser} /></EmployeeRoute> },
        { path: "/employees/:employeeId/edit", element: <EmployeeRoute><EmployeeFormPage currentUser={currentUser} /></EmployeeRoute> },
        { path: "/employees/:employeeId", element: <EmployeeRoute><EmployeeWorkspacePage currentUser={currentUser} /></EmployeeRoute> },

        { path: "/users", element: <AdminRoute><UserManagementPage /></AdminRoute> },
        { path: "/crew-planner", element: <CrewPlannerRoute><CrewPlannerPage /></CrewPlannerRoute> },
        { path: "/dispatch", element: <DispatchRoute><DispatchBoardPage /></DispatchRoute> },
        { path: "/scheduling-inbox", element: <DispatchRoute><SchedulingInboxPage currentUser={currentUser} /></DispatchRoute> },
        { path: "/recurring-trips", element: <DispatchRoute><RecurringTripsPage /></DispatchRoute> },
        { path: "/day-closeout", element: <DispatchRoute><DayCloseoutPage currentUser={currentUser} /></DispatchRoute> },
        { path: "/confirmation-round", element: <DispatchRoute><ConfirmationRoundPage currentUser={currentUser} /></DispatchRoute> },
        { path: "/calls/:callId", element: <DispatchRoute><CallWorkspacePage currentUser={currentUser} /></DispatchRoute> },
        { path: "/notifications", element: <ProtectedLayout><NotificationSettingsPage currentUser={currentUser} /></ProtectedLayout> },
        { path: "/payroll", element: <EmployeeRoute><PayrollPage /></EmployeeRoute> },
        { path: "/compliance", element: <EmployeeRoute><ComplianceDashboardPage currentUser={currentUser} /></EmployeeRoute> },
        { path: "/audit", element: <EmployeeRoute><AuditLogPage currentUser={currentUser} /></EmployeeRoute> },
        { path: "/tasks", element: <TasksRoute><TasksPage currentUser={currentUser} /></TasksRoute> },

        { path: "/fleet/vehicles", element: <FleetRoute><VehiclesListPage currentUser={currentUser} /></FleetRoute> },
        // "new" must precede ":vehicleId".
        { path: "/fleet/vehicles/new", element: <FleetRoute><VehicleFormPage currentUser={currentUser} /></FleetRoute> },
        { path: "/fleet/vehicles/:vehicleId/edit", element: <FleetRoute><VehicleFormPage currentUser={currentUser} /></FleetRoute> },
        { path: "/fleet/vehicles/:vehicleId", element: <FleetRoute><VehicleWorkspacePage currentUser={currentUser} /></FleetRoute> },

        { path: "/calendar", element: <ProtectedLayout><CalendarPage currentUser={currentUser} /></ProtectedLayout> },

        { path: "*", element: <Navigate to="/home" replace /> },
      ],
    },
  ]), [currentUser]);

  return (
    <ThemeProvider>
    <ToastProvider>
    <ConfirmProvider>
    <UserSettingsProvider currentUser={currentUser}>
      <RouterProvider router={router} />
    </UserSettingsProvider>
    </ConfirmProvider>
    </ToastProvider>
    </ThemeProvider>
  );
}

export default App;